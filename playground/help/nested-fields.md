---
title: Nested fields
description: How object, array, and polymorphism children are visualized inside entity cards.
---

# Nested fields

xDBML lets fields have structured types: objects with their own sub-fields, arrays of elements, oneOf alternatives, maps, sets, and so on. The diagram renders these structures as indented rows inside the entity card, with disclosure carets that let you collapse or expand them.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `nested-fields-expanded.png`
Caption: An entity card with a nested object and an array of objects, both expanded to show their children.
Should show: a single entity card (e.g. a customer record from the e-commerce or FHIR example) tall enough to show several levels of nesting. At least one `object {...}` field expanded, one `array of object` expanded, and ideally one polymorphic `oneOf` row visible. Disclosure carets (▾ or ▸) clearly visible on the parent rows.
:::

## Indented rows

When a field's type is structured, the field appears as a normal row, and its children appear as indented rows immediately below it. Indentation depth equals nesting depth: a top-level field is at indent 0, its direct children at indent 1, their children at indent 2, and so on.

The indent unit is small (12 pixels), so even deeply nested fields stay within the entity card width. Indent guide lines, drawn as faint vertical strips, help your eye follow which child belongs to which parent.

## The disclosure caret

Parent rows (rows whose field has children) carry a small caret at the start of the row:

- `▾` (downward-pointing) when expanded; clicking collapses
- `▸` (rightward-pointing) when collapsed; clicking expands

Clicking the caret toggles the collapse state. Only that one row's children are affected; other parent rows keep their state. Collapsing hides all descendants, not just direct children.

The caret has a generous transparent hit area around the visible icon, so accidentally-imprecise clicks still register.

## Synthetic rows

Some structural types have intermediate rows that don't correspond to user-written field names. These are called **synthetic rows** and are rendered in italic to distinguish them from real fields:

<svg viewBox="0 0 540 280" xmlns="http://www.w3.org/2000/svg" style="max-width: 540px; width: 100%; height: auto; background: white; display: block; margin: 1rem 0;" role="img" aria-label="Three examples of synthetic rows: array element, oneOf alternative, and map key/value">
  <!-- Array of object -->
  <text x="10" y="20" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600" fill="#475569">Array element</text>
  <text x="20" y="42" font-size="11" fill="#475569">▾</text>
  <text x="36" y="42" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#1e293b">addresses</text>
  <text x="500" y="42" font-family="ui-monospace, monospace" font-size="11" fill="#64748b" text-anchor="end">array of object</text>
  <line x1="40" y1="50" x2="40" y2="80" stroke="#e2e8f0" stroke-width="1" />
  <text x="48" y="68" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-style="italic" fill="#475569">[item]</text>
  <text x="500" y="68" font-family="ui-monospace, monospace" font-size="11" fill="#64748b" text-anchor="end">object</text>
  <line x1="56" y1="76" x2="56" y2="100" stroke="#e2e8f0" stroke-width="1" />
  <text x="64" y="92" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#1e293b">street</text>
  <text x="500" y="92" font-family="ui-monospace, monospace" font-size="11" fill="#64748b" text-anchor="end">varchar</text>

  <!-- oneOf -->
  <text x="10" y="130" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600" fill="#475569">oneOf alternatives</text>
  <text x="20" y="152" font-size="11" fill="#475569">▾</text>
  <text x="36" y="152" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#1e293b">payment_method</text>
  <text x="500" y="152" font-family="ui-monospace, monospace" font-size="11" fill="#64748b" text-anchor="end">oneOf (2)</text>
  <line x1="40" y1="160" x2="40" y2="205" stroke="#e2e8f0" stroke-width="1" />
  <text x="48" y="178" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" font-style="italic" fill="#475569">{card}</text>
  <text x="500" y="178" font-family="ui-monospace, monospace" font-size="11" fill="#64748b" text-anchor="end">object</text>
  <line x1="56" y1="186" x2="56" y2="205" stroke="#e2e8f0" stroke-width="1" />
  <text x="64" y="202" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#1e293b">last4</text>
  <text x="500" y="202" font-family="ui-monospace, monospace" font-size="11" fill="#64748b" text-anchor="end">varchar</text>

  <!-- Map -->
  <text x="10" y="240" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" font-weight="600" fill="#475569">Map key/value</text>
  <text x="20" y="262" font-size="11" fill="#475569">▾</text>
  <text x="36" y="262" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="#1e293b">attributes</text>
  <text x="500" y="262" font-family="ui-monospace, monospace" font-size="11" fill="#64748b" text-anchor="end">map [varchar → varchar]</text>
</svg>

Synthetic rows you'll see:

- **`[item]`** for the element type of an array. If the array's element has its own name in the source (some xDBML variants allow this), that name appears instead.
- **`{card}`, `{check}`, etc.** for the named alternatives of a `oneOf`, `anyOf`, or `allOf` polymorphism. The braces signal "this is one of multiple alternatives."
- **`<key>` and `<value>`** for the key and value types of a map.
- **`<item>`** for the element type of a set.
- **`[0]`, `[1]`, etc.** for the positions in a tuple.

You can't click a synthetic row to inspect it (in the current version); clicking it opens the inspector for the parent named field. A future version may add synthetic-row inspection for showing the structural details of array/oneOf/map types.

## Named types

Fields whose type references a top-level `Type` declaration (rather than a built-in scalar like `int` or `varchar`) get the same expansion treatment as inline `object {...}` fields. The type's body shows as indented rows below the referencing field, with a disclosure caret to toggle.

For example, in the e-commerce sample, `Type MonetaryAmount` is defined once at the top of the schema with `amount` and `currency` fields. Every entity field typed as `MonetaryAmount` then expands to show those two sub-fields inline:

```xdbml
Type MonetaryAmount {
  amount   Decimal128
  currency string
}

Table products {
  price  MonetaryAmount   // expands inline: amount + currency
}
```

The same type used in multiple fields expands at each occurrence. If your schema uses a `MonetaryAmount` type in five different entities, all five places show the same `amount` + `currency` structure. The visual repetition is information: it tells you "this is the same type used here." You can collapse any individual occurrence independently if it gets too noisy.

### Recursive types

A `Type` can reference itself (directly or via another type), forming a cycle. For example:

```xdbml
Type Node {
  id     int
  parent Node     // a Node references itself
}
```

To prevent the diagram from trying to render an infinite chain, the playground stops expansion when a type's name reappears in the current expansion path. The cyclic field shows its type name (`Node`) but no caret, signaling "this is a node like above, but we won't draw it again here." If you want to inspect the type's structure from another angle, you can look at any non-recursive occurrence elsewhere in the diagram, or read the source.

### When the type isn't defined

If a field's type identifier doesn't match any declared `Type`, the playground treats it as a leaf scalar (no caret, no expansion). This happens for genuine scalar types (`int`, `varchar`, `objectId`) and also for typos or references to types that haven't been declared yet. The diagram won't show an error in that case; the inspector will.

## What gets collapsed and what stays

Collapsing a parent hides all of its descendants, regardless of depth. So collapsing a top-level `addresses` array hides not only `[item]` but also every field inside the array element's object type. Expanding shows them all back.

If you want to collapse only some descendants, click the carets at the depth you want; each parent toggles independently. The diagram supports any pattern of partial collapsing.

## Collapse state persists

The collapse state for every field path is saved to your browser's local storage, scoped per entity. So if you collapse `addresses.[item]` in the `customers` entity, that state is restored on reload, even if you edit the schema between sessions (as long as the field path still exists).

If you rename a field or restructure the entity such that a previously-collapsed path no longer exists, the stored state is harmless: it simply doesn't apply to anything.

## Selecting a nested field

Clicking on any field row, at any depth, selects that field. The inspector opens and shows the full dotted path under "Identification" so you know exactly where in the structure the field lives.

The inspector's "Path" line might read `addresses.[item].street` or `payment_method.{card}.last4` to reflect the synthetic rows traversed to reach the leaf.

## Why nesting is part of xDBML

Nested structures are a first-class concept in document databases (MongoDB, Cosmos, Couchbase) and increasingly in relational databases that support JSON columns. xDBML supports them natively so a single language can describe both flat relational tables and richly nested document schemas. The playground's nesting visualization is built to handle both cases without forcing a flatten-to-rows transformation.

## What's next

- [**Entity cards**](./entity-cards): the cards that hold the nested rows.
- [**Visual cues at a glance**](./visual-cues): the compact reference for all of the visual signals.
- [**Inspector pane**](./inspector-pane): the metadata view that shows full structural detail on selection.
