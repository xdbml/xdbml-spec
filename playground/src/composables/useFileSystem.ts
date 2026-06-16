/**
 * playground/src/composables/useFileSystem.ts
 *
 * File I/O for the playground. Wraps the File System Access API on
 * Chromium-based browsers and falls back to <input type="file"> +
 * download-trigger on Firefox and Safari.
 *
 * Feature detection (not browser sniffing): we check for the
 * existence of window.showOpenFilePicker / window.showSaveFilePicker.
 * If a future Firefox or Safari ships them, this code picks them up
 * automatically.
 *
 * The composable returns four reactive things and three actions:
 *
 *   - canUseFsAccess: capability flag for UI to conditionally
 *     enable in-place save vs. download flow
 *   - openFile(): opens the file picker, reads content, populates
 *     the editor and the file-system store
 *   - saveFile(): saves to the current file handle if one exists,
 *     otherwise prompts (Save As flow)
 *   - saveFileAs(): always prompts for a filename and overwrites the
 *     file handle in the store with the new one
 *
 * Cancellation (user clicks the X on the picker) is treated as a
 * non-action -- silent, no error. Real errors (permission denied,
 * disk full, etc.) bubble up as thrown exceptions which the caller
 * can show as a toast.
 */
import { computed } from 'vue';

import { useParserStore } from '@/stores/parserStore';
import { useFileSystemStore } from '@/stores/fileSystemStore';
import type { XdbmlFileHandle } from '@/stores/fileSystemStore';
import logger from '@/utils/logger';

/* -------------------------------------------------------------------------
 * Feature detection
 * ----------------------------------------------------------------------- */

/**
 * True on browsers that implement the File System Access API. Detected
 * via the presence of showOpenFilePicker on the window object. As of
 * 2026: Chrome, Edge, Opera, Brave, Arc. Not Firefox, not Safari.
 */
export function hasFileSystemAccess (): boolean {
  return typeof window !== 'undefined'
    && 'showOpenFilePicker' in window
    && 'showSaveFilePicker' in window;
}

/* -------------------------------------------------------------------------
 * Filename derivation
 * ----------------------------------------------------------------------- */

/**
 * Compute a sensible default filename for a Save dialog, in this
 * preference order:
 *
 *   1. The current file handle's name, if any (preserves the
 *      filename across a Save As: "I opened users.xdbml, want to
 *      save a copy" should default to users.xdbml in the dialog).
 *   2. The first Project declaration's name from the parsed AST,
 *      sanitized for filesystem use, with .xdbml appended.
 *   3. The literal "schema.xdbml" as a last resort.
 */
function deriveDefaultFilename (): string {
  const fs = useFileSystemStore();
  if (fs.fileHandle?.name) return fs.fileHandle.name;

  const parser = useParserStore();
  const ast = parser.ast;
  if (ast?.statements) {
    for (const stmt of ast.statements) {
      if (stmt.kind === 'ProjectDeclaration' && stmt.name) {
        const sanitized = sanitizeFilename(stmt.name);
        if (sanitized.length > 0) return `${sanitized}.xdbml`;
      }
    }
  }

  return 'schema.xdbml';
}

/**
 * Strip filesystem-unsafe characters from a candidate filename stem.
 * Allows letters, digits, dash, underscore, and dot. Replaces other
 * characters with underscore. Doesn't try to handle Unicode normalization
 * because Project names in xDBML are typically simple identifiers.
 */
function sanitizeFilename (raw: string): string {
  return raw
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

/* -------------------------------------------------------------------------
 * The composable
 * ----------------------------------------------------------------------- */

export function useFileSystem () {
  const parser = useParserStore();
  const fs = useFileSystemStore();

  const canUseFsAccess = computed<boolean>(() => hasFileSystemAccess());

  /* ---- Open ------------------------------------------------------------ */

  async function openFile (): Promise<void> {
    if (hasFileSystemAccess()) {
      await openFileViaFsAccess();
    } else {
      await openFileViaInputElement();
    }
  }

  async function openFileViaFsAccess (): Promise<void> {
    let handles: XdbmlFileHandle[] | null = null;
    try {
      // showOpenFilePicker returns an array; with multiple: false (default)
      // it's a single-element array. The picker resolves with that or
      // rejects with AbortError on cancellation.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handles = await (window as any).showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: 'xDBML schema',
            accept: { 'text/plain': ['.xdbml'] },
          },
        ],
        excludeAcceptAllOption: false,
      });
    } catch (err) {
      if (isAbortError(err)) return; // user cancelled, silent
      throw err;
    }

    if (!handles || handles.length === 0) return;
    const handle = handles[0];
    const file = await handle.getFile();
    const text = await file.text();

    parser.loadDocument(text);
    fs.fileHandle = handle;
    fs.filename = handle.name;
    fs.markSaved(text);

    logger.info(`Opened ${handle.name} (${text.length} chars) via File System Access API`);
  }

  /**
   * Fallback open flow for Firefox and Safari. Creates a hidden
   * <input type="file"> element, clicks it programmatically, reads
   * the chosen file, and discards the element. No file handle is
   * retained because the API doesn't provide one.
   */
  async function openFileViaInputElement (): Promise<void> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xdbml,text/plain';
      input.style.display = 'none';

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) {
          // User cancelled the picker. The change event still fires
          // in some browsers with an empty FileList.
          document.body.removeChild(input);
          resolve();
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result ?? '');
          parser.loadDocument(text);
          fs.fileHandle = null; // no handle in this flow
          fs.filename = file.name;
          fs.markSaved(text);
          document.body.removeChild(input);
          logger.info(`Opened ${file.name} (${text.length} chars) via file-input fallback`);
          resolve();
        };
        reader.onerror = () => {
          document.body.removeChild(input);
          reject(reader.error ?? new Error('FileReader failed'));
        };
        reader.readAsText(file);
      });

      // If the user dismisses the picker, the input never fires
      // 'change'. The element will stay attached until the user
      // tries again. Acceptable -- it's invisible and tiny.
      document.body.appendChild(input);
      input.click();
    });
  }

  /* ---- Save ------------------------------------------------------------ */

  async function saveFile (): Promise<void> {
    if (fs.fileHandle && hasFileSystemAccess()) {
      // Silent overwrite path: a file is "open" and the browser can
      // write to it without a picker.
      await writeToHandle(fs.fileHandle, parser.content);
      fs.markSaved(parser.content);
      logger.info(`Saved to ${fs.fileHandle.name}`);
      return;
    }
    // No handle (Firefox/Safari always lands here; Chrome lands here on
    // the first save of new content) -- delegate to Save As.
    await saveFileAs();
  }

  async function saveFileAs (): Promise<void> {
    const suggestedName = deriveDefaultFilename();

    if (hasFileSystemAccess()) {
      await saveAsViaFsAccess(suggestedName);
    } else {
      saveAsViaDownload(suggestedName);
    }
  }

  async function saveAsViaFsAccess (suggestedName: string): Promise<void> {
    let handle: XdbmlFileHandle | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'xDBML schema',
            accept: { 'text/plain': ['.xdbml'] },
          },
        ],
        excludeAcceptAllOption: false,
      });
    } catch (err) {
      if (isAbortError(err)) return;
      throw err;
    }

    if (!handle) return;
    await writeToHandle(handle, parser.content);

    fs.fileHandle = handle;
    fs.filename = handle.name;
    fs.markSaved(parser.content);
    logger.info(`Saved as ${handle.name} via File System Access API`);
  }

  /**
   * Fallback save flow for Firefox and Safari. Triggers a download
   * via a synthetic <a download> click. The user can't choose the
   * location; the browser routes to its configured Downloads folder.
   *
   * Note: we mark the content as "saved" even though there's no
   * persistent file handle. The dirty indicator clears, since the
   * user has materialized a copy on disk somewhere. If they then
   * edit and hit Save again, the dirty indicator reappears and a
   * new download triggers. This is the closest analog to "I saved
   * my work" that's possible without the FS Access API.
   */
  function saveAsViaDownload (suggestedName: string): void {
    const blob = new Blob([parser.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Schedule URL release so the browser has time to start the
    // download. 30 seconds is generous; most downloads start immediately.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);

    fs.fileHandle = null;
    fs.filename = suggestedName;
    fs.markSaved(parser.content);
    logger.info(`Downloaded ${suggestedName} via file-input fallback`);
  }

  /* ---- Helpers --------------------------------------------------------- */

  async function writeToHandle (handle: XdbmlFileHandle, content: string): Promise<void> {
    const writable = await handle.createWritable();
    try {
      await writable.write(content);
    } finally {
      await writable.close();
    }
  }

  /**
   * Distinguish a user-initiated picker cancellation from a real
   * error. The File System Access API throws DOMException with
   * name === 'AbortError' on cancel.
   */
  function isAbortError (err: unknown): boolean {
    return err instanceof DOMException && err.name === 'AbortError';
  }

  return {
    canUseFsAccess,
    openFile,
    saveFile,
    saveFileAs,
  };
}
