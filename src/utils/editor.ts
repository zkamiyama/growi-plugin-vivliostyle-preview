// src/utils/editor.ts
// Helper utilities for interacting with the active GROWI editor instance.

/**
 * Attempts to synchronously read the current markdown from the active editor.
 * Supports CodeMirror 6, textarea fallbacks, and older CodeMirror versions.
 * Returns an empty string if no editable surface can be detected.
 */
export function readEditorMarkdownSnapshot(): string {
  // 1) CodeMirror 6 (EditorView)
  try {
    const EditorView =
      (window as any).EditorView ||
      (window as any).CodeMirror?.EditorView;
    if (EditorView && typeof EditorView.findFromDOM === 'function') {
      const cmRoot = document.querySelector('.cm-editor') as HTMLElement | null;
      if (cmRoot) {
        const view = EditorView.findFromDOM(cmRoot);
        if (view && view.state) {
          if (view.state.doc && typeof view.state.doc.toString === 'function') {
            return view.state.doc.toString();
          }
          if (typeof view.state.sliceDoc === 'function') {
            return view.state.sliceDoc();
          }
        }
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][editor] readEditorMarkdownSnapshot CM6 failed', error);
  }

  // 2) Explicit textareas that GROWI exposes in certain layouts.
  try {
    const selectors = [
      'textarea.editor',
      '#page-editor textarea',
      '.page-editor textarea',
      '[data-testid="editor-textarea"]',
      'textarea[name="markdown"]',
      'textarea[name="body"]',
    ];
    for (const selector of selectors) {
      const ta = document.querySelector(selector) as HTMLTextAreaElement | null;
      if (ta && typeof ta.value === 'string' && ta.value) {
        return ta.value;
      }
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][editor] readEditorMarkdownSnapshot textarea probe failed', error);
  }

  // 3) CodeMirror 5 fallback (hidden textarea mirror).
  try {
    const hidden = document.querySelector('.CodeMirror textarea') as HTMLTextAreaElement | null;
    if (hidden && typeof hidden.value === 'string') {
      return hidden.value;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][editor] readEditorMarkdownSnapshot CM5 fallback failed', error);
  }

  return '';
}

