# xDBML Ecosystem

Tools, libraries, and integrations built around the xDBML specification. This page is community-maintained — add yours by [opening a pull request](https://github.com/xdbml/xdbml-spec/pulls) that edits this file.

## Parsers and grammars

*No published parsers yet.* The reference ANTLR4 grammar is documented in the [Grammar](/grammar/) section. Implementations in TypeScript, Python, Java, Go, and Rust are anticipated and welcome.

## Generators

Tools that consume xDBML and produce target-format output (DDL, schema documents, validators):

*No published generators yet.* Anticipated targets include:

- Oracle, PostgreSQL, SQL Server, Snowflake DDL
- MongoDB collection validators (`$jsonSchema`)
- Avro schema files
- Parquet schema files
- JSON Schema documents
- OpenAPI `components.schemas` definitions
- Neo4j / Cypher schema declarations
- ODCS data contract schema sections

## Importers

Tools that consume existing schemas (DDL, JSON Schema, Avro, etc.) and produce xDBML:

*No published importers yet.*

## Editors and IDE support

Plugins and language-server implementations for editing xDBML in popular tools:

*No published editor integrations yet.* VS Code, JetBrains IDEs, and Vim/Neovim syntax-highlighting contributions are particularly welcome.

## Modeling tools

Visual and interactive tools that consume or produce xDBML:

- **[Hackolade Studio](https://hackolade.com/products.html)** — the steward of the xDBML specification; will ship xDBML import/export in a forthcoming release

## Adjacent-standard bridges

Integration tooling that bridges xDBML to adjacent standards:

*No published bridges yet.* Particularly desired:

- **xDBML ↔ ODCS** — bidirectional bridge to the Open Data Contract Standard
- **xDBML ↔ OSI** — bridge to the Open Semantic Interchange schema layer
- **xDBML ↔ dbt** — generation of dbt model `schema.yml` from xDBML
- **xDBML ↔ Confluent Schema Registry** — Avro round-trip via the Confluent Schema Registry

## Adding your project

To add a project to this page:

1. Verify the project is publicly available with an open-source license (preferably Apache 2.0, MIT, BSD, or similar permissive license)
2. Open a pull request editing this file under the appropriate section
3. Include: project name (with link), one-sentence description, license, and maintainer (organization or individual)
4. If the project supports a partial subset of xDBML v0.1, note which constructs are supported

The xDBML maintainers will review for accuracy and license verification, then merge. There is no formal certification — listing on this page indicates community awareness of the project, not endorsement.
