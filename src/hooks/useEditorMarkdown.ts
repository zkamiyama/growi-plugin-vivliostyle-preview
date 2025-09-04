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

  // NOTE: Removed contenteditable DOM fallback intentionally.
  // Reading visible text from `.cm-content` (innerText/textContent) can
  // drop folded/virtualized content and lead to truncated Markdown being
  // sent to the preview. We avoid that by relying on authoritative APIs
  // (CodeMirror 6 EditorView or CodeMirror 5 instance) and only using
  // textarea/instance routes that are expected to contain the full source.

      // 2) Try CodeMirror 6 via API (robust against fold/virtualization)
      try {
        const EditorView = (window as any).EditorView || (window as any).CodeMirror?.EditorView;

        // Try to locate a CM6 EditorView; prefer EditorView.findFromDOM but
        // fall back to checking element properties like `cmView` which some hosts
        // attach directly to the DOM node.
        let foundView: any = null;
        for (const sel of CM6_SELECTORS) {
          const nodes = Array.from(document.querySelectorAll<HTMLElement>(sel));
          // helper: try to resolve a candidate object to an object that has a CM6-like state/doc
          const resolveViewCandidate = (obj: any): any | null => {
            if (!obj) return null;
            try {
              if (obj.state && (obj.state.doc || typeof obj.state.sliceDoc === 'function')) return obj;
            } catch (e) { /* ignore */ }
            // inspect own properties (shallow) for an inner object with state.doc
            try {
              const names = Object.getOwnPropertyNames(obj || {}).slice(0, 200);
              for (const n of names) {
                try {
                  const v = obj[n];
                  if (v && typeof v === 'object') {
                    if (v.state && (v.state.doc || typeof v.state.sliceDoc === 'function')) return v;
                  }
                } catch (e) { /* ignore property access errors */ }
              }
              // also try symbol properties
              const syms = Object.getOwnPropertySymbols(obj || {});
              for (const s of syms) {
                try {
                  const v = (obj as any)[s];
                  if (v && typeof v === 'object' && v.state && (v.state.doc || typeof v.state.sliceDoc === 'function')) return v;
                } catch (e) { /* ignore */ }
              }
            } catch (e) { /* ignore final */ }
            return null;
          };

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
                if (maybe) {
                  // direct state
                  if (maybe.state && (maybe.state.doc || typeof maybe.state.sliceDoc === 'function')) { foundView = maybe; break; }
                  // try to resolve wrapped candidate objects (some hosts attach wrappers)
                  const resolved = resolveViewCandidate(maybe);
                  if (resolved) { foundView = resolved; /* eslint-disable-line no-unused-vars */ break; }
                }
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
              // create listener that logs when fired and delegates to `read` on doc changes
              const listener = EditorView.updateListener.of((u: any) => {
                try {
                  // eslint-disable-next-line no-console
                  console.debug('[VivlioDBG] useEditorMarkdown: CM6 updateListener fired', { docChanged: !!u.docChanged });
                } catch (e) { /* ignore logging errors */ }
                if (u.docChanged) read();
              });

              // try appendConfig; may throw or be unavailable in some environments
              let appended = false;
              try {
                const StateEffect = (window as any).StateEffect;
                if (StateEffect && StateEffect.appendConfig && typeof StateEffect.appendConfig.of === 'function' && typeof view.dispatch === 'function') {
                  view.dispatch({ effects: StateEffect.appendConfig.of(listener) });
                  appended = true;
                  // eslint-disable-next-line no-console
                  console.debug('[VivlioDBG] useEditorMarkdown: CM6 updateListener appended via StateEffect.appendConfig');
                } else {
                  throw new Error('appendConfig or dispatch unavailable');
                }
              } catch (e) {
                // eslint-disable-next-line no-console
                console.debug('[VivlioDBG] useEditorMarkdown: CM6 updateListener append failed, falling back to polling', { error: String(e) });
              }

              if (!appended) {
                // fallback: periodic polling
                // eslint-disable-next-line no-console
                console.debug('[VivlioDBG] useEditorMarkdown: CM6 polling started (fallback)');
                pollTimer = window.setInterval(read, 500);
                cleanupRef.current = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
              } else {
                // best-effort cleanup (cannot reliably remove appended extension in all hosts)
                cleanupRef.current = () => { /* no-op */ };
              }
            } else {
              // updateListener not available; use polling
              // eslint-disable-next-line no-console
              console.debug('[VivlioDBG] useEditorMarkdown: CM6 updateListener not available, using polling');
              pollTimer = window.setInterval(read, 500);
              cleanupRef.current = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
            }
          } catch (e) {
            // any unexpected error: fallback to polling
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG] useEditorMarkdown: CM6 updateListener unexpected error, using polling', { error: String(e) });
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
      // increase retry attempts and use faster early polling to catch delayed EditorView registration
      if (retryRef.current < 45) {
        const delay = retryRef.current < 8 ? 200 : 600; // faster initial retries
        setTimeout(tryAttach, delay);
      } else {
        // eslint-disable-next-line no-console
        console.warn('[VivlioDBG] useEditorMarkdown: editor detection failed after extended retries');
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
