# @xdbml/render-api

A stateless HTTP service that renders xDBML source to SVG, running as a
Cloudflare Worker. The render path (parser, layout, serializer) is pure
JavaScript, so the Worker needs no Node.js compatibility flag and no headless
browser: an xDBML document goes in, an SVG string comes out, served from the
edge.

## Endpoints

| Method | Path                | Purpose                                                          |
| ------ | ------------------- | ---------------------------------------------------------------- |
| GET    | `/`                 | In-browser tester: paste xDBML, see the diagram.                 |
| GET    | `/health`           | Service metadata as JSON.                                        |
| GET    | `/render?src=...`   | Render a small or URL-encoded schema; returns `image/svg+xml`.   |
| POST   | `/render` (or `/`)  | Render the request body. The primary path for real schemas.      |

`POST` accepts either raw xDBML (`Content-Type: text/plain`) or JSON of the
form `{ "source": "...", "arrange": "...", "background": "..." }`.

### Options

Pass as query parameters, or as JSON fields on a `POST`:

- `arrange` -- `relational` (default), `star`, or `none`.
- `background` -- any CSS color for a solid background (default: transparent).
- `playground` -- `on` (default) or `off`. When on, the SVG includes a small
  "Open in xDBML playground" link in a footer band; the link carries the
  schema as an lz-string `#s=` share hash, so opening it loads the diagram into
  the interactive playground for editing. The link is clickable when the SVG is
  viewed as a document (the API's `image/svg+xml` response in a browser tab).

CORS is open (`Access-Control-Allow-Origin: *`) so browser apps and the
playground can call it. Errors return a JSON body `{ "error": "..." }` with an
appropriate status (400 for unparseable input, 413 over the size limit).

## The render URL (GET endpoint)

`GET /render` renders a schema passed entirely in the URL and returns
`image/svg+xml`, so the link opens straight into a diagram in a browser tab.
This is the form behind a one-click "render this" link. The full shape is:

```
https://xdbml-render-api.xdbml.workers.dev/render?src=<encoded xDBML>&arrange=<mode>&playground=<on|off>&background=<color>
```

### `src` (required)

The entire xDBML document, percent-encoded for a query string. This is URL
encoding, not HTML-entity encoding: every reserved character (spaces, braces,
brackets, `#`, `&`, line breaks, ...) becomes its `%XX` form. In JavaScript
that is exactly `encodeURIComponent(source)`:

```js
const url = base + "/render?src=" + encodeURIComponent(xdbml) + "&arrange=relational";
```

Encode the whole document in one call; hand-encoding is error-prone because an
un-encoded `&` or `#` would be read as URL syntax and silently truncate the
schema. Outside JavaScript, use your platform's URL/percent-encoder (Python
`urllib.parse.quote`, etc.), not an HTML-escaping function.

### `arrange` (optional, default `relational`)

Auto-layout strategy: `relational` (default) for a general entity layout,
`star` for a fact-in-the-center dimensional (star-schema) layout, or `none` to
keep the raw column layout with no rearrangement.

### `playground` (optional, default `on`)

`on` adds the "Open in xDBML playground" footer link (the schema travels in
that link as a compressed `#s=` share hash); `off` omits it.

### `background` (optional, default transparent)

Any CSS color (`#ffffff`, `white`, `#0b1020`, ...) painted behind the diagram.
Omitted leaves the background transparent. `bg` is accepted as an alias.

### Examples

Small schema, defaults (relational, link on), in a browser:

```
https://xdbml-render-api.xdbml.workers.dev/render?src=Table%20users%20%7B%20id%20int%20%5Bpk%5D%20email%20varchar%20%7D
```

Star layout, white background, no playground link:

```
https://xdbml-render-api.xdbml.workers.dev/render?src=<encoded>&arrange=star&background=%23ffffff&playground=off
```

Build one in JavaScript:

```js
const base = "https://xdbml-render-api.xdbml.workers.dev";
const link = `${base}/render?src=${encodeURIComponent(xdbml)}&arrange=relational`;
```

### How long can the URL be?

The whole document rides in `src`, and percent-encoding inflates it (a space
becomes `%20`, a brace `%7B`), so the URL grows quickly. Keep a GET render URL
under roughly 2,000 characters if it must work everywhere: browsers accept far
more in the address bar, but shared links pass through mail clients, chat apps,
proxies, and CDNs that commonly truncate near that length. As a rough guide
that is a few hundred characters of xDBML. For anything larger, use
`POST /render` with the document in the body (up to the 256 KB limit), which
has no URL-length constraint.

## Publishing the libraries (one time)

The Worker depends on the published `@xdbml/render`. Publish the two libraries
to the npm org first; `prepublishOnly` builds `dist` automatically.

1. Sign in to npm as the org owner: `npm login`
2. Publish the parser (it has no dependencies):
   ```
   cd parser && npm publish --tag poc
   ```
3. Point the renderer at the published parser. In `renderer/package.json`
   change the dependency:
   ```
   "@xdbml/parse": "file:../parser"   ->   "@xdbml/parse": "^0.1.0-poc.1"
   ```
   then publish:
   ```
   cd renderer && npm install && npm publish --tag poc
   ```

Both packages carry `"publishConfig": { "access": "public" }`, so the scoped
`@xdbml/*` names publish publicly without an extra flag.

> Testing before publishing: because the Worker bundles its dependencies with
> esbuild, you can point the API at the local renderer instead. Build the
> libraries (`cd parser && npm run build` then `cd renderer && npm install &&
> npm run build`), set `"@xdbml/render": "file:../renderer"` in this package's
> `package.json`, and skip the publish step entirely.

## Local development

```
cd api
npm install
npx wrangler login      # one-time, opens a browser to authorize
npm run dev             # serves at http://localhost:8787
```

Open `http://localhost:8787/` for the tester, or call the endpoints directly.

## Deploy

From the api folder

```
npm run deploy
```

Wrangler bundles the Worker and deploys it, printing a public
`https://xdbml-render-api.<your-subdomain>.workers.dev` URL. That URL is
immediately testable from a browser or Postman; attach a custom domain later in
the Cloudflare dashboard if you want one.  <your-subdomain>= xdbml

`https://xdbml-render-api.xdbml.workers.dev`

## Testing

Browser (renders the SVG inline):

```
https://xdbml-render-api.xdbml.workers.dev/render?src=Table%20users%20%7B%20id%20int%20%5Bpk%5D%20%7D&arrange=relational
```

Check service health:

`https://xdbml-render-api.xdbml.workers.dev/health`

curl / Postman (the normal path for real schemas):

```
curl -X POST https://xdbml-render-api.xdbml.workers.dev/render \
  -H "Content-Type: text/plain" \
  --data-binary @schema.xdbml
```

JSON body with options:

```
curl -X POST https://xdbml-render-api.xdbml.workers.dev/render \
  -H "Content-Type: application/json" \
  -d '{"source":"Table users { id int [pk] }","arrange":"star","background":"#ffffff"}'
```



## Local testing

Local testing needs no npm publish and no Cloudflare login, `wrangler dev` runs the Worker on your own machine. The one thing to know up front is that the Worker bundles the renderer, so the renderer (and the parser it depends on) have to be built once first. Here is the whole thing, start to finish, from the repo root.

**Step 1, build the two libraries.** The parser goes first, because the renderer is built against it.

```
cd parser
npm install
npm run build
cd ../renderer
npm install
npm run build
cd ..
```

Each `npm run build` should finish without errors and leave a `dist` folder in that package.

**Step 2, point the API at your local renderer instead of npm.** Open `api/package.json` and change the single dependency line from

```
"@xdbml/render": "^0.1.0-poc.2"
```

to

```
"@xdbml/render": "file:../renderer"
```

That tells it to bundle the `dist` you just built rather than fetch a published package.

**Step 3, install and run the Worker locally.**

```
cd api
npm install
npm run dev
```

`npm run dev` is `wrangler dev`, which runs the Worker locally with no Cloudflare account and no publishing involved. The first run may download a small local runtime and may ask a yes/no telemetry question; either answer is fine. When it is ready it prints a line like `Ready on http://localhost:8787`. Leave that terminal running.

**Step 4, test it.** Easiest first:

1. Open `http://localhost:8787/` in your browser. You get a page with an xDBML box and a Render button, and it renders the built-in sample on load. Edit the text, click Render, and the SVG appears on the right. This is the quickest way to confirm everything works.
2. Raw SVG straight in the address bar: `http://localhost:8787/render?src=Table%20users%20%7B%20id%20int%20%5Bpk%5D%20%7D&arrange=relational`. The browser draws the diagram.
3. Service info: `http://localhost:8787/health` returns JSON describing the endpoints and options.
4. Postman, the normal path for real schemas: method `POST`, URL `http://localhost:8787/render`, then Body, raw, Text, and paste your xDBML document. To pass options, use Body, raw, JSON instead, with `{"source": "...your xdbml...", "arrange": "star", "background": "#ffffff"}`. Postman avoids the shell-quoting headaches that `curl` has on Windows, so I would reach for it over `curl` here.

**Step 5, stop and decide.** Press Ctrl+C in the terminal to stop the local server. Nothing you did touched npm or Cloudflare, so there is nothing to undo except that one dependency line. When you are ready to go live for real, change `"@xdbml/render"` back to `"^0.1.0-poc.2"`, then follow the publish-then-deploy sequence in `api/README.md`.

One thing to watch: if `npm run dev` complains that it cannot find `@xdbml/render`, it almost always means Step 1 did not produce a `dist`, or Step 2's path edit was not saved before Step 3's `npm install`. Re-running Step 1 and confirming `renderer/dist/index.js` exists clears it up.



## Scope (first version)

The parser and `renderToSVG` are synchronous, so this version renders a
self-contained xDBML document. A document that pulls in other files via
`use ... from './x.xdbml'` or a remote `https://` source needs those fetched
and merged first, which is async work for a later iteration. Output is SVG;
PNG rasterization is not included. The input size limit is 256 KB.
