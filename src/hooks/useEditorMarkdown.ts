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

export function useEditorMarkdown(opts: Options = {}) {
  const { debounceMs = 300 } = opts;
  const [markdown, setMarkdown] = React.useState<string>('');
  const lastRawRef = React.useRef<string>('');
  const attachPhaseRef = React.useRef<string>('init');
  const debTimerRef = React.useRef<number | null>(null);
  const observerRef = React.useRef<MutationObserver | null>(null);
  const cleanupRef = React.useRef<(() => void) | null>(null);
  const domHandlersRef = React.useRef<Array<{ target: EventTarget | null; event: string; fn: EventListener }>>([]);
  const msgHandlerRef = React.useRef<((ev: MessageEvent) => void) | null>(null);
  const retryRef = React.useRef(0);
  const inputListenerRef = React.useRef<((e: Event) => void) | null>(null);

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

    function attachTextarea(): boolean {
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
          return true;
        }
      }
      return false;
    }

    function attachCM6(): boolean {
      try {
        const EditorView = (window as any).EditorView || (window as any).CodeMirror?.EditorView;
        let foundView: any = null;
        for (const sel of CM6_SELECTORS) {
          const nodes = Array.from(document.querySelectorAll<HTMLElement>(sel));
          for (const node of nodes) {
            try {
              if (EditorView && typeof EditorView.findFromDOM === 'function') {
                const v = EditorView.findFromDOM(node);
                if (v) { foundView = v; break; }
              }
              const maybe = (node as any).cmView || (node as any).view || (node as any).__cmView || (node as any).CodeMirrorView;
              if (maybe && maybe.state && (maybe.state.doc || typeof maybe.state.sliceDoc === 'function')) { foundView = maybe; break; }
            } catch (e) { /* ignore per-node errors */ }
          }
          if (foundView) break;
        }

        const view = foundView;
        if (!view) return false;

        attachPhaseRef.current = 'cm6';
        const read = () => {
          try {
            const txt = view.state && view.state.doc && typeof view.state.doc.toString === 'function'
              ? view.state.doc.toString()
              : (view.state && typeof view.state.sliceDoc === 'function' ? view.state.sliceDoc() : '');
            emit(txt);
          } catch (e) { /* ignore */ }
        };
        read();

        // Prefer EditorView updateListener if available
        const EditorViewCtor = (window as any).EditorView || (view && (view.constructor as any));
        try {
          if (EditorViewCtor && EditorViewCtor.updateListener && typeof EditorViewCtor.updateListener.of === 'function') {
            const listener = EditorViewCtor.updateListener.of((u: any) => { if (u.docChanged) read(); });
            // try appendConfig; if unavailable, fallthrough to event/observer approach
            try {
              let StateEffect: any = (window as any).StateEffect;
              if (!StateEffect && (EditorViewCtor as any)?.StateEffect) StateEffect = (EditorViewCtor as any).StateEffect;
              if (!StateEffect && (view as any).constructor?.StateEffect) StateEffect = (view as any).constructor.StateEffect;
              if (StateEffect && StateEffect.appendConfig && typeof StateEffect.appendConfig.of === 'function' && typeof view.dispatch === 'function') {
                view.dispatch({ effects: StateEffect.appendConfig.of(listener) });
                cleanupRef.current = () => { /* best-effort: not always removable */ };
                return true;
              }
            } catch (e) { /* ignore append errors */ }
          }
        } catch (e) { /* ignore */ }

        // If updateListener can't be appended, attach DOM event handlers and observers
        try {
          let host: HTMLElement | null = null;
          if (view && (view.dom instanceof HTMLElement)) host = view.dom as HTMLElement;
          else if ((view as any).root && (view as any).root.dom) host = (view as any).root.dom as HTMLElement;

          if (host) {
            const ta = host.querySelector('textarea');
            if (ta) {
              const handler = () => { try { read(); } catch (e) { /* ignore */ } };
              ta.addEventListener('input', handler);
              domHandlersRef.current.push({ target: ta, event: 'input', fn: handler });
              cleanupRef.current = () => { ta.removeEventListener('input', handler); };
            } else {
              const target = host.querySelector('.cm-content') ?? host;
              if (target) {
                const events = ['beforeinput', 'input', 'keydown', 'paste', 'cut', 'compositionend'];
                for (const ev of events) {
                  const fn = (e: Event) => { try { read(); } catch (e) { /* ignore */ } };
                  target.addEventListener(ev, fn);
                  domHandlersRef.current.push({ target, event: ev, fn });
                }
                cleanupRef.current = () => { for (const { target: t, event: k, fn: h } of domHandlersRef.current) { t?.removeEventListener(k, h); } domHandlersRef.current = []; };
              }
            }
          }
        } catch (e) { /* ignore */ }

        // attach viewer mutation observer + message listener
        try {
          const viewerSelectors = ['.vivlio-viewer', '#vivlio-viewer', '.vivlio-iframe', '.vivlio-preview', '.viewer', '.preview', '.vivlio', 'iframe'];
          const mutationCb = (muts: MutationRecord[]) => {
            for (const m of muts) {
              if ((m.addedNodes && m.addedNodes.length > 0) || m.type === 'characterData' || m.type === 'attributes') { try { read(); } catch {} break; }
            }
          };
          const editorRoot = view.dom?.closest('.cm-editor') || view.dom?.parentElement || document.body;
          observerRef.current = new MutationObserver(mutationCb);
          observerRef.current.observe(editorRoot, { childList: true, subtree: true, characterData: true, attributes: true });
          const msgHandler = (ev: MessageEvent) => { try { read(); } catch {} };
          window.addEventListener('message', msgHandler);
          msgHandlerRef.current = msgHandler;
          const prevCleanup = cleanupRef.current;
          cleanupRef.current = () => {
            try { for (const { target: t, event: k, fn: h } of domHandlersRef.current) { t?.removeEventListener(k, h); } } catch (e) { /* ignore */ }
            domHandlersRef.current = [];
            try { observerRef.current?.disconnect(); observerRef.current = null; } catch (e) { /* ignore */ }
            if (msgHandlerRef.current) { try { window.removeEventListener('message', msgHandlerRef.current); msgHandlerRef.current = null; } catch (e) { /* ignore */ } }
            try { prevCleanup?.(); } catch (e) { /* ignore */ }
          };
        } catch (e) { /* ignore */ }

        return true;
      } catch (e) {
        return false;
      }
    }

    function attachCM5(): boolean {
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
            // fallback: observer/message
            try {
              observerRef.current = new MutationObserver(() => { try { read(); } catch {} });
              observerRef.current.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true });
              const msgHandler = (ev: MessageEvent) => { try { read(); } catch {} };
              window.addEventListener('message', msgHandler);
              msgHandlerRef.current = msgHandler;
              cleanupRef.current = () => { try { observerRef.current?.disconnect(); observerRef.current = null; } catch(e){} if (msgHandlerRef.current) { try { window.removeEventListener('message', msgHandlerRef.current); msgHandlerRef.current = null; } catch(e){} } };
            } catch (e2) { /* ignore */ }
          }
          return true;
        }
      } catch (e) { /* ignore */ }
      return false;
    }

    try {
      if (attachTextarea()) return;
      if (attachCM6()) return;
      if (attachCM5()) return;
    } catch (e) { /* ignore */ }

    // retry with exponential backoff-ish delays a limited number of times
    retryRef.current += 1;
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] useEditorMarkdown: retry', { retry: retryRef.current, phase: attachPhaseRef.current });
    if (retryRef.current < 45) {
      const delay = retryRef.current < 8 ? 200 : 600;
      const t = window.setTimeout(() => { try { /* re-run detection */ if (!disposed) { if (attachTextarea()) return; if (attachCM6()) return; if (attachCM5()) return; } } catch {} }, delay);
      // ensure this timeout doesn't keep process alive when unmounted
      cleanupRef.current = () => { try { clearTimeout(t); } catch {} };
    } else {
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG] useEditorMarkdown: editor detection failed after extended retries');
    }

    return () => {
      disposed = true;
      // remove dom handlers
      try { for (const { target: t, event: k, fn: h } of domHandlersRef.current) { t?.removeEventListener(k, h); } } catch (e) { /* ignore */ }
      domHandlersRef.current = [];
      // additional cleanup
      cleanupRef.current?.();
      try { observerRef.current?.disconnect(); observerRef.current = null; } catch (e) { /* ignore */ }
      if (msgHandlerRef.current) { try { window.removeEventListener('message', msgHandlerRef.current); msgHandlerRef.current = null; } catch (e) { /* ignore */ } }
      if (debTimerRef.current) window.clearTimeout(debTimerRef.current);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] useEditorMarkdown: cleanup', { phase: attachPhaseRef.current });
    };
  }, [emit]);

  return { markdown };
}
