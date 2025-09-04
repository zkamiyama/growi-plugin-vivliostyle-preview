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
  '.cm-editor',
  '.cm-editor .cm-content',
  '.cm-editor .cm-scroller',
  '.cm-content[contenteditable="true"]',
  '.cm-scroller',
  '.grw-editor',
  '.editor',
  '#page-editor',
  '.page-editor',
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
    let pollTimer: number | null = null;

    function tryAttach() {
      if (disposed) return;

      // 1) Textarea (still safest fallback)
      for (const sel of TEXTAREA_SELECTORS) {
        const ta = document.querySelector<HTMLTextAreaElement>(sel);
        if (ta) {
          attachPhaseRef.current = 'textarea';
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG] useEditorMarkdown: textarea found', { sel, valueLen: ta.value.length });
          const handler = () => emit(ta.value);
          handler();
          ta.addEventListener('input', handler);
          cleanupRef.current = () => ta.removeEventListener('input', handler);
          return;
        }
      }

      // 2) Try CodeMirror 6 via API (robust against fold/virtualization)
      try {
        const EditorView = (window as any).EditorView || (window as any).CodeMirror?.EditorView;

        // Try to locate a CM6 EditorView; prefer EditorView.findFromDOM but
        // fall back to checking element properties like `cmView` which some hosts
        // attach directly to the DOM node.
        let foundView: any = null;
        for (const sel of CM6_SELECTORS) {
          const nodes = Array.from(document.querySelectorAll<HTMLElement>(sel));
          for (const node of nodes) {
            try {
              // 1) Preferred path: EditorView.findFromDOM if available
              if (EditorView && typeof EditorView.findFromDOM === 'function') {
                try {
                  const v = EditorView.findFromDOM(node);
                  if (v) { foundView = v; break; }
                } catch (e) { /* ignore find errors */ }
              }
              // 2) Fallback: some hosts attach the CM6 view instance to the node
              // under `cmView` (observed) or similar property names. Try common names.
              if (!foundView) {
                const maybe = (node as any).cmView || (node as any).view || (node as any).__cmView || (node as any).CodeMirrorView;
                if (maybe && maybe.state) { foundView = maybe; break; }
              }
            } catch (e) { /* ignore per-node errors */ }
          }
          if (foundView) break;
        }

        const view = foundView;
        if (view) {
          attachPhaseRef.current = 'cm6';
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG] useEditorMarkdown: CM6 view found', { sel: 'multiple-candidates', len: (view.state?.doc ? (typeof view.state.doc.toString === 'function' ? view.state.doc.toString().length : (typeof view.state.sliceDoc === 'function' ? view.state.sliceDoc().length : 0)) : 0) });
          const read = () => {
            try {
              const txt = view.state && view.state.doc && typeof view.state.doc.toString === 'function'
                ? view.state.doc.toString()
                : (view.state && typeof view.state.sliceDoc === 'function' ? view.state.sliceDoc() : '');
              emit(txt);
            } catch (e) { /* ignore read errors */ }
          };
          read();
          try {
            if (EditorView.updateListener && typeof EditorView.updateListener.of === 'function') {
              const listener = EditorView.updateListener.of((u: any) => { if (u.docChanged) read(); });
              // try appendConfig; may throw in some environments
              try { view.dispatch?.({ effects: (window as any).StateEffect?.appendConfig?.of(listener) }); } catch (e) { /* fall back to polling */ }
              // best-effort cleanup (cannot remove appended ext reliably)
              cleanupRef.current = () => { /* no-op */ };
            } else {
              pollTimer = window.setInterval(read, 500);
              cleanupRef.current = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
            }
          } catch (e) {
            pollTimer = window.setInterval(read, 500);
            cleanupRef.current = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
          }
          return;
        }
      } catch (e) {
        // ignore and fallback
      }

      // 3) CodeMirror 5: use instance API if available
      try {
        const cmHost = document.querySelector('.CodeMirror') as any;
        if (cmHost && cmHost.CodeMirror) {
          attachPhaseRef.current = 'cm5';
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG] useEditorMarkdown: CM5 instance found');
          const cm = cmHost.CodeMirror as any;
          const read = () => { try { emit(cm.getValue()); } catch (e) { /* ignore */ } };
          read();
          try {
            cm.on('change', read);
            cleanupRef.current = () => { try { cm.off('change', read); } catch (e) { /* ignore */ } };
          } catch (e) {
            const p = window.setInterval(read, 500);
            cleanupRef.current = () => clearInterval(p);
          }
          return;
        }
      } catch (e) {
        // ignore
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
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] useEditorMarkdown: cleanup', { phase: attachPhaseRef.current });
    };
  }, [emit]);

  return { markdown };
}
