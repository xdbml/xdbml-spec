<template>
  <div class="w-full h-full flex flex-col">
    <div
      ref="editorContainer"
      class="flex-1 min-h-0"
    />
    <div class="bg-gray-50 border-t border-gray-200 px-3 py-1 text-xs text-gray-600 flex justify-between items-center">
      <span class="font-medium">xDBML</span>
      <span>
        Ln {{ cursor.line }}, Col {{ cursor.column }}
        <span
          v-if="selection.chars > 0"
          class="text-gray-400 ml-2"
        >({{ selection.chars }} selected)</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Wraps Monaco for the playground.
 *
 * Two-way binds `v-model` to the editor's text. Pushes parser errors to
 * Monaco markers whenever the parserStore reports new ones. Status bar
 * shows the cursor position and selection size; the toolbar above (in
 * App.vue) holds higher-level controls.
 *
 * Intentionally simple: no completion provider, no go-to-def, no Vim --
 * those wait on the parser's semantic-analysis pass and decisions about
 * UX. The diagram pane is where the visual payoff lives.
 */
import {
  ref, shallowRef, useTemplateRef, watch, onMounted, onBeforeUnmount,
} from 'vue';
import * as monaco from 'monaco-editor';

import { useParserStore } from '@/stores/parserStore';

import { registerXDbmlLanguage, XDBML_LANGUAGE_ID, XDBML_THEME_NAME } from './xdbml_language';
import { setMonacoMarkers } from './xdbml_markers';

const content = defineModel<string>({ required: true });

const editorContainer = useTemplateRef<HTMLElement>('editorContainer');
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);

const cursor = ref({ line: 1, column: 1 });
const selection = ref({ chars: 0 });

const parser = useParserStore();

function editorOptions (): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    value: content.value,
    language: XDBML_LANGUAGE_ID,
    theme: XDBML_THEME_NAME,
    minimap: { enabled: false },
    wordWrap: 'off',
    scrollBeyondLastLine: false,
    fontSize: 13,
    lineHeight: 19,
    tabSize: 2,
    insertSpaces: true,
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    lineDecorationsWidth: 4,
    padding: { top: 8, bottom: 8 },
    renderWhitespace: 'none',
    automaticLayout: true,
    folding: true,
    showFoldingControls: 'always',
    foldingStrategy: 'indentation',
    scrollbar: {
      vertical: 'visible',
      horizontal: 'visible',
      useShadows: false,
      verticalScrollbarSize: 12,
      horizontalScrollbarSize: 12,
    },
    // No completion provider yet; suppress Monaco's word-based fallback
    // so the user doesn't get noisy suggestions from prior tokens.
    quickSuggestions: false,
    suggest: { showWords: false },
    parameterHints: { enabled: false },
    wordBasedSuggestions: 'off',
  };
}

onMounted(() => {
  registerXDbmlLanguage();
  if (!editorContainer.value) return;

  const ed = monaco.editor.create(editorContainer.value, editorOptions());
  editor.value = ed;

  // Apply any errors already in the store at mount time so the user sees
  // markers immediately if they navigate back to a broken document.
  const initialModel = ed.getModel();
  if (initialModel) setMonacoMarkers(initialModel, parser.errors);

  ed.onDidChangeModelContent(() => {
    const v = ed.getValue();
    if (v !== content.value) content.value = v;
  });

  ed.onDidChangeCursorPosition((e) => {
    cursor.value = { line: e.position.lineNumber, column: e.position.column };
  });

  ed.onDidChangeCursorSelection((e) => {
    const sel = e.selection;
    if (sel.isEmpty()) {
      selection.value = { chars: 0 };
      return;
    }
    const model = ed.getModel();
    if (!model) return;
    selection.value = { chars: model.getValueInRange(sel).length };
  });
});

onBeforeUnmount(() => {
  editor.value?.dispose();
  editor.value = null;
});

// Push outside content changes (e.g. reset, sample switch) into the editor.
watch(content, (newVal) => {
  const ed = editor.value;
  if (!ed) return;
  if (ed.getValue() !== newVal) ed.setValue(newVal);
});

// Push parse errors as Monaco markers.
watch(() => parser.errors, (errors) => {
  const ed = editor.value;
  if (!ed) return;
  const model = ed.getModel();
  if (!model) return;
  setMonacoMarkers(model, errors);
}, { immediate: true });
</script>
