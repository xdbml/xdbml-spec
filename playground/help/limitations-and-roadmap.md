---
title: Limitations & roadmap
description: What the playground can't do yet, and the rough shape of what's planned.
---

# Limitations & roadmap

The playground is an active project, deliberately scoped to be lightweight. Several things you might reasonably expect from a full data-modeling tool are not present yet. This page is the honest accounting of what's missing and where things are headed.

## What the playground does NOT do today

**No code generation.** The playground doesn't emit Oracle DDL, MongoDB validators, Avro schemas, JSON Schema, or any other target artifact. xDBML is the source format; the rendering tools that produce target artifacts from xDBML live in separate projects. The playground's job is authoring and visualizing the source.

**No file import or export.** You can't upload an `.xdbml` file from your computer to load it into the editor, and you can't download the current editor content as a file. The intended workflows are: paste content into the editor for input, copy content out of the editor for output, and use [**Sharing via URL**](./sharing-via-url) for distribution.

**No DBML import.** [DBML](https://dbml.dbdiagram.io) is the language the playground's xDBML is based on. There's no built-in converter from DBML to xDBML; if you have an existing DBML file, you'll need to migrate it manually. Most simple DBML constructs map directly to xDBML, but some details (containers, polymorphism, nested types) are xDBML-specific and don't have DBML equivalents.

**No multi-user collaboration.** No accounts, no live cursors, no comments, no real-time co-editing. Sharing is via copyable URLs, which work fine for asynchronous review and "look at this" linking, but not for synchronous teamwork. Use a third-party tool (Slack, screen sharing) for live discussion.

**No version history beyond browser undo.** The editor's undo stack covers the current session; reload the page and the undo history resets even though your text is preserved. There's no "show me what this looked like an hour ago" feature. If you need durable snapshots, copy the URL via Share at the points you want to remember.

**No diagram export.** You can't right-click the diagram and save it as PNG, SVG, or PDF. To capture a diagram for a slide deck or document, use your operating system's screenshot tool. SVG export would be a sensible addition; it's on the wish list but not scheduled.

**No keyboard navigation in the diagram.** Click-to-select and drag-to-reposition are mouse-only. There's no way to tab between entities or use arrow keys to pan. This is a real accessibility gap.

**Container resize is not real-time.** Dragging an entity out of a container doesn't shrink or grow the container as you drag. The container redraws to fit on the next layout pass (typically after an edit). See [**Repositioning entities**](./diagram-drag).

**No alternative ERD notations.** Only crow's foot is supported. Chen notation, Bachman notation, and UML-style filled-and-open-arrows are not available.

**Limited diagram layout strategies.** The auto-layout is a single algorithm. There's no choice of force-directed, layered, columnar, or other layouts. For schemas larger than about a dozen entities, manual positioning is often required.

## Rough roadmap

The xDBML project is actively evolving. The playground tracks the language; features generally land as the language matures. Specific items on the radar:

**Better diagram export.** Saving the diagram as SVG or PNG, with options for theme (light/dark), zoom, and which elements to include. Reasonable target for a near-term release.

**Search within the schema.** Find an entity, a field, or a relationship by name without scrolling through a large diagram. Probably arrives alongside any meaningful schema-size improvements.

**Warning-level diagnostics.** The parser currently emits only errors. Semantic analysis (e.g. "this Ref points at a non-existent field" or "this type isn't defined") will produce warnings, which the diagnostics panel is already shaped to handle.

**Naming-convention checks.** A pass that flags fields and entities whose names don't match a chosen convention (snake_case, camelCase, PascalCase). Useful for keeping a large schema internally consistent.

**Improved auto-layout.** Better defaults for large schemas; possibly a choice between layout strategies (relational, document-tree-style, graph-style).

**More bundled examples.** The current six cover the main modeling styles, but examples of specific patterns (event-sourcing, CDC streams, multi-tenancy) would be useful additions.

## What's NOT on the roadmap

**File system integration.** The playground will not gain an in-app file manager, project workspace, or local file watching. Tools like [Hackolade Studio](https://hackolade.com) handle those workflows; the playground is deliberately the lightweight option.

**Accounts and server-side persistence.** No plan to add login, accounts, or server-stored schemas. Sharing via URL is the model. If "send a link" works for your use case, the playground works; if you need centralized storage with access control, you need a different tool.

**Hosting other people's languages.** The playground is for xDBML specifically. It will not also accept DBML, SDL, Mermaid ERD, or other input languages.

## What if I really need a feature?

[Open an issue](https://github.com/xdbml/xdbml-spec/issues) describing the use case. Feature priority is set by how many people are blocked on a thing combined with how clean the design is, not by a fixed roadmap. The "what does the playground not do" list above isn't final; if enough people need something, it can move onto the roadmap.

## What's next

- [**Feedback & contributing**](./feedback-and-contributing): how to file issues and propose features.
- [**About xDBML**](./about-xdbml): broader xDBML resources and the project's overall direction.
