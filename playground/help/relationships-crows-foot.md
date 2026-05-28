---
title: Relationships & crow's foot notation
description: How relationship lines are drawn and what the symbols at each endpoint mean.
---

# Relationships & crow's foot notation

Every `Ref:` declaration in your schema becomes a curved line in the diagram, connecting the source field to the target field. The shape of the line tells you which two fields are related; the symbols at each end tell you the cardinality and optionality of that relationship.

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

Relationship lines are drawn as smooth cubic Bezier curves between endpoints. The exact path is chosen to:

- Start and end on the left or right edge of each entity card, whichever side is closer to the other endpoint
- Anchor at the vertical midpoint of the source or target field's row
- Curve out horizontally before bending toward the other endpoint, which keeps line crossings legible

The curve is purely visual. The semantic content is in the two endpoints' field paths and the symbols at each end.

## Selection

Clicking on a relationship line selects it. The line and both endpoint glyphs turn blue and the stroke thickens. The inspector pane opens showing the operator, source path, target path, optional name, and any settings.

The hit area for clicking is wider than the visible line, since the visible 1.5-pixel line would be hard to target precisely. You can click within a few pixels of the line and it counts as a click on the line.

## What if I want a different notation?

The playground uses crow's foot notation only. Other ERD notations (Chen, Bachman, UML's filled-and-open-arrows) are not currently supported. If you'd find them useful, [open an issue](https://github.com/xdbml/xdbml-spec/issues) and we'll track interest.

## What's next

- [**Entity cards**](./entity-cards): the cards the lines connect.
- [**Containers**](./containers): cross-container relationships.
- [**Visual cues at a glance**](./visual-cues): the compact visual reference for all of the symbols.
