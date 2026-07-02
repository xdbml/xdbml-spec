---
title: Grammar test cases
description: Reference test corpus for xDBML grammar validation. VALID and INVALID examples organized by specification section. Every conforming parser must accept the VALID and reject the INVALID cases. Includes v0.1 baseline cases and v0.2 additions (module system, scalar Named Types).
---


A more comprehensive test corpus, with expected ASTs in JSON form, is planned for a future release. The grammar repository (`grammar/`) currently contains the grammar file (`xDBML.g4`) and this reference test corpus only.

---

## §17.1 Version declaration

### VALID -- bare version

```
xdbml: 0.1
Project p { targets: Oracle }
```

### VALID -- with experimental opt-in

```
xdbml: 0.1
experimental: [graph_path_expressions]

Project p { targets: Oracle }
```

### VALID -- DBML compatibility (no version declaration)

```
Table users {
  id int [pk]
  email varchar
}
```

### INVALID -- version declared after other constructs

```
Project p { }
xdbml: 0.1
```

Expected error: "version declaration must precede all other constructs."

---

## §17.2 Nested / hierarchical structures

### VALID -- nested object

```
xdbml: 0.1

Entity customers {
  id int [pk]
  address object {
    street varchar [not null]
    city   varchar [not null]
  }
}
```

### VALID -- array of named objects

```
xdbml: 0.1

Entity orders {
  id int [pk]
  line_items array [
    line_item object {
      sku      varchar
      quantity int
    }
  ]
}
```

### VALID -- heterogeneous tuple

```
xdbml: 0.1

Entity customers {
  id int [pk]
  addresses array [
    [0] billing  object {
      street varchar
      city varchar
    }
    [1] shipping object {
      street varchar
      city varchar
    }
  ]
}
```

### VALID -- recursive named type

```
xdbml: 0.1

Type TreeNode {
  value int
  children array [child TreeNode]
}

Entity org_chart {
  root_id int [pk]
  tree    TreeNode
}
```

### INVALID -- tuple positions not contiguous

```
xdbml: 0.1

Entity bad {
  arr array [
    [0] first  object { x int }
    [2] third  object { x int }
  ]
}
```

Expected error (semantic-analysis pass, not grammar): "tuple positions must be contiguous starting at 0."

---

## §17.3 Polymorphism

### VALID -- oneOf with discriminator

```
xdbml: 0.1

Entity payments {
  method oneOf {
    card object {
      last4 varchar(4)
      brand varchar
    }
    bank object { iban varchar }
  } [discriminator: method_kind]
}
```

### VALID -- union (scalar type alternatives)

```
xdbml: 0.1

Entity records {
  score      union [int, decimal, null]
  legacy_id  union [string, int] [not null]
}
```

### VALID -- array element-type shorthand (folds to a union)

```
xdbml: 0.1

Entity records {
  ids     array [int, varchar]          // shorthand for array [union [int, varchar]]
  mixed   array [int, varchar, null]
  tagged  array [union [int, varchar]]   // explicit form, still valid
}
```

### VALID -- polymorphism inside an array

```
xdbml: 0.1

Entity event_log {
  events array [
    event oneOf {
      user_event object {
        type varchar
        user_id objectId
        action varchar
      }
      item_event object {
        type varchar
        item_id objectId
        qty int
      }
    } [discriminator: type]
  ]
}
```

---

## §17.5 JSON-with-schema

### VALID -- opaque JSON

```
xdbml: 0.1

Entity api_logs {
  payload json
  response variant
}
```

### VALID -- JSON with inline schema

```
xdbml: 0.1

Entity orders {
  id int [pk]
  payload json {
    shipping_address object {
      street varchar
      city   varchar
    }
    items array [
      item object {
        sku varchar
        quantity int
      }
    ]
  }
}
```

### VALID -- BSON types

```
xdbml: 0.1

Container app [type: database] {
  Collection users {
    _id          objectId    [pk]
    email        varchar     [unique]
    balance      Decimal128
    last_login   Date
    avatar       BinData
  }
}
```

---

## §17.6 Path syntax

### VALID -- path on index

```
xdbml: 0.1

Entity orders {
  id int [pk]
  line_items array [
    line_item object {
      sku varchar
      quantity int
    }
  ]

  indexes {
    line_items.sku                  // implicit array iteration (allowed in indexes)
    line_items.[*].sku              // explicit array iteration
    line_items.[0].sku              // positional
  }
}
```

### VALID -- quoted segment for non-identifier name

```
xdbml: 0.1

Entity legacy {
  data object {
    "user.id" varchar
  }

  indexes {
    data."user.id"
  }
}
```

### VALID -- JSONPath alias (parses, normalizes to dot-prefixed)

```
xdbml: 0.1

Entity orders {
  id int [pk]
  items array [item object { sku varchar }]

  indexes {
    items[*].sku    // JSONPath alias; normalizes to items.[*].sku
  }
}
```

### INVALID -- implicit array iteration in Ref source path

```
xdbml: 0.1

Entity orders {
  id int [pk]
  line_items array [item object { sku varchar }]
}

Entity products {
  sku varchar [pk]
}

Ref: orders.line_items.sku > products.sku
```

Expected error (semantic-analysis pass): "Ref source path crosses array; explicit .[*] required."

### VALID -- explicit .[*] in Ref

```
Ref: orders.line_items.[*].sku > products.sku
```

---

## §17.7 Container

### VALID -- explicit container

```
xdbml: 0.1

Container core [type: schema] {
  Entity users {
    id int [pk]
    name varchar
  }
}
```

### VALID -- container synonyms

```
xdbml: 0.1

Database orders_store {
  Collection orders {
    _id objectId [pk]
  }
}

Keyspace metrics {
  Table page_views {
    event_id varchar [pk]
  }
}

Namespace events {
  Record OrderPlaced {
    event_id varchar [pk]
  }
}
```

### VALID -- cross-container reference

```
xdbml: 0.1

Container core [type: schema] {
  Entity customers {
    id int [pk]
  }
}

Container sales [type: schema] {
  Entity orders {
    id          int [pk]
    customer_id int [ref: > core.customers.id]
  }
}

Ref: sales.orders.customer_id > core.customers.id
```

---

## §17.8 Named types

### VALID -- named type referenced from multiple entities

```
xdbml: 0.1

Type Address {
  street varchar
  city varchar
}

Entity customers {
  primary_address   Address
  alternate_address Address
}

Entity orders {
  shipping_address Address
}
```

### INVALID -- named type shadows builtin

```
xdbml: 0.1

Type varchar {           // shadows builtin
  custom_field int
}
```

Expected error (semantic-analysis pass): "named type 'varchar' shadows built-in type keyword; rename or remove."

---

## §17.9 AI-readiness settings

### VALID -- all four AI-readiness settings

```
xdbml: 0.1

Entity customers {
  mrr_amount decimal(10,2) [
    synonyms: ['monthly revenue', 'recurring revenue'],
    business_term: 'https://glossary.acme.com/MRR',
    tags: ['finance', 'kpi'],
    granularity: month
  ]
}
```

### VALID -- custom property with x_ prefix

```
xdbml: 0.1

Entity customers [
  x_governance_owner: 'finance-team@acme.com',
  x_collibra_asset_id: 'urn:collibra:asset:abc-123'
] {
  id int [pk]
  name varchar
}
```

---

## §17.10 Cardinality

### VALID -- compact form

```
xdbml: 0.1

Entity customers { id int [pk] }
Entity orders { id int [pk]; customer_id int }

Ref: orders.customer_id > customers.id
```

### VALID -- explicit source/target cardinality

```
Ref: orders.customer_id > customers.id [source: '1..*', target: '1..1']
```

### VALID -- four-key alternative form

```
Ref: pets.owner_id > people.id [
  min_source: 0, max_source: '*',
  min_target: 0, max_target: 1
]
```

---

## §17.11 Edge

### VALID -- basic edge

```
xdbml: 0.1

Entity Person { id int [pk]; name varchar }

Edge KNOWS [source: Person, target: Person] {
  since    date [not null]
  intimacy int  [minimum: 0, maximum: 10]
}
```

### VALID -- edge with cardinality

```
Edge OWNS [source: Person, target: Pet,
           source_cardinality: '0..*', target_cardinality: '0..1'] {
  acquired_date date
}
```

### VALID -- undirected edge

```
Edge FRIENDS_WITH [source: Person, target: Person, undirected: true] {
  since date
}
```

### VALID -- multiple edges between same entities

```
Edge LIKES   [source: User, target: Post] { liked_at timestamp }
Edge SHARED  [source: User, target: Post] { shared_at timestamp }
Edge BLOCKED [source: User, target: Post] { blocked_at timestamp }
```

---

## §17.12 View

### VALID -- virtual view

```
xdbml: 0.1

View active_customers [materialized: false] {
  source_query: '''
    SELECT id, email, name
    FROM customers
    WHERE deleted_at IS NULL
  '''
  id    int [pk]
  email varchar
  name  varchar
}
```

### VALID -- materialized view with refresh settings

```
View monthly_revenue [materialized: true,
                      refresh_schedule: 'daily',
                      source_database: 'Oracle'] {
  source_query: '''
    SELECT TRUNC(placed_at, 'MM') AS month, SUM(total) AS revenue
    FROM orders
    GROUP BY TRUNC(placed_at, 'MM')
  '''
  month   date          [pk]
  revenue decimal(15,2)
}
```

### VALID -- view inside container

```
xdbml: 0.1

Container analytics [type: schema] {
  Entity orders {
    id int [pk]
    total decimal(10,2)
    placed_at timestamp
  }

  View daily_totals [materialized: true] {
    source_query: 'SELECT DATE(placed_at) day, SUM(total) total FROM orders GROUP BY DATE(placed_at)'
    day   date [pk]
    total decimal(10,2)
  }
}
```

---

## End-to-end: polyglot model

### VALID -- full polyglot model with Oracle, MongoDB, Avro, Neo4j

```
xdbml: 0.1

Project polyglot { targets: [Oracle, MongoDB, Avro, Neo4j] }

Type Address {
  street  varchar [not null]
  city    varchar [not null]
  country varchar
}

Type MonetaryAmount {
  amount   Decimal128 [not null]
  currency string     [not null, pattern: '^[A-Z]{3}$', minLength: 3, maxLength: 3]
}

Container core [type: schema, target: Oracle] {
  Entity customers {
    id              int     [pk]
    email           varchar [unique, not null, pattern: '^[^@]+@[^@]+$']
    display_name    varchar [not null]
    primary_address Address
  }
}

Container orders_store [type: database, target: MongoDB] {
  Collection orders {
    _id          objectId  [pk]
    customer_id  int32     [not null]
    placed_at    Date      [granularity: second]
    total        MonetaryAmount
    line_items   array [
      line_item object {
        sku        string [not null]
        quantity   int32  [not null, minimum: 1]
        unit_price MonetaryAmount
      }
    ]
    payment_method oneOf {
      card   object {
        last4 string [maxLength: 4]
        brand string
      }
      bank   object { iban string }
      wallet object {
        provider string
        account string
      }
    } [discriminator: method_kind]
  }
}

Container events [type: namespace, target: Avro] {
  Record OrderPlaced {
    event_id    string     [pk]
    occurred    long       [granularity: millisecond, not null]
    order_id    string     [not null]
    customer_id int        [not null]
    total       MonetaryAmount
  }
}

Container social [type: database, target: Neo4j] {
  Edge FOLLOWS [source: core.customers, target: core.customers,
                source_cardinality: '0..*', target_cardinality: '0..*'] {
    since      date    [not null]
    is_close   boolean [default: false]
  }
}

Ref: orders_store.orders.customer_id > core.customers.id [source: '1..*', target: '1..1']
Ref: orders_store.orders.line_items.[*].sku > catalog.products.sku
Ref: events.OrderPlaced.order_id > orders_store.orders._id
```

---

## §14.7 Scalar Named Types (v0.2)

### VALID -- scalar Named Type with validation settings

```
xdbml: 0.2

Type Email varchar [pattern: '^[^@]+@[^@]+$', tags: ['pii']]
Type CountryCode varchar [pattern: '^[A-Z]{2}$', minLength: 2, maxLength: 2]
Type Percentage decimal(5,2) [minimum: 0, maximum: 100]

Entity users {
  id      int [pk]
  email   Email
  country CountryCode
}
```

### VALID -- scalar Named Type alongside object-shaped Type

```
xdbml: 0.2

Type Email varchar [pattern: '^[^@]+@[^@]+$']
Type Address {
  street  varchar [not null]
  city    varchar [not null]
}

Entity customers {
  id              int [pk]
  email           Email
  primary_address Address
}
```

### VALID -- scalar Named Type referencing another Type

```
xdbml: 0.2

Type Email varchar [pattern: '^[^@]+@[^@]+$']
Type PII_Email Email [tags: ['pii', 'gdpr-subject']]

Entity customers {
  id    int [pk]
  email PII_Email
}
```

---

## §26 Module system (v0.2)

### VALID -- reuse * (import all) at file scope

```
xdbml: 0.2

Project app { targets: [PostgreSQL] }

reuse * from './catalog'

Container ordering [type: schema] {
  Entity orders {
    id          int [pk]
    customer_id int
  }
}
```

### VALID -- selective import inside Container body

```
xdbml: 0.2

Project app { targets: [PostgreSQL] }

Container ordering [type: schema] {
  reuse { entity core.products, entity core.categories } from './catalog'

  Entity orders {
    id          int [pk]
    customer_id int
  }

  Entity order_lines {
    order_id   int [ref: > ordering.orders.id]
    product_id int [ref: > ordering.products.id]
    quantity   int
  }
}
```

### VALID -- import with clone block

```
xdbml: 0.2

Project sales_data_product { targets: [Snowflake] }

Container facts [type: schema] {
  reuse { entity core.dim_customer } from './conformed-dimensions' [cloned_at: '2026-06-06T14:30:00Z'] {
    Entity dim_customer {
      id    int     [pk]
      email varchar [pattern: '^[^@]+@[^@]+$', tags: ['pii']]
    }
  }

  Entity fact_sales {
    customer_id int [ref: > facts.dim_customer.id]
    amount      decimal(10,2)
  }
}
```

### VALID -- aliased import

```
xdbml: 0.2

Project app { targets: [PostgreSQL] }

Container app [type: schema] {
  reuse { entity users as auth_users } from './auth'
  reuse { entity users as billing_users } from './billing'

  Entity sessions {
    id              int [pk]
    auth_user_id    int [ref: > app.auth_users.id]
    billing_user_id int [ref: > app.billing_users.id]
  }
}
```

### VALID -- field-level import at file scope, used as a field type

```
xdbml: 0.2

Project new_system { targets: [PostgreSQL] }

reuse { field ops.customer_legacy.legacy_email as contact_email } from './legacy-customer' [cloned_at: '2026-06-06T14:30:00Z'] {
  contact_email varchar [pattern: '^[^@]+@[^@]+$', tags: ['pii']]
}

Container app [type: schema] {
  Entity new_customer {
    id            int           [pk]
    contact_email contact_email
  }
}
```

### VALID -- use (non-transitive) for private internal imports

```
xdbml: 0.2

use { type InternalAuditFields } from './internal-helpers'

Container ordering [type: schema] {
  Entity orders {
    id          int [pk]
    audit       InternalAuditFields
    customer_id int
  }
}
```

### VALID -- multi-line and comma-separated equivalence

```
xdbml: 0.2

// Multi-line form
reuse {
  entity products
  entity categories
  type Email
} from './catalog'

// Equivalent comma-separated single-line form
reuse { entity products, entity categories, type Email } from './catalog'
```

### VALID -- reference-only directive (no clone block, DBML-compatible)

```
xdbml: 0.2

Project order_system { targets: [PostgreSQL] }

Container ordering [type: schema] {
  reuse { entity core.products } from './catalog'

  Entity orders {
    id          int [pk]
    customer_id int
  }
}
```

### INVALID -- field import inside Container body

```
xdbml: 0.2

Container app [type: schema] {
  reuse { field core.dim_customer.email } from './conformed-dimensions'

  Entity new_customer {
    id    int [pk]
    email email
  }
}
```

Expected semantic error: "field imports may only appear at file scope (§25.5)."

### INVALID -- absolute path

```
xdbml: 0.2

reuse * from '/absolute/path/to/file.xdbml'
```

Expected error: "import path must begin with './' or '../' (relative paths only in v0.2 phase 1)."

### INVALID -- URL path (deferred to a later phase)

```
xdbml: 0.2

reuse * from 'https://example.com/schemas/users.xdbml'
```

Expected error: "URL imports are reserved for a later phase; v0.2 phase 1 supports relative paths only."

### INVALID -- v0.1 file using v0.2-only constructs

```
xdbml: 0.1

reuse { entity core.products } from './catalog'
```

Expected error: "the module system (use/reuse directives) requires xdbml: 0.2 or later; this document declares xdbml: 0.1."

### INVALID -- unrecognized element-type slot value

```
xdbml: 0.2

reuse { widget core.products } from './catalog'
```

Expected error: "unrecognized element type 'widget'; expected one of: table, entity, collection, record, enum, tablepartial, note, schema, container, tablegroup, type, edge, view, diagramview, field."

### INVALID -- importing Project

```
xdbml: 0.2

reuse { project some_project } from './other'
```

Expected error: "Project declarations are not importable (§26.4)."

---

## §10 Checks -- entity-level constraints (v0.2)

### VALID -- multi-column check expression

```
xdbml: 0.2

Entity users {
  id     int [pk]
  wealth decimal(15,2)
  debt   decimal(15,2)
  checks {
    `debt + wealth >= 0` [name: 'chk_positive_net_worth']
  }
}
```

### VALID -- multiple checks with and without names

```
xdbml: 0.2

Entity reservations {
  id         int  [pk]
  start_date date
  end_date   date
  checks {
    `start_date <= end_date`        [name: 'chk_valid_date_range']
    `end_date - start_date <= 30`   [name: 'chk_max_30_days']
    `start_date >= CURRENT_DATE`
  }
}
```

### VALID -- check with note

```
xdbml: 0.2

Entity orders {
  id     int [pk]
  status varchar
  shipped_at timestamp
  checks {
    `(status != 'shipped') OR (shipped_at IS NOT NULL)` [
      name: 'chk_shipped_has_timestamp',
      note: 'A shipped order must record the shipment timestamp.'
    ]
  }
}
```

### VALID -- entity with both checks and indexes

```
xdbml: 0.2

Entity inventory {
  id        int [pk]
  sku       varchar
  warehouse varchar
  qty       int
  indexes {
    (sku, warehouse) [unique]
  }
  checks {
    `qty >= 0` [name: 'chk_non_negative_qty']
  }
}
```

### INVALID -- check expression not backtick-wrapped

```
xdbml: 0.2

Entity users {
  id     int [pk]
  wealth decimal(15,2)
  checks {
    wealth >= 0
  }
}
```

Expected error: "check expressions must be backtick-wrapped EXPRESSION_LITERAL values."

---

## §11.9 Relationship settings -- inactive and color (v0.2)

### VALID -- inactive flag on Ref

```
xdbml: 0.2

Entity posts {
  id      int [pk]
  user_id int
}

Entity users {
  id int [pk]
}

Ref: posts.user_id > users.id [inactive]
```

### VALID -- inactive + color + note

```
xdbml: 0.2

Entity audit_log {
  id      int [pk]
  user_id int
}

Entity users {
  id int [pk]
}

Ref: audit_log.user_id > users.id [
  inactive,
  color: '#999999',
  note: 'Historical FK; superseded by audit_ref table'
]
```

### VALID -- color alone (active relationship with custom color)

```
xdbml: 0.2

Entity orders {
  id          int [pk]
  customer_id int
}

Entity customers {
  id int [pk]
}

Ref: orders.customer_id > customers.id [color: '#3f51b5']
```

---

## §16.2 TableGroup color (v0.2)

### VALID -- TableGroup with color and note

```
xdbml: 0.2

Entity orders { id int [pk] }
Entity order_lines { id int [pk] }
Entity invoices { id int [pk] }

TableGroup ecommerce [color: '#3498DB', note: 'Commerce-side entities'] {
  orders
  order_lines
  invoices
}
```

### VALID -- TableGroup with only color

```
xdbml: 0.2

Entity users { id int [pk] }
Entity sessions { id int [pk] }

TableGroup auth [color: '#FF5722'] {
  users
  sessions
}
```

---

## §25 Records -- expanded forms (v0.2)

### VALID -- records inside entity (implicit column list, v0.1 syntax)

```
xdbml: 0.2

Entity users {
  id    int [pk]
  name  varchar
  email varchar
  records {
    1, 'Alice', 'alice@example.com'
    2, 'Bob',   'bob@example.com'
  }
}
```

### VALID -- top-level records with explicit column list

```
xdbml: 0.2

Entity users {
  id    int [pk]
  name  varchar
  email varchar
}

records users (id, name, email) {
  1, 'Alice', 'alice@example.com'
  2, 'Bob',   'bob@example.com'
}
```

### VALID -- top-level records with cross-container reference

```
xdbml: 0.2

Container core [type: schema] {
  Entity users {
    id    int [pk]
    email varchar
  }
}

records core.users (id, email) {
  1, 'alice@example.com'
  2, 'bob@example.com'
}
```

### VALID -- value forms (string, number, boolean, null, date, enum, backtick)

```
xdbml: 0.2

Enum Status { active inactive pending }

Entity events {
  id          int [pk]
  occurred_at timestamp
  status      Status
  is_archived boolean
  payload     varchar
  records {
    1, '2026-06-10T14:30:00Z', Status.active,   true,  'string value'
    2, '2026-06-11T09:00:00Z', Status.pending,  false, null
    3, `gen_random_uuid()`,    Status.inactive, null,  '''multi
line string'''
  }
}
```

---

## Test runner

A reference TypeScript test harness (planned at `grammar/test-runner.ts`) parses each example, captures the resulting AST, and compares it against expected ASTs in `grammar/expected/*.json`. Implementations in other languages can run the same corpus with language-appropriate harnesses.

```
$ npx @xdbml/test-runner grammar/test-cases.md
PASS  §4.1.001   version declaration with experimental opt-in
PASS  §4.1.002   DBML document parses without xdbml: directive
FAIL  §10.6.005  expected error not raised: Ref source path crosses array
PASS  §6.1.001   explicit container with type
...
PASS rate: 247/250 (98.8%)
```

A conforming v0.2 implementation should achieve 100% pass rate on the published corpus, including v0.2 module system and scalar Named Type cases. A v0.1-only implementation should achieve 100% pass rate on the v0.1 subset and produce appropriate errors for v0.2 constructs.
