# What is the playground?

The xDBML playground is a free, browser-based tool for writing, visualizing, and sharing data-model schemas in the xDBML language. You type xDBML on the left, and a corresponding entity-relationship diagram appears on the right, updating live as you edit.

## What you can do here

**Write schemas interactively.** The editor has syntax highlighting, error reporting, and auto-saves your work as you type. You don't need an account, you don't need to install anything, and you don't need to set up a project. Open the page, start typing.

**See your schema as a diagram.** Every parseable change produces an updated diagram. Entities become cards. Containers wrap their members. Relationships are drawn as curved lines between the source and target fields, using crow's foot notation to show cardinality and optionality.

**Inspect any element.** Click a container, an entity, a field, or a relationship to open the inspector panel on the right. It shows all the metadata the parser found: identification, settings, flag badges, notes, and custom AI-readiness properties.

**Share schemas as URLs.** A single button copies a link that encodes your entire schema into the URL itself. Send it in chat, paste it in an email, bookmark it. No server stores anything; the URL is the schema.

**Load realistic examples.** Six bundled samples cover relational, document, polyglot, graph, healthcare, and financial-services modeling. They are useful as starting points or as reference for how specific xDBML features look in practice.

## What you can't do here (yet)

The playground is a workspace, not a full IDE. Specifically:

- **No code generation.** It doesn't emit Oracle DDL, MongoDB validators, Avro schemas, or any other target artifact. Those come from generator tools that consume xDBML; the playground's job is authoring the source.
- **No collaboration features.** No accounts, no real-time multi-user editing, no comments. Sharing happens via copyable URLs.
- **No file import or export.** No way to upload an existing `.xdbml` file or download your current one as a file. You paste content into the editor, you copy content out.
- **No DBML import.** A future feature; for now, xDBML is the only input language.

These omissions are intentional. The playground is meant to be lightweight and accessible. Heavier authoring workflows are served by [Hackolade Studio](https://hackolade.com) and similar tools.

## Who it's for

**Developers and data architects** evaluating xDBML for their stack, testing how a specific schema would look, or learning the language.

**Teachers and writers** showing xDBML examples in tutorials, documentation, conference talks, or blog posts. The URL-share feature is designed for this use case.

**The xDBML project itself** uses the playground to validate that the language is comfortable to write and that real schemas across diverse domains render legibly.

## What about my data?

Nothing you write in the playground leaves your browser. There's no server-side persistence and no analytics on schema content. Your work is saved to your browser's local storage so it survives reloads, and a shared URL contains the schema text directly, but no copy is kept anywhere by us. If you close the tab and clear your browser data, your work is gone.

See [**Persistence & undo**](./persistence-and-undo.html) for the full story on how local storage, URL hashes, and the editor's undo history interact.
