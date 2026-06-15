---
title: Module system -- use and reuse
description: How the v0.2 module system lets one xDBML file reuse entities and parts of entities defined in another, with examples and a note on what the playground supports.
---

# Module system: use and reuse

If you've ever had to copy the same `dim_customer` entity into five data marts -- and keep all five copies in sync as the definition evolves -- the v0.2 **module system** is for you. A `use` or `reuse` directive at the top of a file (or inside a Container) declares that this file pulls in named declarations from another file. The headline payoff is **canonical entities and reusable parts of entities, defined once, used many places**.

The module system also handles individual fields, Types, enums, table groups, views, edges, and table partials, but consistent **entity definitions across multiple downstream consumers** is the value most teams care about. The rest of this page walks the patterns, then explains how the playground handles directives in particular.

## What you can reuse across files

### Entire entities

This is the primary use case. A canonical entity defined in one place is shared across many consumers. Star-schema "conformed dimensions" are the textbook example; modern microservice architectures use the same pattern for shared Customer, Product, or Order definitions.

```xdbml
// In data-mart-A.xdbml
Container sales [type: schema, target: Snowflake] {
  reuse {
    entity core.dim_customer,
    entity core.dim_product,
    entity core.dim_date
  } from '../conformed-dimensions' { ... }

  Entity fact_sales {
    id           bigint [pk]
    customer_id  int    [ref: > dim_customer.id]
    product_id   int    [ref: > dim_product.id]
    date_id      int    [ref: > dim_date.id]
    amount       decimal(10,2)
  }
}
```

The three `dim_*` entities are declared once in `conformed-dimensions.xdbml` and reused by every data mart that needs them. When the canonical `dim_customer` gains a new column or a tightened constraint, all consumers pick the change up at the next sync (or, with clone blocks, at the next deliberate re-clone).

Note that the source declares the dimensions inside its own `core` Container, but the importer pulls them into its `sales` Container. **Imported entities become members of whichever Container holds the directive**; the original Container wrapper does not carry over. The qualified path (`core.dim_customer`) in the directive identifies the source location; the entity itself becomes `sales.dim_customer` in the importer.

### Parts of entities, via TablePartial

A **TablePartial** is xDBML's mixin construct: a named cluster of fields that any entity can splice into its body with `~PartialName`. Combined with the module system, partials let you share **parts** of entities across files -- a canonical audit-fields cluster, a soft-delete pattern, a multi-tenancy stamp.

```xdbml
// In shared/audit.xdbml
TablePartial audit_fields {
  created_at  timestamp [default: `now()`, not null]
  created_by  varchar
  updated_at  timestamp
  updated_by  varchar
}
```

```xdbml
// In any consumer
reuse { tablepartial audit_fields } from './shared/audit' { ... }

Entity orders {
  id           bigint [pk]
  customer_id  int
  amount       decimal(10,2)
  ~audit_fields            // splices the four fields in
}

Entity products {
  id           bigint [pk]
  name         varchar
  ~audit_fields            // same four fields, same definitions
}
```

This is genuine sharing of common field clusters: if `audit_fields` gains a `tenant_id` later, every entity that splices it in gets the new field automatically. The TablePartial is the single source of truth for what an "audited entity" looks like across the organization.

### Individual fields, via field-level imports

A **field-level import** brings a single field's complete shape -- its type, validation settings, default values, notes, and AI-readiness tags -- from one file into another. The imported name becomes a usable type at file scope; you place fields of that shape wherever you need them.

```xdbml
// In conformed-dimensions.xdbml
Container core {
  Entity dim_customer {
    id      int     [pk]
    email   varchar [pattern: '^[^@]+@[^@]+$', maxLength: 320, tags: ['pii']]
    country varchar
  }
}
```

```xdbml
// In any consumer
reuse { field core.dim_customer.email } from '../conformed-dimensions' { ... }

Entity audit_log {
  id           bigint [pk]
  actor_email  email           // gets the pattern, length bound, and pii tag
  action       varchar
  occurred_at  timestamp
}

Entity newsletter_subscribers {
  id       bigint [pk]
  address  email   [unique]    // same validation surface, plus a placement-level setting
}
```

The pattern shines when:
- The validation you want to reuse already exists inline on a field somewhere; extracting it as a standalone Type would be a refactor of the source schema
- The source schema is owned by another team and you can't (or don't want to) edit it to expose Types
- You want to track the canonical entity definitions without forking them

Nested paths work too. A path like `field core.dim_customer.address.city` walks into an object-typed `address` field on `dim_customer` and imports its `city` field as a top-level shape. Aliases (`as canonical_email`) rename the imported name; per-placement settings (`[unique]` above) layer onto the imported shape's settings without replacing them.

Field-level imports MUST appear at file scope -- they cannot sit inside a Container body, because the synthesized Named Type they produce lives at file scope regardless of where the directive sits. See [spec §26.8](/spec/v0.2#_26-8-field-level-imports) for the full grammar and resolution rules.

### Types and other top-level declarations

A scalar Named Type defined in one place provides validated field types for many entities elsewhere. Useful when several scalar fields across the codebase share the same validation surface (an email pattern, a country-code length bound, a currency-code enum membership).

```xdbml
// In shared/conformed-types.xdbml
Type Email       varchar [pattern: '^[^@]+@[^@]+$', tags: ['pii']]
Type CountryCode varchar [minLength: 2, maxLength: 2]
```

```xdbml
// In any consumer
reuse { type Email, type CountryCode } from './shared/conformed-types' { ... }

Entity employees {
  id      int [pk]
  email   Email           // gets the pattern check and pii classification
  country CountryCode     // gets the length constraints
}
```

The canonical declaration ensures "email" means the same thing -- same pattern, same classification tag -- across every file that uses it.

Beyond Types, you can also reuse Enums, Containers (with their entities), Edges, Views, TableGroups, and notes via the same directive. The full element-type vocabulary lives in [spec §26](/spec/v0.2#_26-module-system).

## The two directive forms

Every `use` / `reuse` directive can appear in one of two forms.

**Reference-only** -- the directive names the target file but provides no embedded content:

```xdbml
reuse { entity core.dim_customer } from './conformed-dimensions'
```

When a tool with file access parses this, it opens `./conformed-dimensions.xdbml`, finds the named entity, and pulls it into the current file's namespace. The parser handles the resolution; the importing file stays compact.

**With a clone block** -- the directive includes an inline copy of the imported content:

```xdbml
reuse { entity core.dim_customer } from './conformed-dimensions' {
  Entity dim_customer {
    id           int     [pk]
    email        varchar [pattern: '^[^@]+@[^@]+$']
    country      varchar
    created_at   timestamp
  }
}
```

The braces hold a **clone** of the imported declaration, embedded directly in the importer. The `from './conformed-dimensions'` clause becomes provenance metadata: it records where this content originated, but the importing file is self-contained -- it parses correctly even when the referenced file is missing.

Both forms are valid xDBML. The choice is about autonomy versus compactness.

## What the playground supports

The playground runs entirely in your browser. It deliberately does **not** read arbitrary files from your disk -- doing so would require an intrusive File System Access permission prompt and a workflow nobody enjoys. As a result:

| Directive form | Playground behavior |
|---|---|
| With clone block | **Works.** The clone block content is processed as if the declarations had been written directly in the file. Cloned entities appear in the diagram; their fields show in the inspector; FK references to them resolve. |
| Reference-only | **Parser error.** The error message points at the directive and explains that no `readFile` resolver is available. |

This is why the bundled `10-modules-consumer.xdbml` example loads successfully: every directive in it carries a clone block. Open the example via the **Examples** menu, look at the source, and notice the inline `Entity dim_customer { ... }` block following the `from '../conformed-dimensions'` clause.

## Why both forms exist

For day-to-day work in the playground, clone blocks are what you want. They make the schema portable across any tool and any environment, including the browser, with no setup.

Reference-only directives shine in the **command-line parser** (running with `@xdbml/parse` and a `readFile` callback) and in **enterprise data modeling tools** like Hackolade, where files live in a project workspace and cross-file references resolve automatically. Use them when:

- The schema graph is too large to inline everything sensibly
- A "conformed dimensions" file is shared across many data products
- Continuous integration validates the whole module graph as a unit
- Version pinning of the referenced file is enforced externally (a Git submodule, a registry)

A common authoring pattern: write the canonical schema with reference-only directives so the source stays clean, then run a build step that produces a self-contained clone-block version for browser-only consumers (Slack snippets, GitHub READMEs, the playground).

## A worked example

Load `09-modules-conformed-dimensions.xdbml` from the **Examples** menu. It defines three conformed dimensions (`dim_customer`, `dim_product`, `dim_date`) inside a `core` Container, plus four scalar Named Types (Email, CountryCode, CurrencyCode, PhoneE164) at file scope. The `dim_customer` entity has an `engagement_score` field declared inline with numeric bounds (0-100) and an explanatory note. It has no imports of its own -- it's the canonical source.

Now load `10-modules-consumer.xdbml`. The file declares a `sales` Container, then uses three `reuse` directives:

- **Container-scoped entity import**: `reuse { entity core.dim_customer, entity core.dim_product, entity core.dim_date } from './09-modules-conformed-dimensions' { ... }` sits inside the `sales` Container body and pulls the three canonical dimensions into `sales` as `sales.dim_customer`, `sales.dim_product`, `sales.dim_date`.
- **File-scope Type import**: `reuse { type Email, type CountryCode, type CurrencyCode, type PhoneE164 } from './09-modules-conformed-dimensions' { ... }` brings the canonical scalar types into the importer's namespace.
- **File-scope field import**: `reuse { field core.dim_customer.engagement_score } from './09-modules-conformed-dimensions' { ... }` brings the engagement-score field's complete validation surface in as a usable type at file scope. The fact-sales entity then declares `engagement_at_sale engagement_score` to record the customer's score AT THE TIME of each sale -- the same shape, the same bounds, no re-declaration.

The diagram shows the `sales` Container holding five entities: two locally-declared fact tables (`fact_sales`, `fact_returns`) plus the three cloned dimensions. The dimensions get a green TableGroup color from `imported_dimensions`; the fact tables get a blue color from `sales_facts`. Click any cloned entity in the diagram: the inspector shows its fields, settings, and notes -- exactly as if the entity had been declared in the consumer file directly.

The fact tables reference the cloned dimensions via foreign keys (`customer_id > dim_customer.id`), and those references resolve cleanly. The cloned entities and the field-derived `engagement_score` type are first-class citizens in the importing file's namespace.

## When the parser rejects a reference-only directive

If you author a schema with a reference-only `use` / `reuse` and load it in the playground, the diagnostics panel shows a message like:

> Reference-only 'reuse' directive (no clone block) cannot be resolved: no readFile resolver was supplied in ParseOptions. Either provide a ParseOptions.readFile callback when calling parse(), or add an inline clone block to the directive to make the file self-contained.

The first half is for tool authors; the second is for you. Two ways to fix:

- Add an inline clone block to the directive (manual but transparent).
- Process the schema through `@xdbml/parse` from the command line, or through a data modeling tool like Hackolade that handles cross-file resolution, and let it emit an inline-rendered version for the playground.

## Notable directive features

A few subtleties worth knowing.

**Aliases.** Rename the imported declaration with `as`:

```xdbml
reuse { entity core.dim_customer as canonical_customer } from './lib'
```

The cloned entity is `Entity canonical_customer`. Aliases are a shallow rename of the top-level name only; references inside the entity body are not rewritten.

**Import-all.** The wildcard form imports every top-level declaration except `Project`:

```xdbml
reuse * from './lib'
```

Project declarations are excluded because two `Project` declarations in the same scope would conflict.

**use versus reuse.** The two keywords are semantically equivalent at the parser level. The intent the spec captures: `use` suggests "I depend on this but I'm not republishing it"; `reuse` suggests "I'm pulling this into my namespace and treating it as mine." Pick whichever reads more naturally; tooling treats them identically.

**Where directives may live.** File-scope directives appear at the top level. Entity imports may also appear inside a Container body, where the imported entity becomes a member of that Container. Imports of top-level declarations (Type, Enum, TableGroup, TablePartial, View, Edge, Note) and of individual fields (§26.8) must appear at file scope. Directives MAY NOT appear inside Entity, Edge, View, or Type bodies.

**Cycles are allowed.** If A imports from B and B imports from A, the parser breaks the cycle by leaving the back-edge directive's clone block undefined. Spec §26.15 makes this explicit: cycles compile, but the back-edge produces nothing.

## What's NOT included in the playground

A few related capabilities deliberately out of scope for the in-browser experience:

**No multi-file open.** The playground works with one file at a time. To navigate a real module graph interactively, use a data modeling tool.

**No "expand reference into clone" command.** If you have a reference-only directive and want to convert it to clone-block form, do that outside the playground (via the CLI parser or a data modeling tool that supports the export).

**No incremental file watching.** Even if the playground could open multiple files, it doesn't watch them for changes. Refresh the schema by re-opening.

## Related pages and references

- [**Open and save files**](./open-and-save-files): how the playground handles individual `.xdbml` files.
- [**Loading examples**](./loading-examples): the bundled `09-modules-conformed-dimensions.xdbml` and `10-modules-consumer.xdbml` examples demonstrate the patterns described here.
- [**When parsing fails**](./when-parsing-fails): how to read parser-error messages, including the reference-only-directive error.
- [Module system in the spec (v0.2 §26)](/spec/v0.2#_26-module-system): the authoritative grammar and resolution rules.
