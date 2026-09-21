---
title: Supertype groups
description: How a supertype group is drawn, what the marks in its symbol mean, and how to inspect it.
---

# Supertype groups

A supertype group states that several entities are specialized forms of one more general entity: a Person and an Organization are both kinds of Party. The supertype holds the attributes they share, and each subtype declares only its own. The diagram draws the group as a half-circle between the supertype and its subtypes. Supertype groups arrived with xDBML v0.5; the language side is in [spec §12](/spec/v0.5#_12-supertype-group-generalization-and-inheritance).

::: screenshot
**[Screenshot needed]**
Filename suggestion: `supertype-groups-overview.png`
Caption: Example 14, with its three supertype groups.
Should show: Party at the top with two symbols on its bottom edge (legal_nature with a cross and a bar, business_role plain), Person, Organization, Customer and Supplier below, Employee and Contractor below Person, with Display > Relationship names turned on so the group names show.
:::

## Reading the symbol

The half-circle sits below the supertype with its rounded side up. One line runs from the supertype's bottom edge to the top of the curve. One line leaves the middle of the flat base, reaches a short horizontal line, and drops to each subtype.

Two marks inside the half-circle show what the group states about its instances:

- **A cross** means `exclusivity: disjoint`: an instance of the supertype belongs to at most one subtype of the group. No cross means `overlapping`: an instance may belong to several.
- **A bar just above the base** means `completeness: total`: every instance of the supertype belongs to at least one subtype. No bar means `partial`: an instance may belong to none.
- **A dashed mark** means the setting is not stated yet. Each setting gets its own mark, so a group that states only `completeness: total` shows a solid bar and a dashed cross.

<svg viewBox="0 0 560 150" xmlns="http://www.w3.org/2000/svg" style="max-width: 560px; width: 100%; height: auto; background: white; display: block; margin: 1rem 0;" role="img" aria-label="The five supertype group symbols: total disjoint, total overlapping, partial disjoint, partial overlapping, and both settings unstated">
  <text x="60" y="24" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#1e293b">Total, disjoint</text>
  <line x1="60" y1="36" x2="60" y2="90" stroke="#475569" stroke-width="2" fill="none" />
  <path d="M 38 112 A 22 22 0 0 1 82 112 Z" stroke="#475569" stroke-width="2" fill="white" />
  <line x1="60" y1="112" x2="60" y2="138" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="44.6" y1="96.3" x2="69.9" y2="106" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="75.4" y1="96.3" x2="50.1" y2="106" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="38.8" y1="106" x2="81.2" y2="106" stroke="#475569" stroke-width="2" fill="none" />
  <text x="170" y="24" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#1e293b">Total, overlapping</text>
  <line x1="170" y1="36" x2="170" y2="90" stroke="#475569" stroke-width="2" fill="none" />
  <path d="M 148 112 A 22 22 0 0 1 192 112 Z" stroke="#475569" stroke-width="2" fill="white" />
  <line x1="170" y1="112" x2="170" y2="138" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="148.8" y1="106" x2="191.2" y2="106" stroke="#475569" stroke-width="2" fill="none" />
  <text x="280" y="24" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#1e293b">Partial, disjoint</text>
  <line x1="280" y1="36" x2="280" y2="90" stroke="#475569" stroke-width="2" fill="none" />
  <path d="M 258 112 A 22 22 0 0 1 302 112 Z" stroke="#475569" stroke-width="2" fill="white" />
  <line x1="280" y1="112" x2="280" y2="138" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="264.6" y1="96.3" x2="289.9" y2="106" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="295.4" y1="96.3" x2="270.1" y2="106" stroke="#475569" stroke-width="2" fill="none" />
  <text x="390" y="24" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#1e293b">Partial, overlapping</text>
  <line x1="390" y1="36" x2="390" y2="90" stroke="#475569" stroke-width="2" fill="none" />
  <path d="M 368 112 A 22 22 0 0 1 412 112 Z" stroke="#475569" stroke-width="2" fill="white" />
  <line x1="390" y1="112" x2="390" y2="138" stroke="#475569" stroke-width="2" fill="none" />
  <text x="500" y="24" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="12" fill="#1e293b">Unstated</text>
  <line x1="500" y1="36" x2="500" y2="90" stroke="#475569" stroke-width="2" fill="none" />
  <path d="M 478 112 A 22 22 0 0 1 522 112 Z" stroke="#475569" stroke-width="2" fill="white" />
  <line x1="500" y1="112" x2="500" y2="138" stroke="#475569" stroke-width="2" fill="none" />
  <line x1="484.6" y1="96.3" x2="509.9" y2="106" stroke="#475569" stroke-width="2" fill="none" stroke-dasharray="3.5 2.5" />
  <line x1="515.4" y1="96.3" x2="490.1" y2="106" stroke="#475569" stroke-width="2" fill="none" stroke-dasharray="3.5 2.5" />
  <line x1="478.8" y1="106" x2="521.2" y2="106" stroke="#475569" stroke-width="2" fill="none" stroke-dasharray="3.5 2.5" />
</svg>

| Symbol | Settings | Reads as |
|---|---|---|
| Cross and bar | `total`, `disjoint` | Every Party is exactly one of the subtypes. |
| Bar only | `total`, `overlapping` | Every Party is at least one of the subtypes, possibly several. |
| Cross only | `partial`, `disjoint` | A Party is at most one of the subtypes, or none of them. |
| Neither | `partial`, `overlapping` | A Party may be any of the subtypes, several, or none. |
| Dashed cross and bar | not stated | Nothing is stated yet about either question. |

The materialization settings (`strategy`, `merge`, `discriminator`) are not drawn. They describe how a physical model is meant to be derived, and you see them in the inspector.

## Several groups and several levels

One supertype may anchor several groups, one per axis of specialization: a Party is a Person or an Organization by legal nature, and a Customer or a Supplier by business role. Each group gets its own symbol, and their lines leave the supertype's bottom edge at evenly spaced points, left to right in the order the groups are declared.

A subtype may be the supertype of another group: a Person may also be an Employee or a Contractor. The symbols then stack level by level.

## Arranging and dragging

**Arrange > Relational** places each supertype above its subtypes and centers it over them, with the subtypes of all its groups side by side and deeper levels below. The rest of the diagram is arranged around the hierarchy.

When you drag an entity, the group's lines follow. In this version the subtypes are expected below their supertype: if you drag a subtype above it, the line still reaches the subtype, but the drawing gets awkward.

A relationship line that would attach where a group's line sits (the middle of the supertype's bottom edge, the middle of a subtype's top edge) moves near the corner of that edge instead.

## Group names

Group names appear beside their symbols when **Display > Relationship names** is on. The option is off by default and also shows the names of named `Ref`s.

## Showing and hiding

**Display > Supertype groups** hides every symbol and its lines. The entities stay where they are.

## Inspecting a group

Click a symbol to select the group. The symbol and its lines are highlighted, and the inspector shows:

- the supertype and each subtype, as links;
- completeness and exclusivity, shown as "Unstated" when absent, then read back as a sentence such as "Every Party is exactly one of: Person, Organization.";
- each subtype's own strategy, or "follows the group";
- the materialization settings, the remaining settings, and the note.

Selecting an entity that takes part in a group adds a **Supertype groups** section to its inspector: a supertype lists each group it anchors with that group's subtypes, a subtype lists its group and its supertype, and an entity that is both shows both. Every name there is a link that selects the group or the entity.

## Diagnostics you may see

- **`subtype-in-multiple-groups`**: an entity is a subtype in one group only.
- **`supertype-attribute-redeclared`**: a subtype repeats an attribute its supertype already declares. A subtype declares only its own attributes.
- **`discriminator-on-overlapping-group`**: one discriminator attribute cannot record membership in several subtypes at once.
- **`unresolved-supertype-group-member`**: the supertype or a subtype does not name an entity. A group with no drawable subtype is not drawn.
- **`empty-supertype-group`** and **`merge-without-roll-up`** are warnings, not errors.

## What's next

- [**Relationships & crow's foot notation**](./relationships-crows-foot): the other lines in the diagram.
- [**Inspector pane**](./inspector-pane): what each kind of inspector shows.
- [**Visual cues at a glance**](./visual-cues): every visual signal on one page.
