---
title: Recipes
description: Practical, end-to-end workflows that combine xDBML with other tools -- MCP servers, AI assistants, and live databases.
---

# Recipes

Recipes are practical, end-to-end workflows. Where the
[5-minute introduction](/learn/) teaches the language and
[Use from AI assistants](/ai-assistants) connects the tooling, a recipe walks
one concrete job from start to finish, with the exact prompts, mapping rules,
and caveats you need to reproduce it.

## Available recipes

[**MongoDB cluster to xDBML diagram**](/recipes/mongodb) -- point an AI
assistant at a live MongoDB deployment through MongoDB's official MCP server,
infer the schema of its collections, express the result as xDBML (nested
objects, unions for type drift, oneOf for document polymorphism), and render
an entity-relationship diagram, all in one conversation.

More recipes are planned, including rendering xDBML diagrams inside Claude
Artifacts at runtime. Suggestions and contributions are welcome through
[GitHub issues](https://github.com/xdbml/xdbml-spec/issues).
