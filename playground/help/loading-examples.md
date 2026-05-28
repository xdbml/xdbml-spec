---
title: Loading examples
description: How to load and use the six bundled sample schemas as starting points.
---

# Loading examples

The playground ships with six bundled sample schemas covering different modeling styles and storage technologies. They're useful as starting points for your own work and as references for how specific xDBML features look in practice.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `examples-menu-open.png`
Caption: The Examples dropdown in the header bar, showing the six bundled samples.
Should show: the playground header bar with the Examples button highlighted and its dropdown open below it, listing the six examples vertically. Ideally one example has the active checkmark next to it indicating it's currently loaded.
:::

## Opening the menu

Click the **Examples** button in the header bar. A dropdown opens below it listing the six examples. Click any entry to load that schema into the editor.

A checkmark appears next to the entry whose content currently matches what's in the editor. If you've edited the schema since loading, no checkmark shows; the editor content no longer matches any example.

## The six examples

**Blog** is a small relational schema with users, posts, and comments. Three entities, two relationships, no nested fields. The smallest and simplest example; good starting point for anyone new to xDBML or to ER modeling generally. Built around PostgreSQL conventions.

**E-commerce** is a polyglot example. It has two containers: a `catalog` container targeting Oracle (for products and categories) and an `orders_store` container targeting MongoDB (for orders, customers, and shopping carts). A cross-container `Ref:` links an order to the customer in the relational store. Use this one to see how xDBML handles mixed-engine schemas in a single model.

**IoT telemetry** demonstrates time-series-oriented modeling. Sensor readings live in a denormalized structure optimized for high write volume and time-windowed reads. Shows what xDBML looks like when the modeling style isn't normalized relational. Useful as a reference for time-series databases (TimescaleDB, InfluxDB) and for understanding when denormalization is the right call.

**Social graph** is a graph-database example using Neo4j-style modeling. Person nodes with first-class edges between them representing FOLLOWS, FRIEND_OF, and BLOCKED relationships. Shows xDBML's modeling of graph databases, including edge cardinality and properties on edges.

**Healthcare (FHIR)** is the most complex of the bundled examples. Based on the [FHIR](https://www.hl7.org/fhir/) resource model, it uses deeply nested objects, polymorphism (oneOf alternatives), and optional cardinalities (`0..*`). If you want to see how xDBML handles a real-world standards-based schema with non-trivial nesting, this is the example to load.

**Financial services** is the largest sample, demonstrating multiple containers, view definitions, and reference data. Modeled after the kinds of schemas you'd find in retail banking or trading systems, with accounts, transactions, instruments, and counterparties. Good reference for enterprise-scale modeling patterns.

## What happens when you load an example

The editor content is replaced with the example's xDBML source. The diagram redraws to match. Any layout adjustments you'd made (entity positions, collapse states) are cleared because the entities are now different.

Your previous editor content is NOT preserved when you load an example. If you have unsaved work you want to keep, copy the editor content to your clipboard or copy the URL via the [**Share**](./sharing-via-url) button before loading.

If you've made changes since loading and want to discard them and start fresh, simply load the same example again. The editor resets to the bundled version.

## Per-example write-ups

The main xdbml.org site has a longer write-up for each example, explaining the modeling choices and the language features it exercises. From the playground, you can find these at:

- [Blog](https://xdbml.org/examples/blog)
- [E-commerce](https://xdbml.org/examples/ecommerce)
- [IoT telemetry](https://xdbml.org/examples/iot)
- [Social graph](https://xdbml.org/examples/social-graph)
- [Healthcare (FHIR)](https://xdbml.org/examples/healthcare)
- [Financial services](https://xdbml.org/examples/financial-services)

Or click the **xDBML** logo in the header to go to the main site and browse the Examples section.

## Starting your own schema from an example

A common workflow: load the example closest to what you want to model, then edit it to match your actual case. Rename entities, change fields, replace the container with your own technology. The example becomes scaffolding rather than a finished schema. Sharing the URL after the edits is a good way to circulate the result to collaborators.

If you want a blank slate instead, just select the existing editor content (`Ctrl + A`) and delete it. The diagnostics panel will show errors until you've written at least a valid `xdbml: 0.1` version line; from there you can build up.

## What's next

- [**Sharing via URL**](./sharing-via-url): how to circulate your work.
- [**Persistence & undo**](./persistence-and-undo): what gets saved as you edit.
- [**Your first schema**](./your-first-schema): the hands-on walkthrough.
