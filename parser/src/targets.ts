/**
 * Targets (spec §5.1, §5.2).
 *
 * The target vocabulary the passes share: the relational targets of §5.1
 * (for the referenced-key rule of §11.17), the targets that take no
 * internal definitions (§15.8.4), the canonical names behind the aliases
 * of §5.1, and the effective target of a declaration (§5.2). Split from
 * constraints.ts in v0.6.5 so that definitions.ts can use it without an
 * import cycle.
 */

import type {
  ContainerDeclaration,
  SettingValue,
  XDbmlDocument,
} from './ast.ts';


/** Canonical relational targets and their aliases, lower-cased (§5.1). */
const RELATIONAL_TARGETS = new Set([
  'oracle',
  'postgresql', 'postgres', 'pg',
  'sql server', 'mssql', 'microsoft sql server', 't-sql',
  'mysql', 'mariadb', 'sqlite',
  'db2', 'ibm db2', 'db2 luw', 'db2 for z/os', 'db2 z/os',
  'teradata', 'snowflake', 'databricks',
  'bigquery', 'google bigquery',
  'redshift', 'amazon redshift',
  'synapse analytics', 'azure synapse',
  'timescaledb',
]);

/** True for a target name the §11.17 rule covers. Unlisted names are not relational. */
export function isRelationalTarget (name: string): boolean {
  return RELATIONAL_TARGETS.has(name.trim().toLowerCase());
}

export function settingValues (v: SettingValue | null): string[] {
  if (!v) return [];
  if (v.kind === 'ListValue') return v.items.flatMap(settingValues);
  if (v.kind === 'StringValue') return [v.value];
  if (v.kind === 'IdentifierValue') return [v.value];
  return [];
}

/** The document-wide target when the Project declares exactly one. */
export function projectTarget (doc: XDbmlDocument): string | undefined {
  for (const s of doc.statements) {
    if (s.kind !== 'ProjectDeclaration') continue;
    for (const item of s.body) {
      if (item.kind === 'Setting' && (item.name === 'targets' || item.name === 'database_type')) {
        const values = settingValues(item.value).filter((x) => x !== '');
        return values.length === 1 ? values[0] : undefined;
      }
    }
  }
  return undefined;
}

export function effectiveTarget (container: ContainerDeclaration | undefined, project: string | undefined): string | undefined {
  const own = container?.settings.find((s) => s.name === 'target');
  const values = settingValues(own?.value ?? null).filter((x) => x !== '');
  return values[0] ?? project;
}

/**
 * The effective target of a declaration (spec §5.2): the `target:` of its
 * Container, else the Project's target when the Project declares exactly
 * one. Undefined when neither applies. A declaration outside any Container,
 * `Table core.users` included, takes the Project's target.
 */
export function declarationTarget (doc: XDbmlDocument, container?: ContainerDeclaration): string | undefined {
  return effectiveTarget(container, projectTarget(doc));
}

/** Aliases of §5.1, lower-cased, mapped to their canonical name. */
const TARGET_ALIASES: Record<string, string> = {
  postgres: 'postgresql', pg: 'postgresql',
  mssql: 'sql server', 'microsoft sql server': 'sql server', 't-sql': 'sql server',
  'ibm db2': 'db2', 'db2 luw': 'db2', 'db2 z/os': 'db2 for z/os',
  'google bigquery': 'bigquery', 'amazon redshift': 'redshift', 'azure synapse': 'synapse analytics',
  mongo: 'mongodb', 'aws documentdb': 'documentdb', cosmos: 'cosmos db', 'azure cosmos db': 'cosmos db',
  'apache cassandra': 'cassandra', 'amazon neptune': 'neptune',
  'apache avro': 'avro', 'apache parquet': 'parquet',
  'protocol buffers': 'protobuf', proto: 'protobuf', swagger: 'openapi',
};

export function canonicalTarget (name: string): string {
  const key = name.trim().toLowerCase();
  return TARGET_ALIASES[key] ?? key;
}

/** Every target the Project declares, or undefined when it declares none. */
export function projectTargets (doc: XDbmlDocument): string[] | undefined {
  for (const s of doc.statements) {
    if (s.kind !== 'ProjectDeclaration') continue;
    for (const item of s.body) {
      if (item.kind === 'Setting' && (item.name === 'targets' || item.name === 'database_type')) {
        const values = settingValues(item.value).filter((x) => x !== '');
        return values.length > 0 ? values : undefined;
      }
    }
  }
  return undefined;
}

/** Canonical names of the non-relational targets that take no internal definitions (§15.8.4). */
const NO_DEFINITIONS_TARGETS = new Set(['cassandra', 'scylladb', 'neo4j', 'memgraph', 'neptune', 'janusgraph']);

/**
 * True for a target in which a `definitions` block is an error (§15.8.4):
 * the relational targets of §5.1, Cassandra, ScyllaDB, Neo4j, Memgraph,
 * Neptune and JanusGraph, under their canonical names or aliases. A name
 * outside the §5.1 table is not excluded.
 */
export function isDefinitionsExcludedTarget (name: string): boolean {
  return isRelationalTarget(name) || NO_DEFINITIONS_TARGETS.has(canonicalTarget(name));
}
