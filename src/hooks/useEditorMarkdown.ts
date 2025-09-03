// hooks/useEditorMarkdown.ts
import * as React from 'react';

type Options = { debounceMs?: number };

const TEXTAREA_SELECTORS = [
  'textarea.editor',
  '#page-editor textarea',
  '.CodeMirror textarea', // hidden CM5/6 textarea
  '[data-testid="editor-textarea"]',
  '.page-editor textarea',
];
const CM6_SELECTORS = [
  '.cm-editor .cm-content',
];
const CM5_ROOTS = [
  '.CodeMirror-code',
];

export function useEditorMarkdown(opts: Options = {}) {
  const { debounceMs = 200 } = opts;
  const [markdown, setMarkdown] = React.useState<string>('');
  const lastRawRef = React.useRef<string>('');
  const attachPhaseRef = React.useRef<string>('init');
  const debTimerRef = React.useRef<number | null>(null);
  const observerRef = React.useRef<MutationObserver | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);
  const retryRef = React.useRef(0);

  const emit = React.useCallback((raw: string) => {
    const before = lastRawRef.current;
    const changed = before !== raw;
    const delta = changed ? raw.length - before.length : 0;
    if (debTimerRef.current) window.clearTimeout(debTimerRef.current);
    debTimerRef.current = window.setTimeout(() => {
      lastRawRef.current = raw;
      setMarkdown(raw);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] useEditorMarkdown:update', {
        phase: attachPhaseRef.current,
        length: raw.length,
        changed,
        delta,
        head20: raw.slice(0, 20),
      });
    }, debounceMs);
  }, [debounceMs]);

  React.useEffect(() => {
    let disposed = false;

    function tryAttach() {
      if (disposed) return;
      // 1) Textarea
    for (const sel of TEXTAREA_SELECTORS) {
        const ta = document.querySelector<HTMLTextAreaElement>(sel);
        if (ta) {
          // eslint-disable-next-line no-console
      attachPhaseRef.current = 'textarea';
      console.debug('[VivlioDBG] useEditorMarkdown: textarea found', { sel, valueLen: ta.value.length });
          const handler = () => emit(ta.value);
          handler();
            ta.addEventListener('input', handler);
          cleanupRef.current = () => ta.removeEventListener('input', handler);
          return;
        }
      }
      // 2) CodeMirror 6
    for (const sel of CM6_SELECTORS) {
        const cm6 = document.querySelector<HTMLElement>(sel);
        if (cm6) {
          // eslint-disable-next-line no-console
      attachPhaseRef.current = 'cm6';
      console.debug('[VivlioDBG] useEditorMarkdown: CM6 content found', { sel, textLen: cm6.innerText.length });
          const extract = () => cm6.innerText;
          emit(extract());
          observerRef.current = new MutationObserver(() => emit(extract()));
          observerRef.current.observe(cm6, { childList: true, subtree: true, characterData: true });
          cleanupRef.current = () => observerRef.current?.disconnect();
          return;
        }
      }
      // 3) CodeMirror 5
    for (const sel of CM5_ROOTS) {
        const root = document.querySelector<HTMLElement>(sel);
        if (root) {
          // eslint-disable-next-line no-console
      attachPhaseRef.current = 'cm5';
      console.debug('[VivlioDBG] useEditorMarkdown: CM5 root found', { sel });
          const extract = () => Array.from(root.querySelectorAll<HTMLElement>('.CodeMirror-line'))
            .map(l => l.innerText)
            .join('\n');
          emit(extract());
          observerRef.current = new MutationObserver(() => emit(extract()));
          observerRef.current.observe(root, { childList: true, subtree: true, characterData: true });
          cleanupRef.current = () => observerRef.current?.disconnect();
          return;
        }
      }

      retryRef.current += 1;
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] useEditorMarkdown: retry', { retry: retryRef.current, phase: attachPhaseRef.current });
      if (retryRef.current < 15) {
        setTimeout(tryAttach, 300);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[VivlioDBG] useEditorMarkdown: editor detection failed');
      }
    }

    tryAttach();
    return () => {
      disposed = true;
      cleanupRef.current?.();
      observerRef.current?.disconnect();
      if (debTimerRef.current) window.clearTimeout(debTimerRef.current);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] useEditorMarkdown: cleanup', { phase: attachPhaseRef.current });
    };
  }, [emit]);

  return { markdown };
}
