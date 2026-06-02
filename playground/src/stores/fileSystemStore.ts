/**
 * playground/src/stores/fileSystemStore.ts
 *
 * Tracks the playground's "currently open file" state for the
 * File System Access API integration: the optional file handle (only
 * present on Chrome and other Chromium-based browsers), the current
 * filename to display in the header, and a snapshot of the last saved
 * content so we can compute the dirty indicator.
 *
 * The state lives in a small dedicated Pinia store rather than mixed
 * into parserStore because the two concerns are independent: parserStore
 * handles what the editor content IS, this store handles where it CAME
 * FROM and whether it's been saved.
 *
 * Note: the file handle itself is intentionally session-scoped. We do
 * NOT persist it via IndexedDB (which would require re-permission on
 * every session anyway, per the File System Access API security model).
 * On reload, the user re-opens via the picker.
 *
 * The current filename and last-saved snapshot are also session-scoped
 * for the same reason. If you reload the page, you start with no
 * "open file" even if the editor content is restored from localStorage.
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { useParserStore } from '@/stores/parserStore';

/**
 * Subset of FileSystemFileHandle we actually use. Declared explicitly
 * rather than relying on lib.dom.d.ts because TypeScript's built-in
 * types for the File System Access API have varied across versions
 * and we want a stable shape.
 */
export interface XdbmlFileHandle {
  name: string;
  getFile (): Promise<File>;
  createWritable (): Promise<{
    write (data: string): Promise<void>;
    close (): Promise<void>;
  }>;
}

export const useFileSystemStore = defineStore('fileSystem', () => {
  /**
   * Active file handle (Chrome/Chromium with File System Access API).
   * Set after a successful openFile() or saveFileAs(). Null otherwise.
   * The handle keeps a permission grant so subsequent saves can
   * overwrite the same file without re-prompting the user.
   */
  const fileHandle = ref<XdbmlFileHandle | null>(null);

  /**
   * Display filename. Set to the handle's name after open/save-as.
   * Null when the editor content is "untitled" (initial state, or
   * after the user explicitly chooses an example or hits Reset).
   */
  const filename = ref<string | null>(null);

  /**
   * Snapshot of the editor content at the last save (or open) event.
   * Used to compute the dirty indicator by simple string comparison
   * against the current parser-store content.
   *
   * Null means "the current content has never been saved" -- so the
   * dirty indicator should show unless the content is also empty.
   */
  const lastSavedContent = ref<string | null>(null);

  /**
   * Reactive dirty flag. True when:
   *
   *   - the editor has content AND
   *   - either no save has occurred yet OR the current content
   *     differs from the last saved snapshot.
   *
   * The "has content" check prevents the dirty indicator from flashing
   * up momentarily on initial page load before content settles.
   */
  const isDirty = computed<boolean>(() => {
    const parser = useParserStore();
    const current = parser.content;
    if (!current || current.length === 0) return false;
    if (lastSavedContent.value === null) return true;
    return current !== lastSavedContent.value;
  });

  /**
   * Called by the file-system composable after a successful save or
   * open. Records the content snapshot so subsequent isDirty checks
   * can detect drift from the saved state.
   */
  function markSaved (content: string): void {
    lastSavedContent.value = content;
  }

  /**
   * Called when the user resets the playground or loads an example.
   * Clears the file-handle association: the example content is not
   * "the file" the user opened, so a subsequent Save should prompt
   * for a filename rather than overwrite the previously-open file.
   */
  function clearFile (): void {
    fileHandle.value = null;
    filename.value = null;
    lastSavedContent.value = null;
  }

  return {
    fileHandle,
    filename,
    lastSavedContent,
    isDirty,
    markSaved,
    clearFile,
  };
});
