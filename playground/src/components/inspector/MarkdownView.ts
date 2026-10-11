/**
 * Markdown of a note, rendered as elements (spec §19.1, §19.6).
 *
 * The blocks come from the renderer's Markdown reader, the one that lays
 * out sticky notes on the canvas, so the inspector and the diagram read a
 * note the same way. Elements are built with `h()` from the blocks and
 * their runs; no HTML from the document reaches the page, and a link keeps
 * its target only for http, https and mailto.
 */
import { defineComponent, h, type VNode } from 'vue';
import { isBreak, parseMarkdown } from '@xdbml/render';
import type { MdBlock, MdInline } from '@xdbml/render';

const SAFE_HREF = /^(?:https?:|mailto:)/i;

function inlines (list: ReadonlyArray<MdInline>): Array<VNode | string> {
  return list.map((i) => {
    if (isBreak(i)) return h('br');
    let node: VNode | string = i.text;
    if (i.code) node = h('code', { class: 'font-mono text-[0.92em] px-1 rounded bg-black/5 dark:bg-white/10' }, i.text);
    if (i.strike) node = h('s', [node]);
    if (i.em) node = h('em', [node]);
    if (i.strong) node = h('strong', { class: 'font-semibold' }, [node]);
    if (i.href !== undefined) {
      node = SAFE_HREF.test(i.href)
        ? h('a', { href: i.href, target: '_blank', rel: 'noopener noreferrer', class: 'text-blue-600 dark:text-blue-400 underline' }, [node])
        : h('span', { class: 'underline' }, [node]);
    }
    return node;
  });
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-sm font-semibold',
  2: 'text-[13px] font-semibold',
  3: 'text-xs font-semibold',
};

function blocks (list: ReadonlyArray<MdBlock>): VNode[] {
  return list.map((b) => {
    switch (b.kind) {
      case 'heading':
        return h(`h${Math.min(6, b.level + 2)}`, { class: HEADING_CLASS[b.level] ?? HEADING_CLASS[3] }, inlines(b.inlines));
      case 'paragraph':
        return h('p', inlines(b.inlines));
      case 'list':
        return h(
          b.ordered ? 'ol' : 'ul',
          { class: b.ordered ? 'list-decimal pl-5 space-y-0.5' : 'list-disc pl-4 space-y-0.5', start: b.ordered && b.start !== 1 ? b.start : undefined },
          b.items.map((item) => h('li', { class: 'space-y-1' }, blocks(item))),
        );
      case 'quote':
        return h('blockquote', { class: 'border-l-2 border-gray-300 dark:border-slate-600 pl-2 text-gray-600 dark:text-slate-400 space-y-1' }, blocks(b.blocks));
      case 'code':
        return h('pre', { class: 'font-mono text-[11px] p-2 rounded bg-black/5 dark:bg-white/10 overflow-x-auto whitespace-pre' }, b.lines.join('\n'));
      case 'rule':
        return h('hr', { class: 'border-gray-300 dark:border-slate-600' });
      case 'verbatim':
        return h('p', { class: 'whitespace-pre-wrap font-mono text-[11px]' }, b.lines.join('\n'));
    }
  });
}

export default defineComponent({
  name: 'MarkdownView',
  props: {
    text: { type: String, required: true },
  },
  setup (props) {
    return () => h('div', { class: 'space-y-1.5 break-words' }, blocks(parseMarkdown(props.text)));
  },
});
