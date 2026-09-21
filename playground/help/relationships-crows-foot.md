---
title: Relationships & crow's foot notation
description: How relationship lines are drawn and what the symbols at each endpoint mean.
---

# Relationships & crow's foot notation

Every `Ref:` declaration in your schema becomes a line in the diagram, connecting the source field to the target field. The shape of the line tells you which two fields are related; the symbols at each end tell you the cardinality and optionality of that relationship.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `relationships-overview.png`
Caption: A diagram with three relationships visible, demonstrating different cardinalities.
Should show: a small schema (e.g. blog or e-commerce) with three or four relationship lines visible, showing a mix of crow's foot variants at the endpoints (one-to-many, many-to-many, and one-or-zero). Cardinality text labels visible next to each endpoint.
:::

## Crow's foot symbols

Crow's foot notation has been the standard for ER diagrams since the 1980s. The vocabulary is small. Each endpoint of a relationship line carries one of four symbols, built from three primitives:

<svg viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg" style="max-width: 500px; width: 100%; height: auto; background: white; display: block; margin: 1rem 0;" role="img" aria-label="The four crow's-foot endpoint glyphs: exactly one, zero or one, one or many, zero or many">
  <!-- Exactly one: line + bar -->
  <line x1="40" y1="40" x2="100" y2="40" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="90" y1="30" x2="90" y2="50" stroke="#475569" stroke-width="2" fill="none" />
  <text x="120" y="36" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#1e293b">Exactly one</text>
  <text x="120" y="52" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#64748b">min=1, max=1  (mandatory, single)</text>

  <!-- Zero or one: line + ring + bar -->
  <line x1="40" y1="90" x2="100" y2="90" stroke="#475569" stroke-width="2" fill="none" />
  <circle cx="65" cy="90" r="5" stroke="#475569" stroke-width="1.5" fill="white" />
  <line x1="90" y1="80" x2="90" y2="100" stroke="#475569" stroke-width="2" fill="none" />
  <text x="120" y="86" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#1e293b">Zero or one</text>
  <text x="120" y="102" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#64748b">min=0, max=1  (optional, exclusive)</text>

  <!-- One or many: line + crow's foot.
       Crow's foot is drawn as three prongs originating at an inner
       anchor (x=86) and fanning OUTWARD to the line end (x=100). This
       puts the point of the V toward the entity and the open side at
       the line's tip, which is the correct convention. -->
  <line x1="40" y1="140" x2="100" y2="140" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="86" y1="140" x2="100" y2="125" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="86" y1="140" x2="100" y2="140" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="86" y1="140" x2="100" y2="155" stroke="#475569" stroke-width="2" fill="none" />
  <text x="120" y="136" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#1e293b">One or many</text>
  <text x="120" y="152" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#64748b">min=1, max=*  (mandatory, multiple)</text>

  <!-- Zero or many: line + ring + crow's foot.
       Same geometry as above for the crow's foot, plus a ring at x=65
       to signal optionality. -->
  <line x1="40" y1="190" x2="100" y2="190" stroke="#475569" stroke-width="2" fill="none" />
  <circle cx="65" cy="190" r="5" stroke="#475569" stroke-width="1.5" fill="white" />
  <line x1="86" y1="190" x2="100" y2="175" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="86" y1="190" x2="100" y2="190" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="86" y1="190" x2="100" y2="205" stroke="#475569" stroke-width="2" fill="none" />
  <text x="120" y="186" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#1e293b">Zero or many</text>
  <text x="120" y="202" font-family="ui-sans-serif, system-ui, sans-serif" font-size="11" fill="#64748b">min=0, max=*  (optional, multiple)</text>
</svg>

The three primitives compose into the four standard cases:

- **A bar (║)** caps the line for "exactly one" cardinality.
- **A ring (○)** marks "zero is allowed" (optional participation).
- **A crow's foot (≺)** marks "many" cardinality, with the V opening toward the related entity.

Combining them gives:

- **Bar alone**: exactly one. Mandatory, single.
- **Ring + bar**: zero or one. Optional, exclusive.
- **Crow's foot alone**: one or many. Mandatory, multiple.
- **Ring + crow's foot**: zero or many. Optional, multiple.

The ring always sits closer to the line, the bar or crow's foot at the line's end. The relationship is read by looking at each endpoint independently: "at this end, how many of this entity participate?"

## Where the cardinality comes from

xDBML has two ways to express cardinality, and the diagram uses whichever is present:

**Explicit settings** override everything else:

```xdbml
Ref: orders.customer_id > customers.id [source: '0..*', target: '1..1']
```

The strings are UML-style `min..max`. `0` means optional, `1` means mandatory minimum, `*` means unbounded maximum. The diagram parses these and picks the matching glyph at each end.

**Operator shorthand** is the default when no explicit cardinality is given:

```xdbml
Ref: orders.customer_id > customers.id
```

The four operators map to defaults:

| Operator | Meaning | Source glyph | Target glyph |
|---|---|---|---|
| `>` | many-to-one | crow's foot | bar |
| `<` | one-to-many | bar | crow's foot |
| `-` | one-to-one | bar | bar |
| `<>` | many-to-many | crow's foot | crow's foot |

The operators can't express optionality (the min is always 1 by default), so all four operator-only cases produce mandatory participation. If you need an optional side, use explicit `[source: '0..*']`.

## Non-standard cardinalities

xDBML accepts non-standard cardinalities like `[source: '2..5']` (between 2 and 5 instances). The crow's foot symbol can only approximate this; for the example above, the diagram draws a "one or many" glyph (`1..*`), since "between 2 and 5" is closer to that than to "exactly one" or "zero or one."

The exact text is shown alongside the glyph as a small label, so the precise value isn't lost. For non-standard cardinalities, the text is the source of truth and the glyph is a visual hint.

## The line itself

Relationship lines are drawn with horizontal and vertical segments only. The path is chosen to:

- Leave and enter each entity card on the side that faces the other endpoint
- Anchor at the vertical midpoint of the source or target field's row, when the endpoint names a field
- Turn at right angles, which keeps crossings legible on a busy diagram

The path is purely visual. The meaning is in the two endpoints and the symbols at each end.

## Relationship types and line styles

The line style tells you what kind of relationship it is:

| Line | Relationship | Written as |
|---|---|---|
| Solid | Foreign key (referential) | `Ref: orders.customer_id > customers.id` |
| Dotted | Foreign master (denormalized replication) | `Ref: orders.customer_name > customers.name [foreign_master]` |
| Small open circles | Inactive, of either kind | `[inactive]` on the Ref |

A **foreign master** records that the child attribute holds a copy of the parent's value, as document models often do. Nothing is generated from it; it documents where the copy comes from.

Each endpoint field also gets a marker badge, so you can tell a field's role without following the line:

- **fk** on the child side and **dk** on the parent side of a foreign key
- **fm** on the child side and **dm** on the parent side of a foreign master

A field that is the parent of both kinds shows dk and dm side by side. See [**Entity cards**](./entity-cards) for the other badges.

## Conceptual relationships

In a conceptual or early logical model, a relationship may name entities rather than fields:

```xdbml
Entity Customer { }
Entity Order { }

Ref: Customer > Order [target_verb: 'places']
```

The line then attaches to the edge of each card that faces the other card, not to a field row. It shows no cardinality glyph until a cardinality is written with `[source: ..., target: ...]`. A small filled triangle marks the direction it reads: `>` puts the triangle at the target, `<` at the source, `undirected: true` at both ends, and `-` nowhere, meaning linked with no direction stated.

A relationship to a subtype of a [supertype group](./supertype-groups) is written this way too, since a subtype declares only its own attributes: `Ref: Assignment.employee_id > Employee`.

## Roles, verbs and constraint type

A relationship can also carry the wording a conceptual or logical model reads it with, and whether the child depends on its parent for its identity. None of this changes how the line is drawn. Select the line and the inspector shows it.

### Roles and verbs

A relationship reads in two directions, and each direction has its own wording. In "a Customer plays the role of buyer and places zero or more Orders", `buyer` is a role and `places` is a verb. Read the other way: "an Order is a shopping cart that is bought by exactly one Customer". A role belongs to the entity at one end; a verb belongs to a reading direction. Four settings carry them:

```xdbml
Ref places: orders.customer_id > customers.id [
  source_role: 'shopping cart', source_verb: 'is bought by',
  target_role: 'buyer',         target_verb: 'places',
  source: '0..*',               target: '1..1'
]
```

`source_verb` reads from the source toward the target, and `target_verb` from the target toward the source. The two are usually converses of each other, and nothing checks that; you may state one, both, or neither. In the inspector, the **Reading** section lists the roles, verbs and cardinalities and reads them back as sentences, one per direction.

Roles and verbs are documentation: nothing is generated from them. They work the same on an entity-level relationship, which is where a conceptual model usually needs them.

### Identifying and non-identifying

A foreign key relationship is **identifying** when the child's foreign key attributes are part of the child's primary key: an order line cannot be identified without its order. It is **non-identifying** when the child stands on its own and merely points at its parent: an order points at its customer.

```xdbml
Ref: order_lines.order_id > orders.id [constraint_type: identifying]
Ref: orders.customer_id > customers.id [constraint_type: non_identifying]
```

The setting records the modeler's intent. It adds no key and checks none, so it can be stated before the child has a primary key, or any attributes at all. Leaving it out means the constraint type is not stated yet, which is different from `non_identifying`. It applies to foreign keys only: a foreign master has no key dependency, and a many-to-many relationship has no single child. On a foreign master it is reported as an error.

The diagram draws identifying and non-identifying relationships the same way. The inspector shows the value as **Constraint**.

## Relationship names

A named relationship (`Ref places: ...`) can show its name at the middle of its line. Turn on **Display > Relationship names** in the diagram toolbar; the option is off by default and also shows the names of supertype groups.

## Showing and hiding relationships

The **Display** menu in the diagram toolbar has a checkbox per kind: **Foreign key**, **Foreign master**, **Inactive**, **Conceptual** and **Supertype groups**, plus **Relationship names** under Labels. The choices are remembered between sessions. When a relationship kind is hidden, the Display button is highlighted so you know something is off screen.

## Selection

Clicking on a relationship line selects it. The line and both endpoint glyphs turn blue and the stroke thickens. The inspector pane opens showing the operator, source and target, the name if there is one, the relationship type (foreign key or foreign master), the reading direction, the constraint type (identifying or non-identifying) when stated, and a Reading section with the roles, verbs and cardinalities, read back as sentences. See [**Inspector pane**](./inspector-pane).

The hit area for clicking is wider than the visible line, since the visible 1.5-pixel line would be hard to target precisely. You can click within a few pixels of the line and it counts as a click on the line.

## What if I want a different notation?

The playground uses crow's foot notation for relationships and the half-circle for [supertype groups](./supertype-groups). Other ERD notations (Chen, Bachman, UML's filled-and-open-arrows) are not currently supported. If you'd find them useful, [open an issue](https://github.com/xdbml/xdbml-spec/issues) and we'll track interest.

## What's next

- [**Entity cards**](./entity-cards): the cards the lines connect.
- [**Containers**](./containers): cross-container relationships.
- [**Supertype groups**](./supertype-groups): the half-circle between a supertype and its subtypes.
- [**Visual cues at a glance**](./visual-cues): the compact visual reference for all of the symbols.
