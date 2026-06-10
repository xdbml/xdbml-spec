---
title: "Module system: sales data product (v0.2)"
description: "The consumer half of a multi-file example pair. A sales data mart that imports canonical dimensions from [09-modules-conformed-dimensions.xdbml](/examples/09-modules-conformed-dimensions) using the xD"
---

# Module system: sales data product (v0.2)

**File:** `10-modules-consumer.xdbml` &nbsp;·&nbsp; **Target:** Consumer file with module imports

The consumer half of a multi-file example pair. A sales data mart that imports canonical dimensions from [09-modules-conformed-dimensions.xdbml](/examples/09-modules-conformed-dimensions) using the xDBML v0.2 module system. Demonstrates Container-scoped imports (entities become `sales.dim_customer` not `core.dim_customer`), clone blocks with `cloned_at` metadata for file autonomy, multiple imports per directive with one shared clone block, and scalar Named Type imports at file scope. The file is fully self-contained because every `reuse` carries an inline clone; it parses correctly even when the library file is unavailable. **Note**: exercises v0.2 features (module system §26, scalar Named Types §14.7, entity-level checks §10) that the reference parser has not yet implemented; viewing the source works but loading it into the playground currently produces a parse error.

<div style="display: flex; gap: 12px; margin: 24px 0; flex-wrap: wrap;">
  <a href="/examples/10-modules-consumer.xdbml" download="10-modules-consumer.xdbml"
     style="display: inline-block; padding: 8px 16px; background: var(--vp-c-brand-1); color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">
    ⬇ Download 10-modules-consumer.xdbml
  </a>
  <a href="https://github.com/xdbml/xdbml-spec/blob/main/examples/10-modules-consumer.xdbml" target="_blank" rel="noopener"
     style="display: inline-block; padding: 8px 16px; border: 1px solid var(--vp-c-divider); color: var(--vp-c-text-1); text-decoration: none; border-radius: 8px; font-weight: 500;">
    View on GitHub ↗
  </a>
</div>

## Source

```xdbml
// =============================================================================
//  SALES DATA PRODUCT  (10-modules-consumer.xdbml)
// =============================================================================
//
//  A sales data mart that imports canonical dimension entities from the
//  conformed-dimensions library file (09-modules-conformed-dimensions.xdbml)
//  via the xDBML v0.2 module system. This file is the consumer half of a
//  paired example; both files have their own page in the examples directory.
//
//  v0.2 features exercised:
//    - Module system (§26): `reuse { ... } from './...'` directives
//    - Clone blocks (§26.6): inline embedded content for file autonomy
//    - `cloned_at` metadata (§26.6)
//    - Container-scoped imports (§26.5): directives inside Container body
//    - Scalar Named Types (§14.7): imported via `reuse { type Email, ... }`
//    - Entity-level checks block (§10): `checks { `expr` [name: ...] }`
//    - `color:` settings on TableGroups (§16.2)
//
//  NOTE: until the reference parser implements the above v0.2 features,
//  this file will not parse cleanly in the playground. The test runner
//  marks it as PENDING rather than FAIL so the build stays green.
//
//  Pattern demonstrated:
//
//    - Container-scoped imports: the `reuse` directives live INSIDE the
//      `Container sales [type: schema]` body, so the imported entities are
//      placed inside that Container in the merged AST. The source's `core`
//      Container appears in the directive's path (`core.dim_customer`) but
//      does NOT survive into the importing file's namespace -- the entity
//      becomes `sales.dim_customer` here.
//
//    - Clone blocks for autonomy: each `reuse` directive carries an inline
//      clone block. The clone embeds the imported declaration directly so
//      this file parses correctly even when the conformed-dimensions file
//      is unavailable (a key property for files delivered to consumers or
//      archived for compliance).
//
//    - `cloned_at` metadata: each clone records when the snapshot was taken.
//      Tooling can compare this to the source file's last-modified time to
//      surface drift.
//
//    - Multiple imports in one directive: a single directive can pull in
//      multiple declarations, with all the cloned bodies inside one shared
//      clone block. The parser matches each cloned declaration to its
//      directive import item by name and element type.
//
//    - Scalar Named Type import: `reuse { type Email, type CountryCode }`
//      brings the canonical scalar types into this file, where they then
//      drive validation on this file's facts.
//
//    - `reuse` (transitive) is used throughout: if a downstream barrel file
//      imports this data product, those consumers will see all the imported
//      declarations transitively. To make imports private, use `use` instead.
//
// =============================================================================

xdbml: 0.2


Project sales_data_product {
  targets: [Snowflake]
  Note: '''
    Sales data mart. Joins canonical conformed dimensions to local fact data.
    Conformed dimension clones taken from `./09-modules-conformed-dimensions.xdbml`
    on 2026-06-10; refresh via the conformed-dimensions update SOP every quarter.
  '''
}


// -----------------------------------------------------------------------------
//  Container: sales facts and dimension clones
// -----------------------------------------------------------------------------

Container sales [type: schema, target: Snowflake] {

  // --------------------------------------------------------------------------
  //  Imported scalar Named Types (file-scope at directive level only because
  //  scalar Types are top-level constructs, but placed via reference here in
  //  the comment for clarity). The directive itself sits at file scope below.
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  //  Local fact entities
  // --------------------------------------------------------------------------

  Entity fact_sales [note: 'One row per sale line. Grain: customer_id × product_id × date_key × order_id × line_id.'] {
    order_id      int           [pk]
    line_id       int           [pk]
    customer_id   int           [not null, ref: > sales.dim_customer.id]
    product_id    int           [not null, ref: > sales.dim_product.id]
    date_key      int           [not null, ref: > sales.dim_date.date_key]
    quantity      int           [not null, check: `quantity > 0`]
    unit_price    decimal(10,2) [not null, check: `unit_price >= 0`]
    currency      CurrencyCode  [not null, default: 'USD']
    line_total    decimal(12,2) [not null]
    discount      decimal(10,2) [default: 0, check: `discount >= 0`]

    indexes {
      (customer_id, date_key) [name: 'idx_sales_customer_date']
      (product_id,  date_key) [name: 'idx_sales_product_date']
    }

    checks {
      `line_total = (quantity * unit_price) - discount`
        [name: 'chk_line_total_matches',
         note: 'Sanity check: line_total must equal computed value. Catches loader bugs.']
    }
  }

  Entity fact_returns [note: 'One row per returned line. Grain: order_id × line_id × return_event.'] {
    return_id     int           [pk, increment]
    order_id      int           [not null]
    line_id       int           [not null]
    customer_id   int           [not null, ref: > sales.dim_customer.id]
    product_id    int           [not null, ref: > sales.dim_product.id]
    return_date_key int         [not null, ref: > sales.dim_date.date_key]
    quantity      int           [not null, check: `quantity > 0`]
    refund_amount decimal(10,2) [not null, check: `refund_amount >= 0`]
    reason_code   varchar       [note: 'Three-letter return reason code from the returns taxonomy.']
  }

  // --------------------------------------------------------------------------
  //  Imported dimension entities (Container-scoped, with clone blocks)
  //
  //  These three dimensions come from `./09-modules-conformed-dimensions`.
  //  Because the directive sits inside `Container sales`, each entity is
  //  placed inside this container -- `sales.dim_customer`, etc.
  //
  //  The clone blocks embed the dimension content directly so this file is
  //  self-contained. Without the clone blocks, the parser would open the
  //  referenced file at parse time (DBML-compatible behavior).
  // --------------------------------------------------------------------------

  reuse { entity core.dim_customer, entity core.dim_product, entity core.dim_date }
    from './09-modules-conformed-dimensions'
    [cloned_at: '2026-06-10T08:00:00Z']
  {
    Entity dim_customer [note: 'One row per customer. Cloned from conformed dimensions 2026-06-10.'] {
      id           int           [pk, increment]
      customer_key varchar       [unique, not null]
      email        Email         [unique, not null]
      phone        PhoneE164
      country      CountryCode   [not null]
      created_at   timestamp     [not null]
      is_active    boolean       [not null, default: true]
    }

    Entity dim_product [note: 'One row per SKU. Cloned from conformed dimensions 2026-06-10.'] {
      id              int           [pk, increment]
      sku             varchar       [unique, not null]
      name            varchar       [not null]
      category        varchar       [not null]
      list_price      decimal(10,2) [not null, check: `list_price >= 0`]
      currency        CurrencyCode  [not null, default: 'USD']
      is_active       boolean       [not null, default: true]
      launched_at     date
      discontinued_at date
    }

    Entity dim_date [note: 'Calendar dimension. Cloned from conformed dimensions 2026-06-10.'] {
      date_key       int           [pk]
      full_date      date          [unique, not null]
      year           int           [not null]
      quarter        int           [not null, check: `quarter BETWEEN 1 AND 4`]
      month          int           [not null, check: `month BETWEEN 1 AND 12`]
      day_of_month   int           [not null, check: `day_of_month BETWEEN 1 AND 31`]
      day_of_week    int           [not null, check: `day_of_week BETWEEN 1 AND 7`]
      is_weekend     boolean       [not null]
      is_holiday     boolean       [not null, default: false]
      fiscal_year    int           [not null]
      fiscal_quarter int           [not null, check: `fiscal_quarter BETWEEN 1 AND 4`]
    }
  }
}


// -----------------------------------------------------------------------------
//  File-scope imports: scalar Named Types
//
//  Scalar Types are top-level constructs, so the directive sits at file scope.
//  Once imported, the types (Email, CountryCode, CurrencyCode, PhoneE164) are
//  in this file's namespace and can be used anywhere a type expression is
//  permitted -- including inside the Container above. xDBML's two-pass name
//  resolution handles the forward reference: the fact entities use these
//  types before the directive declaring them is encountered textually.
// -----------------------------------------------------------------------------

reuse { type Email, type CountryCode, type CurrencyCode, type PhoneE164 }
  from './09-modules-conformed-dimensions'
  [cloned_at: '2026-06-10T08:00:00Z']
{
  Type Email varchar [
    pattern: '^[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}$',
    maxLength: 320,
    tags: ['pii', 'gdpr-subject']
  ]

  Type CountryCode varchar [
    pattern: '^[A-Z]{2}$',
    minLength: 2,
    maxLength: 2
  ]

  Type CurrencyCode varchar [
    pattern: '^[A-Z]{3}$',
    minLength: 3,
    maxLength: 3
  ]

  Type PhoneE164 varchar [
    pattern: '^\\+[1-9]\\d{1,14}$',
    maxLength: 16,
    tags: ['pii']
  ]
}


// -----------------------------------------------------------------------------
//  Visualization
// -----------------------------------------------------------------------------

TableGroup sales_facts [
  color: '#1976d2',
  note: 'Local fact tables for the sales data product.'
] {
  fact_sales
  fact_returns
}

TableGroup imported_dimensions [
  color: '#0a7d3f',
  note: 'Cloned from the conformed-dimensions library. Refreshed quarterly.'
] {
  dim_customer
  dim_product
  dim_date
}

```

---

[← Back to all examples](/examples/)
