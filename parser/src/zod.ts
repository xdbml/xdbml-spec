/**
 * This module exports the Zod types that define the xDBML abstract syntax tree (AST).
 * Each type name ends with `ZodType`. The TypeScript types inferred from them live in
 * `./ast.ts` under the unsuffixed names.
 *
 * Descriptions are used to tell AI models what each construct is and how to read and write it.
 * 
 * The types that do not define the xDBML AST do NOT belong to this module.
 */

import * as z from 'zod';
import { GRANULARITY_VALUES } from './keywords.ts';
import { classifyModuleSource } from './module-resolver.ts';

/**
 * Checks taken from grammar/xDBML.g4 that the node shapes alone do not
 * express. The grammar is permissive about cross-reference rules (a name
 * must resolve, a key field must exist); those stay in the parser's
 * semantic pass. These checks cover the closed vocabularies and the
 * minimum shapes the grammar itself requires.
 */

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const DOTTED_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
/** `'0..*'`, `'1..1'`, `'2..5'`. The upper bound may be `*`. */
const CARDINALITY_STRING = /^\d+\.\.(?:\d+|\*)$/;

const GRANULARITY = new Set<string>(GRANULARITY_VALUES);

/** Grammar `elementType`, plus `supertypegroup`, which the grammar's comment omits and the parser accepts. */
const IMPORT_ELEMENT_TYPES = new Set([
  'table', 'entity', 'collection', 'record',
  'enum', 'tablepartial', 'note',
  'schema', 'container', 'tablegroup', 'supertypegroup',
  'type', 'edge', 'view', 'diagramview',
  'field',
]);

const DIAGRAM_CATEGORY_BY_KEYWORD: Record<string, string> = {
  tables: 'Tables',
  views: 'Views',
  containers: 'Containers',
  schemas: 'Containers',
  tablegroups: 'TableGroups',
  supertypegroups: 'SupertypeGroups',
  notes: 'Notes',
};

function settingText (value: { kind: string } | null): string | undefined {
  if (!value) return undefined;
  if (
    (value.kind === 'IdentifierValue' || value.kind === 'StringValue')
    && 'value' in value
    && typeof value.value === 'string'
  ) {
    return value.value;
  }
  return undefined;
}

/* -------------------------------------------------------------------------
 * Positions
 * ----------------------------------------------------------------------- */

export const PositionZodType = z.object({
  /** 1-indexed line number */
  line: z.number(),
  /** 1-indexed column number */
  column: z.number(),
  /** 0-indexed byte offset into the source */
  offset: z.number(),
});

export const SpanZodType = z.object({
  start: PositionZodType,
  end: PositionZodType,
});

/* -------------------------------------------------------------------------
 * Shared literals
 * ----------------------------------------------------------------------- */

/** Maximum cardinality of a relationship. */
export const CardinalityOperatorZodType = z
  .enum(['<', '>', '-', '<>'])
  .describe(
    "Maximum cardinality of a relationship, read from the left endpoint to the right. `<` is one on the left and many on the right, `>` is many on the left and one on the right, `-` is one on each side, and `<>` is many on each side. Optionality is inferred from whether the foreign key is nullable.",
  );

/** Keyword synonym for a Container. */
export const ContainerKeywordZodType = z
  .enum([
    'Container',
    'Schema',
    'Database',
    'Keyspace',
    'Namespace',
    'Dataset',
    'Bucket',
  ])
  .describe(
    "Keyword synonym for a Container. `Container` is canonical. `Schema`, `Database`, `Keyspace`, `Namespace`, `Dataset`, and `Bucket` are target-native synonyms. All seven are the same construct; this value is the keyword that was written.",
  );

/** Keyword synonym for an Entity. */
export const EntityKeywordZodType = z
  .enum(['Table', 'Entity', 'Collection', 'Record'])
  .describe(
    "Keyword synonym for an Entity. `Entity` is canonical. `Table`, `Collection`, and `Record` are target-native synonyms. All four are the same construct; this value is the keyword that was written.",
  );

/** Canonical category of a DiagramView. */
export const DiagramViewCategoryNameZodType = z
  .enum([
    'Tables',
    'Views',
    'Containers',
    'TableGroups',
    'SupertypeGroups',
    'Notes',
  ])
  .describe(
    "Canonical category of a DiagramView. `Tables` lists entities, `Views` database views, `Containers` containers, `TableGroups` table groups, `SupertypeGroups` supertype groups, and `Notes` sticky notes. A category written `Schemas` is this same `Containers` value; the written keyword is kept on the category, not here. A category appears at most once, and those two names count as one.",
  );

/* -------------------------------------------------------------------------
 * Settings
 *
 * The settings vocabulary is open. Every setting is a name/value pair.
 * A pure flag such as `pk` has `value: null`. `implied` is set on a
 * setting the parser added, such as `not null` on a v0.6 primary key.
 * ----------------------------------------------------------------------- */

/** A string setting value. */
export const StringValueZodType = z
  .object({
    kind: z.literal('StringValue'),
    /** The string content, with surrounding quotes already stripped. */
    value: z
      .string()
      .describe(
        "The string content, with surrounding quotes already stripped. Single quotes use `\\'` and `\\\\` escapes. An unquoted hex color (`#3498DB`) is also a string.",
      ),
    /** True when the source used a triple-quoted multi-line string. */
    multiline: z
      .boolean()
      .describe(
        "True when the source used a triple-quoted multi-line string (`'''...'''`), which normalizes indentation.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A string setting value: a single-quoted literal, a triple-quoted multi-line literal, or an unquoted hex color.",
  );

/** A number setting value. */
export const NumberValueZodType = z
  .object({
    kind: z.literal('NumberValue'),
    value: z
      .string()
      .describe(
        "The number as written: an integer, a decimal, or scientific notation, such as `42`, `3.14`, `-100`, or `1.5e10`.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A number setting value. The text is preserved as written rather than parsed into a binary number.",
  );

/** A boolean setting value. */
export const BooleanValueZodType = z
  .object({
    kind: z.literal('BooleanValue'),
    value: z.boolean().describe("The boolean literal `true` or `false`."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe("A boolean setting value, `true` or `false`.");

/** The null value. */
export const NullValueZodType = z
  .object({
    kind: z.literal('NullValue'),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The null literal, written `null`. A flag such as `pk` is different: its setting value is absent, not this node.",
  );

/** A bare or dotted identifier used as a setting value. */
export const IdentifierValueZodType = z
  .object({
    kind: z.literal('IdentifierValue'),
    value: z
      .string()
      .describe(
        "A bare or dotted identifier used as a value, such as a target name (`Oracle`) or a referential action (`cascade`). A bare identifier matches `[A-Za-z_][A-Za-z0-9_]*`.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A bare or dotted identifier used as a setting value. Target names are matched case-insensitively; other identifiers keep the case that was written.",
  );

/** A backtick-quoted engine-native expression. */
export const ExpressionValueZodType = z
  .object({
    kind: z.literal('ExpressionValue'),
    expression: z
      .string()
      .describe(
        "The expression text inside the backticks, without the backticks, such as `SYSTIMESTAMP` or `uuid_generate_v4()`.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A backtick-quoted engine-native expression. It passes through as written. A check expression is not this form: a check is a quoted string, and backticks are only an alias for that string.",
  );

/** A `.field_name` path segment. */
export const PathFieldZodType = z
  .object({
    kind: z.literal('PathField'),
    name: z
      .string()
      .describe(
        "The field name this segment navigates into. Identifiers are case-sensitive. A non-identifier name is quoted in the source (`.'quoted name'`).",
      ),
    isAlternativeSelector: z
      .boolean()
      .optional()
      .describe(
        "True when this segment is a `.AlternativeName` selector through a polymorphic alternative. Polymorphic paths require the selector explicitly.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A `.field_name` path segment: navigate into a named field. `.AlternativeName` is the selector through a polymorphic alternative.",
  );

/** A `.[N]` path segment. */
export const PathArrayIndexZodType = z
  .object({
    kind: z.literal('PathArrayIndex'),
    index: z
      .number()
      .describe(
        "The zero-based position of one array or tuple element. Tuple positions must be explicit.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A `.[N]` path segment: one positional array or tuple element. Positions are zero-indexed.",
  );

/** A `.[*]` path segment. */
export const PathArrayWildcardZodType = z
  .object({
    kind: z.literal('PathArrayWildcard'),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A `.[*]` path segment: every element of an array, or every value of a map. A Ref source path that crosses a homogeneous array must write this explicitly. An index path may omit it; the omission means the same iteration.",
  );

/** A `.["literal_key"]` path segment. */
export const PathMapKeyZodType = z
  .object({
    kind: z.literal('PathMapKey'),
    key: z.string().describe("The map key this segment selects."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe("A `.[\"literal_key\"]` path segment: one map key.");

/** One step of a field path. */
export const PathSegmentZodType = z
  .discriminatedUnion('kind', [
    PathFieldZodType,
    PathArrayIndexZodType,
    PathArrayWildcardZodType,
    PathMapKeyZodType,
  ])
  .describe(
    "One step of a field path. A path is an ordered list of these segments. Implicit forms are normalized to explicit forms during parsing.",
  );

/** One end of a relationship. */
export const RefEndpointZodType = z
  .object({
    kind: z.literal('RefEndpoint'),
    path: z
      .array(PathSegmentZodType)
      .min(1)
      .describe(
        "The endpoint path: `container.entity.field`, continuing into nested fields when the relationship does. An endpoint may name an entity rather than an attribute.",
      ),
    compositeFields: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        "The field names of a composite foreign key, written in parentheses in the source, such as `customers.(id, country_code)`. Absent when the endpoint names a single field or an entity.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "One end of a relationship. The path is `container.entity.field` and may continue into nested fields. A composite foreign key lists its fields in parentheses.",
  );

/** An inline `ref:` on a field. */
export const RefValueZodType = z
  .object({
    kind: z.literal('RefValue'),
    operator: CardinalityOperatorZodType,
    target: RefEndpointZodType,
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "An inline `ref:` on a field, written `[ref: > other.entity.field]`. Settings are not supported on an inline ref, except `foreign_master` beside it in the same settings block.",
  );

/** A list of setting values. */
export const ListValueZodType = z
  .object({
    kind: z.literal('ListValue'),
    get items (): z.ZodArray<typeof SettingValueZodType> {
      return z.array(SettingValueZodType).min(1);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A list of setting values, such as `targets: [Oracle, MongoDB]` or `tags:` and `synonyms:`.",
  );

/** The value of a setting. */
export const SettingValueZodType = z
  .discriminatedUnion('kind', [
    StringValueZodType,
    NumberValueZodType,
    BooleanValueZodType,
    NullValueZodType,
    IdentifierValueZodType,
    ExpressionValueZodType,
    ListValueZodType,
    RefValueZodType,
  ])
  .describe(
    "The value of a setting that has one: a string, number, boolean, `null`, an identifier, an expression, a list, or an inline `ref:`.",
  );

/** A name/value pair inside brackets. */
export const SettingZodType = z
  .object({
    kind: z.literal('Setting'),
    name: z
      .string()
      .describe(
        "The setting name, written in lowercase. Names match any casing when read. `required` is stored as `not null`. The vocabulary is open; the `x_` prefix marks an intentional custom property, and a name without that prefix is still accepted.",
      ),
    nameSource: z
      .string()
      .describe(
        "The setting name as written. Keywords match any casing; this keeps that spelling.",
      ),
    value: SettingValueZodType.nullable().describe(
      "The setting value. Null when the setting is a flag, such as `pk`, `not null`, `unique`, or `increment`.",
    ),
    implied: z
      .literal(true)
      .optional()
      .describe(
        "Present when the parser added this setting. A primary-key field carries `not null` whether or not the document writes it. A document being written should write `not null` itself and leave this absent.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A name/value pair inside brackets. The colon separates the name from the value. A flag is a marker with no value, such as `pk`, `not null`, `unique`, `increment`, `inactive`, or `foreign_master`. The settings vocabulary is open.",
  )
  .superRefine((setting, ctx) => {
    if (setting.name === 'granularity') {
      const text = settingText(setting.value);
      if (text === undefined || !GRANULARITY.has(text.toLowerCase())) {
        ctx.addIssue(`granularity must be one of: ${GRANULARITY_VALUES.join(', ')}.`);
      }
    }
    if (setting.name === 'source_cardinality' || setting.name === 'target_cardinality') {
      const text = setting.value?.kind === 'StringValue' ? setting.value.value : undefined;
      if (text === undefined || !CARDINALITY_STRING.test(text)) {
        ctx.addIssue("source_cardinality and target_cardinality are quoted strings such as '0..*', '1..1', or '2..5'.");
      }
    }
  });

/* -------------------------------------------------------------------------
 * Notes, partials, and the small nodes type expressions embed
 * ----------------------------------------------------------------------- */

/** An inline note. */
export const NoteBlockZodType = z
  .object({
    kind: z.literal('NoteBlock'),
    body: z
      .string()
      .describe("The note text, with surrounding quotes already stripped."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "An inline note on a Project, Container, Entity, Field, Index, Edge, View, Type, TableGroup, or SupertypeGroup.",
  );

/** A standalone sticky note. */
export const NoteDeclarationZodType = z
  .object({
    kind: z.literal('NoteDeclaration'),
    name: z
      .string()
      .optional()
      .describe(
        "The note's name, when it has one. A named note can be listed under `Notes` in a DiagramView.",
      ),
    body: z
      .string()
      .describe("The note text, with surrounding quotes already stripped."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A standalone sticky note: a canvas annotation, not an inline note on another construct.",
  );

/** Injection of a TablePartial. */
export const PartialInjectionZodType = z
  .object({
    kind: z.literal('PartialInjection'),
    partialName: z
      .string()
      .describe("The TablePartial name after `~`."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "Injection of a TablePartial with `~name`. The entity or edge receives its own copy of the partial's fields. Local fields override the partial; among partials, the last one injected wins.",
  );

/** A scalar type name passed through as written. */
export const ScalarTypeZodType = z
  .object({
    kind: z.literal('ScalarType'),
    name: z
      .string()
      .describe(
        "The scalar type name, passed through as written: `int`, `varchar`, a BSON name such as `objectId`, or a container-qualified Enum such as `core.job_status`. A DBML array suffix with no space, such as `text[]`, stays part of the name.",
      ),
    params: z
      .array(z.string())
      .optional()
      .describe(
        "The parenthesized parameters, such as `(19, 4)` on `decimal`. Each parameter is kept as written.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A scalar type name passed through as written. Generators lower it for a target. Parameters stay with the name.",
  );

/** A reference to a declared Type. */
export const NamedTypeReferenceZodType = z
  .object({
    kind: z.literal('NamedTypeReference'),
    name: z
      .string()
      .describe(
        "The bare name of a declared Type. Built-in type keywords take precedence; a named type cannot shadow them.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A reference to a declared Type by bare name. Built-in type keywords take precedence; a named type cannot shadow them.",
  );

/** The `null` member of a `union`. */
export const NullTypeLiteralZodType = z
  .object({
    kind: z.literal('NullTypeLiteral'),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The token `null` inside a `union`, meaning the null literal is one permitted runtime type. This is type membership, not the `null` or `not null` cardinality setting.",
  );

/** A member of a `union`: a scalar, a named type, or `null`. */
const UnionMemberZodType = z
  .discriminatedUnion('kind', [ScalarTypeZodType, NamedTypeReferenceZodType, NullTypeLiteralZodType])
  .describe(
    "A member of a `union`: a scalar type, a named type, or `null`.",
  );

/* -------------------------------------------------------------------------
 * Type expressions
 *
 * `FieldDeclaration` and the structural types refer to each other.
 * Getter return types name the schema (`typeof TypeExpression`) so the
 * cycle stays a reference and declaration emit can print it.
 * ----------------------------------------------------------------------- */

/** A field. */
export const FieldDeclarationZodType = z
  .object({
    kind: z.literal('FieldDeclaration'),
    name: z
      .string()
      .describe(
        "The field name. Identifiers are case-sensitive. No keyword is reserved as a field name.",
      ),
    nameQuoted: z
      .boolean()
      .describe(
        "True when the name was a double-quoted identifier, which may contain any character, such as `\"first name\"`.",
      ),
    get type (): typeof TypeExpressionZodType {
      return TypeExpressionZodType;
    },
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A field: `field_name field_type [field_settings]`. A field carries a type expression. Complex types nest further fields, and the depth is unbounded. `pk` (also written `primary key`) is the primary key of this field alone, and `unique` is a unique key of this field alone. A key that has a name, or that covers several fields, belongs in `constraints`. Do not mark `pk` on several fields of one entity; that form is accepted when read and must not be written. `[unique]` on several fields declares a separate key per field. A primary-key field is not null whether or not `not null` is written. `null`, `not null`, and `required` say whether the field must be present and non-null; `required` means `not null`. `default` is the default value, and `increment` marks auto-increment. `note` is documentation. `ref` is an inline relationship. `check` is a check on this field, written as a quoted expression. Validation settings are `pattern` and `format` (strings), `minLength` and `maxLength` (strings), `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, and `multipleOf` (numbers), `enum` (a fixed list of values), `minItems`, `maxItems`, and `uniqueItems` (arrays), and `minProperties` and `maxProperties` (objects). AI-readiness settings are `synonyms` (other names for the same field), `business_term` (a glossary term or URL), `granularity` (`year`, `quarter`, `month`, `week`, `day`, `hour`, `minute`, `second`, `millisecond`, `microsecond`, or `nanosecond`), and `tags` (a list of classification labels).",
  );

/** A field, note, or partial injection inside a structural type or named Type. */
const NestedBodyItemZodType = z
  .discriminatedUnion('kind', [FieldDeclarationZodType, NoteBlockZodType, PartialInjectionZodType])
  .describe(
    "A field, a note, or a `~partial` injection inside an `object`, a `json` schema, or a named Type.",
  );

/** A structured value. */
export const ObjectTypeZodType = z
  .object({
    kind: z.literal('ObjectType'),
    keyword: z
      .enum(['object', 'struct', 'record'])
      .describe(
        "The keyword that was written. `object` is primary; `struct` and `record` are aliases. All three are the same structured value.",
      ),
    get fields (): z.ZodArray<typeof NestedBodyItemZodType> {
      return z.array(NestedBodyItemZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A structured value. `object` is the primary keyword; `struct` and `record` are aliases. Encoding is chosen by the target. This is an abstract structural type, unlike `json`, which names a physical JSON column.",
  );

/** An ordered list. */
export const ArrayTypeZodType = z
  .object({
    kind: z.literal('ArrayType'),
    keyword: z
      .enum(['array', 'list'])
      .describe(
        "The keyword that was written. `array` is primary; `list` is an alias.",
      ),
    get elementType (): z.ZodOptional<typeof TypeExpressionZodType> {
      return TypeExpressionZodType.optional();
    },
    elementName: z
      .string()
      .optional()
      .describe(
        "The name of the element when the array is written `array [name type]`, such as `line_item` in `array [line_item object { ... }]`.",
      ),
    elementSettings: z
      .array(SettingZodType)
      .optional()
      .describe(
        "Settings on the element type itself, as in `array [int [not null]]`.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "An ordered list. `array` is primary; `list` is an alias. `array [T]` is one element type. `array [T1, T2]` is shorthand for `array [union [T1, T2]]`, and those members must be scalars, named types, or `null`. `array [name object { ... }]` names the element.",
  );

/** One position of a heterogeneous tuple. */
export const TupleElementZodType = z
  .object({
    kind: z.literal('TupleElement'),
    position: z
      .number()
      .describe(
        "The zero-based position. Positions must form a contiguous range starting at 0.",
      ),
    name: z.string().describe("The name of this positional element."),
    get type (): typeof TypeExpressionZodType {
      return TypeExpressionZodType;
    },
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "One position of a heterogeneous tuple, written `[N] name type`. Positions are zero-indexed.",
  );

/** A heterogeneous tuple. */
export const TupleTypeZodType = z
  .object({
    kind: z.literal('TupleType'),
    elements: z
      .array(TupleElementZodType)
      .min(2)
      .describe(
        "The positional elements, written `[N] name type`. At least two. Positions are zero-indexed and must form a contiguous range starting at 0.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A heterogeneous tuple: an array whose elements are positional, `[0] name type`, `[1] name type`. The keyword in the source is still `array` or `list`.",
  )
  .superRefine((tuple, ctx) => {
    const positions = new Set(tuple.elements.map((el) => el.position));
    for (let i = 0; i < tuple.elements.length; i++) {
      if (!positions.has(i)) {
        ctx.addIssue('Tuple positions are unique, zero-indexed, and form the contiguous range 0 through n-1.');
        return;
      }
    }
  });

/** A key-value collection. */
export const MapTypeZodType = z
  .object({
    kind: z.literal('MapType'),
    keyword: z
      .enum(['map', 'dict', 'dictionary'])
      .describe(
        "The keyword that was written. `map` is primary; `dict` and `dictionary` are aliases.",
      ),
    get keyType (): typeof TypeExpressionZodType {
      return TypeExpressionZodType;
    },
    get valueType (): typeof TypeExpressionZodType {
      return TypeExpressionZodType;
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A key-value collection: `map [keyType, valueType]`. The comma between the two types is required. `dict` and `dictionary` are aliases of `map`.",
  );

/** A unique collection. */
export const SetTypeZodType = z
  .object({
    kind: z.literal('SetType'),
    get elementType (): typeof TypeExpressionZodType {
      return TypeExpressionZodType;
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A unique collection: `set [elementType]`. A comma-separated list of scalar or named types is shorthand for a `union`, as it is for `array`.",
  );

/** A scalar type union. */
export const UnionTypeZodType = z
  .object({
    kind: z.literal('UnionType'),
    members: z
      .array(UnionMemberZodType)
      .min(2)
      .describe(
        "The member types, in source order. At least two. Order is significant: the runtime type is the discriminator. Members are scalars, named types, or `null`.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A scalar type union: `union [T1, T2, null]`. Element order is significant, and the runtime type is the discriminator. Members are scalars, named types, or `null`. For a mix of object shapes, use `oneOf`.",
  );

/** One named alternative of `oneOf`, `anyOf`, or `allOf`. */
export const PolymorphicAlternativeZodType = z
  .object({
    kind: z.literal('PolymorphicAlternative'),
    name: z
      .string()
      .describe(
        "The alternative's name. A path selects it with `.AlternativeName`.",
      ),
    get type (): typeof TypeExpressionZodType {
      return TypeExpressionZodType;
    },
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe("One named alternative of a `oneOf`, `anyOf`, or `allOf`.");

/** Exactly one of N alternatives. */
export const OneOfTypeZodType = z
  .object({
    kind: z.literal('OneOfType'),
    alternatives: z
      .array(PolymorphicAlternativeZodType)
      .min(1)
      .describe("The named alternatives. Exactly one applies."),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "Exactly one of the named alternatives. The `discriminator` setting names the attribute whose value selects the alternative. That attribute need not be declared.",
  );

/** One or more alternatives may apply. */
export const AnyOfTypeZodType = z
  .object({
    kind: z.literal('AnyOfType'),
    alternatives: z
      .array(PolymorphicAlternativeZodType)
      .min(1)
      .describe("The named alternatives. One or more may apply."),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe("One or more of the named alternatives may apply.");

/** The value must satisfy every listed alternative. */
export const AllOfTypeZodType = z
  .object({
    kind: z.literal('AllOfType'),
    alternatives: z
      .array(PolymorphicAlternativeZodType)
      .min(1)
      .describe(
        "The named alternatives. The value must satisfy every one.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe("The value must satisfy all of the named alternatives.");

/** JSON storage. */
export const JsonTypeZodType = z
  .object({
    kind: z.literal('JsonType'),
    keyword: z
      .enum(['json', 'jsonb', 'variant'])
      .describe(
        "The storage keyword. `json` is generic JSON storage. `jsonb` is PostgreSQL binary JSON. `variant` is Snowflake semi-structured storage.",
      ),
    get fields (): z.ZodOptional<z.ZodArray<typeof NestedBodyItemZodType>> {
      return z.array(NestedBodyItemZodType).optional().describe(
        "The known schema of the JSON value. Omit it when the value is opaque.",
      );
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "JSON storage. Without a block the value is opaque. With a block the schema is known. `json`, `jsonb`, and `variant` name a physical storage choice, unlike `object`, which is an abstract structural type.",
  );

/** The type of a field. */
export const TypeExpressionZodType = z
  .discriminatedUnion('kind', [
    ScalarTypeZodType,
    ObjectTypeZodType,
    ArrayTypeZodType,
    TupleTypeZodType,
    MapTypeZodType,
    SetTypeZodType,
    UnionTypeZodType,
    OneOfTypeZodType,
    AnyOfTypeZodType,
    AllOfTypeZodType,
    JsonTypeZodType,
    NamedTypeReferenceZodType,
  ])
  .describe(
    "The type of a field: a scalar name, a BSON type, a named Type, `object`, `array`, `map`, or `set`, a `union`, `oneOf`, `anyOf`, or `allOf`, or `json`, `jsonb`, or `variant`.",
  );

/* -------------------------------------------------------------------------
 * Indexes, checks, constraints, records
 * ----------------------------------------------------------------------- */

/** An index on a field path. */
export const IndexPathComponentZodType = z
  .object({
    kind: z.literal('IndexPathComponent'),
    path: z
      .array(PathSegmentZodType)
      .min(1)
      .describe(
        "The indexed field path. A homogeneous array may omit `.[*]`; that omission means iteration over every element.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe("An index on a field path. Index paths use the field path syntax.");

/** An expression index. */
export const IndexExpressionComponentZodType = z
  .object({
    kind: z.literal('IndexExpressionComponent'),
    expression: z
      .string()
      .describe(
        "The engine expression inside the backticks, without the backticks.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "An expression index: a backtick-quoted engine expression, such as `` (`id*2`) ``.",
  );

/** One component of an index entry. */
export const IndexComponentZodType = z
  .discriminatedUnion('kind', [IndexPathComponentZodType, IndexExpressionComponentZodType])
  .describe("One component of an index entry: a field path or an expression.");

/** One index. */
export const IndexEntryZodType = z
  .object({
    kind: z.literal('IndexEntry'),
    components: z
      .array(IndexComponentZodType)
      .min(1)
      .describe(
        "The indexed components. One component is a single-field or expression index. Several components are a composite index, written `(col1, col2)`.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "One index: a single field, a composite `(col1, col2)`, or an expression. Settings include `type` (`btree`, `hash`, or an engine-specific type), `name`, `unique`, `pk`, and `note`. A `pk` entry here is the DBML form of the primary key. A `unique` entry is a unique index, not a unique key.",
  );

/** The `indexes { }` block. */
export const IndexesBlockZodType = z
  .object({
    kind: z.literal('IndexesBlock'),
    entries: z
      .array(IndexEntryZodType)
      .describe(
        "The indexes. Entries are separated by whitespace only; a comma between two entries is an error.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The `indexes { }` block. An index is a physical access structure. Keys are constraints and are declared in `constraints { }`. A `pk` entry here is the DBML form of the primary key.",
  );

/** A check constraint. */
export const CheckEntryZodType = z
  .object({
    kind: z.literal('CheckEntry'),
    expression: z
      .string()
      .describe(
        "The check expression, without its delimiters. It is a boolean expression in the target engine's expression language.",
      ),
    delimiter: z
      .enum(['backtick', 'quote'])
      .optional()
      .describe(
        "How the source wrote the expression. Single quotes are the form to write; backticks are an alias. Both produce the same expression. The raw AST keeps the form that was written.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A check: a boolean expression in the target engine's expression language. Write it in single quotes; backticks are an alias, and both produce the same expression. Optional settings are `name` and `note`.",
  );

/** The `checks { }` block. */
export const ChecksBlockZodType = z
  .object({
    kind: z.literal('ChecksBlock'),
    entries: z.array(CheckEntryZodType).describe("The checks in this block."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The `checks { }` block. It means the same thing as a `constraints` block that holds only checks.",
  );

/** A key line of `constraints { }`. */
export const KeyConstraintEntryZodType = z
  .object({
    kind: z.literal('KeyConstraintEntry'),
    fields: z
      .array(z.array(PathSegmentZodType).min(1))
      .min(1)
      .describe(
        "One path per key field, in key order. The order may differ from the order of the fields in the entity. A path may enter object fields, and never an array, a tuple position, or a map key.",
      ),
    parenthesized: z
      .boolean()
      .describe(
        "True when the source wrote the fields in parentheses, which is how a composite key is written.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A key line: the fields of the key, in key order, and exactly one of the flags `pk` or `unique`, never both and never neither. Optional settings are `name` (the constraint name a generator emits; when omitted, the generator chooses one) and `note`. A parenthesized list is a composite key. A single-field key with no name may instead be `[pk]` or `[unique]` on the field.",
  );

/** One line of `constraints { }`. */
export const ConstraintEntryZodType = z
  .discriminatedUnion('kind', [KeyConstraintEntryZodType, CheckEntryZodType])
  .describe(
    "One line of `constraints { }`: a key, or a check. A line that names fields is a key. A line that holds a quoted expression is a check.",
  );

/** The `constraints { }` block. */
export const ConstraintsBlockZodType = z
  .object({
    kind: z.literal('ConstraintsBlock'),
    entries: z
      .array(ConstraintEntryZodType)
      .describe("The keys and checks of this block."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The `constraints { }` block: the entity's primary key, unique keys, and check expressions. A body holds at most one. It is also valid in a TablePartial and an Edge. An entity has at most one primary key.",
  );

/** One row of sample data. */
export const RecordRowZodType = z
  .object({
    kind: z.literal('RecordRow'),
    values: z
      .array(SettingValueZodType)
      .describe(
        "The values of this row, in column order. Each value is a quoted string (a date or time is an ISO 8601 string, such as `'2026-06-10'`), a number, `true` or `false`, `null`, an enum value such as `Status.active`, or a backtick expression such as `` `gen_random_uuid()` ``.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "One row of sample data: a comma-separated list of values. One row occupies one line.",
  );

/** Sample data inside an entity. */
export const RecordsBlockZodType = z
  .object({
    kind: z.literal('RecordsBlock'),
    rows: z.array(RecordRowZodType).describe("The sample rows."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "Sample data inside an entity. Values follow declaration order: local fields first, then injected partials. Records document, test, and exemplify; they are not authoritative schema, and a generator may skip them.",
  );

/* -------------------------------------------------------------------------
 * Declarations
 * ----------------------------------------------------------------------- */

/** One item of an entity, edge, or table-partial body. */
export const EntityBodyItemZodType = z
  .discriminatedUnion('kind', [
    FieldDeclarationZodType,
    IndexesBlockZodType,
    ChecksBlockZodType,
    ConstraintsBlockZodType,
    NoteBlockZodType,
    PartialInjectionZodType,
    RecordsBlockZodType,
  ])
  .describe(
    "One item of an entity, edge, or table-partial body: a field, `indexes`, `checks`, `constraints`, a note, a `~partial` injection, or `records`.",
  );

/** A named, reusable type. */
export const TypeDeclarationZodType = z
  .object({
    kind: z.literal('TypeDeclaration'),
    name: z
      .string()
      .describe(
        "The type name. Identifiers are case-sensitive. A named type cannot shadow a built-in type keyword.",
      ),
    scalarBase: TypeExpressionZodType.optional().describe(
      "Set when this Type aliases one type expression, as in `Type Email varchar [...]`. The body is then empty, and `settings` carries the field-level validation, notes, and AI-readiness metadata. Absent on an object-shaped Type.",
    ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    body: z
      .array(NestedBodyItemZodType)
      .describe(
        "The fields of an object-shaped Type. Empty when `scalarBase` is set.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A named, reusable type. An object-shaped Type has a body of fields. A scalar Type aliases one type expression and puts validation, notes, and AI-readiness settings on the Type itself. Types are project-scoped.",
  );

/** A named field-bearing construct. */
export const EntityDeclarationZodType = z
  .object({
    kind: z.literal('EntityDeclaration'),
    keyword: EntityKeywordZodType,
    name: z
      .string()
      .describe(
        "The entity name. A schema-qualified declaration such as `Table core.users` is stored as written (`core.users`) and names the entity `users` inside an implicit container `core`. Identifiers are case-sensitive.",
      ),
    alias: z
      .string()
      .optional()
      .describe(
        "The optional `as Alias`. An alias names the entity in a `Ref` or an inline `ref:`. An alias that repeats an entity or container name names nothing.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    body: z.array(EntityBodyItemZodType).describe("The entity body."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A named field-bearing construct. An entity belongs to at most one container. Settings include `note` (documentation), `headercolor` (a visualization color), `synonyms` (other names), `business_term` (a glossary term or URL), and `tags` (classification labels). `Table core.users` is stored as written and names the entity `users` inside an implicit container `core`.",
  );

/** A relationship that carries properties. */
export const EdgeDeclarationZodType = z
  .object({
    kind: z.literal('EdgeDeclaration'),
    name: z
      .string()
      .describe("The edge name. Identifiers are case-sensitive."),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    body: z
      .array(EntityBodyItemZodType)
      .describe("The edge's properties, declared as fields."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A relationship that carries properties, as in a labeled property graph. It has a name, `source` and `target` settings naming the connected entities, and a body of fields. Cardinality uses `source_cardinality` and `target_cardinality`, written as strings such as `'0..*'` and `'1..1'`; those settings are distinct from `source` and `target`, which name the entities. `undirected: true` means the two ends are interchangeable. Several edges may connect the same pair of entities.",
  );

/** The query that defines a View. */
export const SourceQueryItemZodType = z
  .object({
    kind: z.literal('SourceQueryItem'),
    query: z
      .string()
      .describe(
        "The query text, captured verbatim. xDBML does not parse it. It may be SQL or another engine's query language.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The query that defines a View. It is opaque metadata: xDBML does not parse it. A View body holds at most one `source_query:`; when several are written, the first is the view's source query.",
  );

/** One item of a View body. */
export const ViewBodyItemZodType = z
  .discriminatedUnion('kind', [FieldDeclarationZodType, NoteBlockZodType, SourceQueryItemZodType])
  .describe(
    "One item of a View body: a field of the result shape, a note, or `source_query:`.",
  );

/** A database view. */
export const ViewDeclarationZodType = z
  .object({
    kind: z.literal('ViewDeclaration'),
    name: z
      .string()
      .describe("The view name. Identifiers are case-sensitive."),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    body: z.array(ViewBodyItemZodType).describe("The view body."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A database view: a declarative result shape plus an opaque source query. Settings are written in the brackets after the name, not in the body. `materialized` is `true` or `false` (default `false`: the query runs on access; `true` means the result is stored). A materialized view may also set `refresh_schedule` (`hourly`, `daily`, `weekly`, or an engine-specific value), `refresh_on` (entities whose changes trigger a refresh), and `storage_options`. `source_database` names the engine of the source query. `note`, `synonyms`, and `business_term` are documentation and AI-readiness metadata. The source query is a body element, not a setting.",
  );

/** One value of an Enum. */
export const EnumValueZodType = z
  .object({
    kind: z.literal('EnumValue'),
    name: z.string().describe("The value name."),
    nameQuoted: z
      .boolean()
      .describe(
        "True when the value was quoted because it contains characters a bare identifier cannot. Tools that write xDBML use double quotes.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "One value of an Enum. A value with non-identifier characters is quoted. A value may carry settings such as `note`.",
  );

/** An enumeration of named values. */
export const EnumDeclarationZodType = z
  .object({
    kind: z.literal('EnumDeclaration'),
    keywordCasing: z
      .string()
      .describe(
        "The `enum` keyword as written. Keywords are case-insensitive, so `enum` and `Enum` are the same keyword.",
      ),
    name: z
      .string()
      .describe(
        "The enum name. A top-level `enum billing.invoice_status` is the same as declaring the enum inside the container `billing`. A field names a container-qualified enum by that qualified name.",
      ),
    values: z.array(EnumValueZodType).describe("The enum values."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "An enumeration of named values. It may be declared inside a Container, or at the top level under a qualified name (`enum billing.invoice_status`). The two forms are equivalent.",
  );

/** The two endpoints of a Ref and the operator between them. */
export const RefSpecZodType = z
  .object({
    kind: z.literal('RefSpec'),
    source: RefEndpointZodType.describe(
      "The left-hand endpoint, as written before the operator. The `source` cardinality setting describes this end.",
    ),
    operator: CardinalityOperatorZodType,
    target: RefEndpointZodType.describe(
      "The right-hand endpoint, as written after the operator. The `target` cardinality setting describes this end.",
    ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The two endpoints of a Ref and the cardinality operator between them. `source` is the endpoint written on the left and `target` the one written on the right. The referenced end is the right side of `>`, the left side of `<`, and either side of `-`.",
  );

/** A relationship between two attributes, or two entities. */
export const RefDeclarationZodType = z
  .object({
    kind: z.literal('RefDeclaration'),
    name: z
      .string()
      .optional()
      .describe(
        "The relationship name. In SQL it is also the foreign-key constraint name. When omitted, a generator chooses a name.",
      ),
    spec: RefSpecZodType,
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A relationship between a child attribute and a parent attribute. The child holds the foreign key or the copied value; the parent holds the identifier or the master value. Without `foreign_master` the relationship is referential, the foreign key. With that flag it records denormalized replication. An endpoint may name an entity rather than an attribute, for a relationship written before the attributes exist; on that form the operator gives direction only, and cardinality stays unstated until a `source` or `target` setting states it. `delete` and `update` are `cascade`, `restrict`, `set null`, `set default`, or `no action`. `source` and `target` are cardinality strings `'1..1'`, `'0..1'`, `'1..*'`, `'0..*'`, or `'N..M'`; `min_source`, `max_source`, `min_target`, and `max_target` state the same bounds separately. `color` is `#rgb` or `#rrggbb`. `inactive` is a flag: the relationship remains, and it is a documentation hint rather than a removal. `source_role`, `target_role`, `source_verb`, and `target_verb` are free text. `constraint_type` is `identifying` (the child's foreign key is part of its primary key) or `non_identifying`; leaving it out means the type is unstated, and it does not apply to a foreign master or to `<>`. `undirected` is `true` or `false`. `note` is free text.",
  )
  .superRefine((ref, ctx) => {
    for (const setting of ref.settings) {
      if (setting.name === 'source' || setting.name === 'target') {
        const text = setting.value?.kind === 'StringValue' ? setting.value.value : undefined;
        if (text === undefined || !CARDINALITY_STRING.test(text)) {
          ctx.addIssue(`A Ref ${setting.name} setting is a quoted cardinality string such as '0..*' or '1..1'.`);
        }
      }
      if (
        setting.name === 'min_source' || setting.name === 'max_source'
        || setting.name === 'min_target' || setting.name === 'max_target'
      ) {
        const value = setting.value;
        const star = value?.kind === 'StringValue' && value.value === '*';
        if (value?.kind !== 'NumberValue' && !star) {
          ctx.addIssue(`${setting.name} is a number or '*'.`);
        }
      }
    }
  });

/** A reusable set of entity fields. */
export const TablePartialDeclarationZodType = z
  .object({
    kind: z.literal('TablePartialDeclaration'),
    name: z
      .string()
      .describe(
        "The partial's name. An entity or edge injects it with `~name`. `TablePartial` has no `Entity` synonym.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    body: z
      .array(EntityBodyItemZodType)
      .describe("The fields and other body items this partial contributes."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A reusable set of entity fields, spliced in with `~name`. Each entity gets its own copy. Local fields override the partial; among partials, the last one injected wins. A partial may also be injected into an Edge.",
  );

/** A named group of entities for diagram framing. */
export const TableGroupDeclarationZodType = z
  .object({
    kind: z.literal('TableGroupDeclaration'),
    name: z
      .string()
      .describe(
        "The group name. `TableGroup` keeps its DBML name and has no `Entity` synonym.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    members: z
      .array(z.string())
      .describe("The member names, as written, such as `orders` or `sales.orders`."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A named group of entities for diagram framing. `color` is the frame color (`#rgb` or `#rrggbb`); `note` is free text. The name is the DBML name, with no Entity synonym.",
  );

/** One subtype of a supertype group. */
export const SupertypeGroupMemberZodType = z
  .object({
    kind: z.literal('SupertypeGroupMember'),
    name: z
      .string()
      .describe(
        "The subtype's entity path, as written: `Person` or `crm.Person`. It names an entity, not a view, edge, type, or container.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "One subtype of a supertype group. The only recognized member setting is `strategy`, with the same values as the group's `strategy`.",
  );

/** One supertype and its immediate subtypes. */
export const SupertypeGroupDeclarationZodType = z
  .object({
    kind: z.literal('SupertypeGroupDeclaration'),
    name: z
      .string()
      .describe(
        "The group name: an identifier, unique among the supertype groups, naming the axis of specialization. A group always has a name.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    members: z
      .array(SupertypeGroupMemberZodType)
      .describe(
        "The subtypes. A group that names a supertype and lists no subtype is valid. Members may live in any container.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "One supertype and its immediate subtypes along one axis of specialization. The required `supertype` setting names the entity that holds the shared attributes; each subtype declares only the attributes specific to it, and a subtype may not redeclare a supertype attribute. `completeness` is `total` (every supertype instance belongs to a subtype) or `partial` (an instance may belong to none). `exclusivity` is `disjoint` (at most one subtype) or `overlapping` (an instance may belong to several). `strategy` records how the hierarchy is stored: `preserved_hierarchy` keeps the supertype and each subtype separate, `roll_up` brings subtype attributes into the supertype, and `roll_down` copies supertype attributes into each subtype. `merge` applies to roll-up: `flat` puts every attribute at one level, and `nested` keeps each subtype's attributes in an object. `discriminator` names the attribute whose value selects the subtype; it is an error when exclusivity is `overlapping`, and the attribute need not already be declared. `note` is free text. Leaving a setting out leaves that characteristic unstated. It is a top-level declaration, recognized in documents that declare `xdbml: 0.5` or later.",
  );

/** A name listed in a DiagramView category. */
export const DiagramViewItemZodType = z
  .object({
    kind: z.literal('DiagramViewItem'),
    name: z
      .string()
      .describe(
        "The name as written: `orders` or `sales.orders`. An entity or database view inside a container is named with its container. Under `Tables`, an alias names its entity.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A name listed in a DiagramView category. It names an element declared elsewhere; the diagram view does not declare it.",
  );

/** One category of a DiagramView. */
export const DiagramViewCategoryZodType = z
  .object({
    kind: z.literal('DiagramViewCategory'),
    category: DiagramViewCategoryNameZodType.describe(
      "The canonical category. `Schemas` is stored as `Containers`.",
    ),
    keyword: z
      .string()
      .describe(
        "The category keyword as written. The raw AST keeps `Schemas`; the canonical category is `Containers`.",
      ),
    wildcard: z
      .boolean()
      .describe(
        "True when this category's list is `*`, which lists every element of that category.",
      ),
    items: z
      .array(DiagramViewItemZodType)
      .describe(
        "The names listed in this category. A name written beside `*` has no effect.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "One category of a DiagramView: a keyword and a list of names, or `*`. A category appears at most once. `Schemas` is the same category as `Containers`. Relationships have no category.",
  )
  .superRefine((category, ctx) => {
    const expected = DIAGRAM_CATEGORY_BY_KEYWORD[category.keyword.toLowerCase()];
    if (expected === undefined || expected !== category.category) {
      ctx.addIssue('The category keyword is Tables, Views, Containers, Schemas, TableGroups, SupertypeGroups, or Notes, and it matches the canonical category. Schemas is stored as Containers.');
    }
  });

/** A named subset of the model's diagram. */
export const DiagramViewDeclarationZodType = z
  .object({
    kind: z.literal('DiagramViewDeclaration'),
    name: z
      .string()
      .describe(
        "The diagram view name. It is unique among the diagram views of the project and may be quoted.",
      ),
    settings: z.array(SettingZodType).describe("Bracket settings: `note` and custom `x_` properties."),
    notes: z.array(NoteBlockZodType),
    wildcardBody: z
      .boolean()
      .describe(
        "True when the whole body is `{ * }`, which lists every element of every category. The raw AST keeps that form as written.",
      ),
    categories: z
      .array(DiagramViewCategoryZodType)
      .describe(
        "The categories this diagram view writes. A category left out lists nothing.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "A named subset of the model's diagram, a subject area or sub-model. It lists elements to show and declares none of them. It is a top-level declaration only. `{ * }` as the whole body lists every element of every category. A `Ref` or an Edge appears when both of its ends do.",
  );

/** Sample data outside an entity. */
export const TopLevelRecordsDeclarationZodType = z
  .object({
    kind: z.literal('TopLevelRecordsDeclaration'),
    entityRef: z
      .string()
      .describe("The entity being populated, as written, such as `users` or `core.users`."),
    columns: z
      .array(z.string())
      .describe(
        "The explicit column list. Row values follow this list, not the entity's field order. Columns not listed default to null or the field's default.",
      ),
    rows: z.array(RecordRowZodType).describe("The sample rows."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "Sample data outside an entity: `records entity (columns) { rows }`. Values follow the explicit column list. Columns not listed default to null or the field's default. Records are sample data, not authoritative schema.",
  );

/** A Project body item. */
export const ProjectBodyItemZodType = z
  .discriminatedUnion('kind', [SettingZodType, NoteBlockZodType])
  .describe("A Project body item: a setting, or an inline note.");

/** The project declaration. */
export const ProjectDeclarationZodType = z
  .object({
    kind: z.literal('ProjectDeclaration'),
    name: z.string().describe("The project name."),
    body: z
      .array(ProjectBodyItemZodType)
      .describe(
        "The project settings and notes. `targets` is one target name, or a list of names; a name with spaces or punctuation is a quoted string, such as `'SQL Server'`. `Note` is documentation. `database_type` is the single-target DBML alias and is not a list.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "At most one Project. It names the schema and declares `targets`. In a single-target project, a Container that omits `target` inherits that target. A project must not declare both `database_type` and `targets`.",
  );

/** One selective import. */
export const ImportItemZodType = z
  .object({
    kind: z.literal('ImportItem'),
    elementType: z
      .string()
      .describe(
        "The element-type keyword. It is case-insensitive. Recognized keywords are `table`, `entity`, `collection`, `record`, `enum`, `tablepartial`, `note`, `schema`, `container`, `tablegroup`, `supertypegroup`, `type`, `edge`, `view`, `diagramview`, and `field`. `project` is not importable.",
      ),
    sourcePath: z
      .string()
      .describe(
        "The dotted path of the element in the source file: `EntityName`, `ContainerName.EntityName`, or `ContainerName.EntityName.FieldName` for a nested field.",
      ),
    alias: z
      .string()
      .optional()
      .describe(
        "The optional `as` rename in the importing file. Once aliased, the alias is the only accessible name, and a clone uses the alias as the declaration's name. Import-all cannot be aliased.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "One selective import: an element-type keyword, a dotted source path, and an optional `as` alias.",
  )
  .superRefine((item, ctx) => {
    if (!IMPORT_ELEMENT_TYPES.has(item.elementType)) {
      ctx.addIssue(`Unrecognized import element type '${item.elementType}'.`);
    }
    if (!DOTTED_IDENTIFIER.test(item.sourcePath)) {
      ctx.addIssue('An import path is one or more identifiers separated by dots.');
    }
    if (item.alias !== undefined && !IDENTIFIER.test(item.alias)) {
      ctx.addIssue('An import alias is an identifier.');
    }
  });

/** What a `use` or `reuse` imports. */
export const ImportSpecZodType = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('ImportAll') })
      .describe(
        "Import every top-level declaration from the source file except its Project. This form cannot rename imports.",
      ),
    z
      .object({
        kind: z.literal('ImportList'),
        items: z.array(ImportItemZodType).min(1).describe("The declarations to import."),
      })
      .describe("A selective import: only the listed declarations."),
  ])
  .describe(
    "What a `use` or `reuse` imports: `*` for every top-level declaration except Project, or a selective list.",
  );

/** An import of declarations from another xDBML file. */
export const ModuleImportDirectiveZodType = z
  .object({
    kind: z.literal('ModuleImportDirective'),
    mode: z
      .enum(['use', 'reuse'])
      .describe(
        "`reuse` is transitive: declarations it brings in are visible to files that import this file. `use` stays private to this file. `reuse` is the default authors want.",
      ),
    spec: ImportSpecZodType.describe(
      "What to import: every top-level declaration (`*`), or a selective list.",
    ),
    from: z
      .string()
      .describe(
        "The source after `from`, with quotes stripped. A relative path begins with `./` or `../` and uses forward slashes. A string that begins with `https://` is a remote module. The extension may be omitted.",
      ),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
  get clone (): z.ZodOptional<typeof CloneBlockZodType> {
    return CloneBlockZodType.optional().describe(
      "The optional clone embedded in this directive. When present, it is the authoritative content and the referenced file is not opened. A field import appears here as the field alone.",
    );
  },
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "An import of declarations from another xDBML file. `reuse` is transitive; `use` is private to this file. The directive's location is where the imported element is placed. A clone block, when present, is the authoritative content and the referenced file is not opened.",
  )
  .superRefine((directive, ctx) => {
    try {
      classifyModuleSource(directive.from);
    } catch (err) {
      ctx.addIssue(err instanceof Error ? err.message : 'Invalid module source.');
    }
  });

/** What a Container body holds. */
export const ContainerBodyItemZodType = z
  .discriminatedUnion('kind', [
    EntityDeclarationZodType,
    EdgeDeclarationZodType,
    ViewDeclarationZodType,
    EnumDeclarationZodType,
    NoteBlockZodType,
    ModuleImportDirectiveZodType,
  ])
  .describe(
    "What a Container body holds: entities, edges, views, enums, notes, and imports placed there.",
  );

/** The namespace between Project and Entity. */
export const ContainerDeclarationZodType = z
  .object({
    kind: z.literal('ContainerDeclaration'),
    keyword: ContainerKeywordZodType.describe(
      "The keyword synonym that was written. All seven synonyms are the same construct.",
    ),
    name: z
      .string()
      .describe("The container name. Identifiers are case-sensitive."),
    get settings (): z.ZodArray<typeof SettingZodType> {
      return z.array(SettingZodType);
    },
    body: z.array(ContainerBodyItemZodType).describe("The container body."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The namespace between Project and Entity. An entity belongs to at most one container. `type` names the target-native flavor (`schema`, `database`, `keyspace`, `namespace`, `dataset`, `bucket`, `index`). `target` names the technology and is required when the project declares more than one target. Other settings are open-vocabulary pairs.",
  );

/** A top-level declaration. */
export const TopLevelStatementZodType = z
  .discriminatedUnion('kind', [
    ProjectDeclarationZodType,
    ContainerDeclarationZodType,
    EntityDeclarationZodType,
    TypeDeclarationZodType,
    EdgeDeclarationZodType,
    ViewDeclarationZodType,
    EnumDeclarationZodType,
    RefDeclarationZodType,
    TablePartialDeclarationZodType,
    TableGroupDeclarationZodType,
    SupertypeGroupDeclarationZodType,
    DiagramViewDeclarationZodType,
    NoteDeclarationZodType,
    TopLevelRecordsDeclarationZodType,
    ModuleImportDirectiveZodType,
  ])
  .describe(
    "A top-level declaration: Project, Container, Entity, Type, Edge, View, Enum, Ref, TablePartial, TableGroup, SupertypeGroup, DiagramView, Note, records, or a module import.",
  );

/**
 * Statements inside a clone block: the same shapes as a top-level
 * statement, plus a bare field when the directive imports a field.
 */
const CloneStatementZodType = z
  .discriminatedUnion('kind', [
    ProjectDeclarationZodType,
    ContainerDeclarationZodType,
    EntityDeclarationZodType,
    TypeDeclarationZodType,
    EdgeDeclarationZodType,
    ViewDeclarationZodType,
    EnumDeclarationZodType,
    RefDeclarationZodType,
    TablePartialDeclarationZodType,
    TableGroupDeclarationZodType,
    SupertypeGroupDeclarationZodType,
    DiagramViewDeclarationZodType,
    NoteDeclarationZodType,
    TopLevelRecordsDeclarationZodType,
    ModuleImportDirectiveZodType,
    FieldDeclarationZodType,
  ])
  .describe(
    "One declaration inside a clone block. A field import is the field alone, with no entity or container wrapper.",
  );

/** The optional clone embedded in a `use` or `reuse`. */
export const CloneBlockZodType = z
  .object({
    kind: z.literal('CloneBlock'),
    statements: z
      .array(CloneStatementZodType)
      .describe(
        "The imported declarations, with no surrounding wrappers from the source file. A field import is the field alone.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The optional clone embedded in a `use` or `reuse`. When present, it is authoritative and the referenced file is not opened. It contains exactly the imported declarations, with no surrounding wrappers. A field import is the field alone.",
  );

/** The `xdbml:` header. */
export const VersionDeclarationZodType = z
  .object({
    kind: z.literal('VersionDeclaration'),
    version: z
      .string()
      .regex(/^\d+(?:\.\d+)*$/, 'A version is a dot-separated number, such as 0.6 or 0.6.1.')
      .describe(
        "The version text as written, SemVer-style `MAJOR.MINOR` or `MAJOR.MINOR.PATCH`, such as `0.6`.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The `xdbml:` header. It is SemVer-style `MAJOR.MINOR[.PATCH]` and appears before any other construct. A document with no header is DBML 3.13.6, and no xDBML extension is recognized.",
  );

/** The `experimental:` opt-in. */
export const ExperimentalDeclarationZodType = z
  .object({
    kind: z.literal('ExperimentalDeclaration'),
    features: z
      .array(z.string().regex(IDENTIFIER, 'A feature name is an identifier.'))
      .describe("The experimental feature names opted into."),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "The `experimental:` opt-in. Without it, experimental constructs are not recognized. Experimental features have no backward-compatibility guarantee.",
  );

/** An xDBML document. */
export const XDbmlDocumentZodType = z
  .object({
    kind: z.literal('XDbmlDocument'),
    version: VersionDeclarationZodType.optional().describe(
      "The `xdbml:` header. Absent when the document declares no version, in which case it is read as DBML 3.13.6.",
    ),
    experimental: ExperimentalDeclarationZodType.optional().describe(
      "The `experimental:` opt-in, which may follow the version header.",
    ),
    statements: z
      .array(TopLevelStatementZodType)
      .describe(
        "The top-level declarations, in source order. At most one is a Project.",
      ),
    get span (): typeof SpanZodType {
      return SpanZodType;
    },
  })
  .describe(
    "An xDBML document: an optional version declaration, an optional experimental opt-in, and top-level declarations. xDBML describes the structural and semantic layer of data: entities, fields, types, relationships, and their meaning.",
  );
