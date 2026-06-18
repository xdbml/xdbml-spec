/**
 * Standalone demo for @xdbml/render/interactive.
 *
 * Bundled with esbuild into demo/bundle.js so it runs from file:// with no
 * server, build step, or npm publish. Edit the xDBML on the left; the
 * diagram on the right is the framework-free interactive mount. Try:
 * click a field/ref/container to select, click carets to collapse nested
 * types, drag entity headers and container titles, Ctrl/Cmd+wheel to zoom,
 * and the toolbar buttons.
 */
import { mount, type DiagramHandle, type Selection } from '../src/interactive/index.ts';

const SAMPLE = `xdbml: 0.3

Container core [color: #2878b4] {
  Table users {
    id int [pk]
    email varchar [unique, not null]
    profile json {
      display_name varchar
      avatar_url varchar
    }
  }

  Table posts {
    id int [pk]
    author_id int [ref: > users.id, not null]
    title varchar
    parent_id int [ref: > posts.id]
  }
}

Container analytics [color: #31a2cf] {
  View active_users {
    user_id int
    last_seen timestamp
  }
}

Ref: posts.author_id > users.id
`;

const editor = document.getElementById('editor') as HTMLTextAreaElement;
const canvas = document.getElementById('canvas') as HTMLElement;
const status = document.getElementById('status') as HTMLElement;
const sel = document.getElementById('selection') as HTMLElement;

editor.value = SAMPLE;

let handle: DiagramHandle | null = null;

function describe (s: Selection): string {
  if (!s) return 'none';
  if (s.kind === 'field') return `field ${s.id}.${s.path}`;
  if (s.kind === 'container') return `container ${s.name}`;
  return `${s.kind} ${s.id}`;
}

function render (): void {
  try {
    if (handle) { handle.setInput(editor.value); status.textContent = 'parsed ok'; status.style.color = '#15803d'; return; }
    handle = mount(canvas, editor.value, {
      onSelect: (s) => { sel.textContent = describe(s); },
      onZoom: (z) => { document.getElementById('zoom')!.textContent = `${Math.round(z * 100)}%`; },
    });
    status.textContent = 'parsed ok';
    status.style.color = '#15803d';
  } catch (err) {
    status.textContent = `parse error: ${(err as Error).message}`;
    status.style.color = '#b91c1c';
  }
}

let timer: number | undefined;
editor.addEventListener('input', () => {
  window.clearTimeout(timer);
  timer = window.setTimeout(render, 200);
});

document.getElementById('fit')!.addEventListener('click', () => handle?.zoomToFit());
document.getElementById('zin')!.addEventListener('click', () => handle?.zoomIn());
document.getElementById('zout')!.addEventListener('click', () => handle?.zoomOut());
document.getElementById('rel')!.addEventListener('click', () => handle?.arrange('relational'));
document.getElementById('star')!.addEventListener('click', () => handle?.arrange('star'));
document.getElementById('reset')!.addEventListener('click', () => handle?.reset());

render();
