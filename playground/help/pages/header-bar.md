# Header bar & menus

The header bar sits across the top of the playground and stays visible at all times. It hosts the xDBML logo, the playground title, and the four action buttons.

::: screenshot
**[Screenshot needed]**
Filename suggestion: `header-bar.png`
Caption: The playground header bar with all four action buttons visible.
Should show: full-width header strip with xDBML logo on the left, the four buttons (Examples, Share, Help) on the right. Buttons in their default state, none highlighted.
:::

## The logo

The xDBML logo on the left links back to the main site at [xdbml.org](https://xdbml.org). Useful when you've landed in the playground from somewhere else and want to see the broader site.

## Examples

Click **Examples** to open a dropdown with the six bundled sample schemas. Selecting one replaces the editor's current content with that example. A checkmark next to one of the entries indicates which example is currently loaded (when the editor's content matches an example).

The examples are:

- **Blog**: a small relational schema with users, posts, and comments. Good starting point for anyone familiar with traditional databases.
- **E-commerce**: a polyglot example that combines an Oracle catalog container with a MongoDB orders container, demonstrating cross-engine references.
- **IoT telemetry**: a time-series oriented schema with high-volume sensor readings, illustrating denormalization patterns.
- **Social graph**: a graph-database example using Neo4j-style edges between Person nodes.
- **Healthcare (FHIR)**: a complex schema based on the FHIR resource model, showing nested objects, polymorphism, and `0..*` optional cardinality patterns.
- **Financial services**: the largest sample, demonstrating multiple containers, views, and reference data.

For more on the examples, including links to per-example write-ups that explain the modeling choices, see [**Loading examples**](./loading-examples.html).

## Share

Click **Share** to open a dropdown that contains a copyable URL encoding your current schema. The URL works in any browser, no account needed; pasting it loads the schema into a fresh playground session.

The dropdown shows:

- The full URL in a read-only text field (selectable so you can copy with the keyboard).
- A **Copy** button that copies the URL to your clipboard and briefly turns green to confirm.
- The URL's size, and a warning when it exceeds 4,000 characters (some chat apps truncate URLs that long).

Detailed coverage in [**Sharing via URL**](./sharing-via-url.html).

## Help

Opens this help section in a new browser tab. The new tab keeps your work intact in the original tab.

## What's next

- [**Editor pane**](./editor-pane.html): how to use the editor itself.
- [**Loading examples**](./loading-examples.html): more on the bundled sample schemas.
- [**Sharing via URL**](./sharing-via-url.html): full details on how URL sharing works.
