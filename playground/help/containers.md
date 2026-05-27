---
title: Containers
description: How Schema, Database, Keyspace, and other container declarations are visualized.
---

# Containers

Containers in xDBML are groupings that wrap related entities together. They serve two purposes: organizing the schema logically, and naming the target technology (Oracle, MongoDB, Neo4j, etc.) that the group lives on. The diagram renders each container as a labeled box around its member entities.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `containers-example.png`
Caption: Two containers in a polyglot e-commerce schema, with the target engines visible in their header bands.
Should show: the e-commerce example, with both the `catalog` (Container, Oracle target) and `orders_store` (Container, MongoDB target) visible. Each container is a dashed box wrapping its entities, with a colored header band at the top showing the keyword, name, and target.
:::

## The container keywords

xDBML accepts multiple synonyms for the container keyword. They all behave identically; the choice is stylistic, picked to match the storage technology you're modeling:

- **Schema**: traditional SQL term for a namespace.
- **Database**: another SQL-flavored term, sometimes used for a logical database within a server.
- **Container**: technology-neutral term, useful in polyglot schemas.
- **Keyspace**: Cassandra terminology.
- **Namespace**: also used in some document and key-value stores.
- **Dataset**: BigQuery and similar warehouse terminology.
- **Bucket**: object-store and Couchbase terminology.

The keyword is shown in the container's header band so a reader can tell at a glance which terminology the author chose.

## The visual elements

Each container has four visual parts:

**1. The body box.** A rectangle wrapping all member entities. The border is dashed (not solid), which distinguishes containers from entity cards at a glance.

**2. The header band.** A colored strip across the top of the box, similar to but visually distinct from entity-card header bands. The container's header is taller and uses a saturated accent color.

**3. The header text.** Shows the keyword followed by the container name. For example: `Container · catalog` or `Schema · public`.

**4. The target indicator** (when present). If the container declares a target engine, it appears on the right side of the header band, right-aligned. For example: `→ Oracle` or `→ MongoDB`. This makes polyglot schemas (multiple containers with different targets) immediately readable.

## Container colors

Each container gets a deterministic accent color based on its name. The same container name always gets the same color across reloads. This stable color is also used for:

- The header band on the container itself
- The header bands of all entities inside that container

Sharing the color signals visually that those entities belong together. A reader scanning a diagram with five containers can pick out which entities cluster with which container by header color alone.

The color palette is a small set (six or seven colors), picked to be visually distinct from each other and to look fine against both light and dark themes. If you have more containers than palette colors, the colors repeat. In practice, schemas with more than seven containers are rare.

## When containers don't appear

A container only appears in the diagram if it's declared in the source. xDBML doesn't require containers; you can write `Table users { ... }` at the top level without wrapping it in anything. In that case:

- No container box is drawn
- The entity gets a default neutral header color
- The entity is laid out independently

You can mix container-wrapped and top-level entities freely in the same schema.

## Cross-container relationships

A `Ref:` between two entities in different containers is drawn the same way as a same-container ref: a curved line with crow's foot symbols at each end. The line crosses container boundaries visually. This is how polyglot relationships are visualized; the e-commerce example uses this pattern to relate orders in MongoDB to customers in Oracle.

Selecting a cross-container relationship in the diagram opens the inspector showing its source and target endpoint paths, exactly the same as a within-container relationship.

## What the container shows (and doesn't)

In the diagram, the container shows:

- Keyword and name
- Target engine
- Visual grouping of its member entities (via the box and shared accent color)

In the inspector (after you click the container), you also see:

- The full identification (keyword, name, member count)
- All settings on the container declaration
- The `Note: '...'` body if present
- A list of the entities it owns

The diagram is meant to be readable at a glance; the inspector holds the detail.

## A note on layout

Containers grow to wrap their members. When you drag an entity out of a container, the container does NOT shrink or expand in real time. It re-fits on the next layout pass (e.g. when you edit the schema). This is a known limitation and will be smoothed out in a future release.

## What's next

- [**Entity cards**](./entity-cards): the cards inside containers.
- [**Relationships & crow's foot notation**](./relationships-crows-foot): how the lines between entities work.
- [**Visual cues at a glance**](./visual-cues): the compact visual reference.
