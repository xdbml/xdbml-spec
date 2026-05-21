---
title: Grammar test cases
description: Reference test corpus for xDBML v0.1 grammar validation. VALID and INVALID examples organized by specification section. Every conforming parser must accept the VALID and reject the INVALID cases.
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
    [0] billing  object { street varchar, city varchar }
    [1] shipping object { street varchar, city varchar }
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
    card object { last4 varchar(4), brand varchar }
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

### VALID -- polymorphism inside an array

```
xdbml: 0.1

Entity event_log {
  events array [
    event oneOf {
      user_event object { type varchar, user_id objectId, action varchar }
      item_event object { type varchar, item_id objectId, qty int }
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
      item object { sku varchar, quantity int }
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
    line_item object { sku varchar, quantity int }
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
      card   object { last4 string [maxLength: 4], brand string }
      bank   object { iban string }
      wallet object { provider string, account string }
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

A conforming v0.1 implementation should achieve 100% pass rate on the published corpus.
