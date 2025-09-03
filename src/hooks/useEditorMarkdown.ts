// hooks/useEditorMarkdown.ts
import * as React from 'react';

type Options = { debounceMs?: number };

export function useEditorMarkdown(opts: Options = {}) {
  const { debounceMs = 250 } = opts;
  const [markdown, setMarkdown] = React.useState<string>('');

  // 簡易デバウンス
  const timeoutRef = React.useRef<number | null>(null);
  const setDebounced = React.useCallback((next: string) => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setMarkdown(next), debounceMs);
  }, [debounceMs]);

  React.useEffect(() => {
    const SELECTOR_CANDIDATES = [
      'textarea.editor',
      '#page-editor textarea',
      '.CodeMirror textarea',
      '[data-testid="editor-textarea"]',
      '.page-editor textarea',
    ];
    let textarea: HTMLTextAreaElement | null = null;
    function findOnce() {
      for (const sel of SELECTOR_CANDIDATES) {
        const el = document.querySelector<HTMLTextAreaElement>(sel);
        if (el) {
          textarea = el;
          return el;
        }
      }
      return null;
    }

    textarea = findOnce();
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] useEditorMarkdown: textarea lookup', { found: !!textarea });
    if (!textarea) {
      let retry = 0;
      const maxRetry = 10;
      const timer = window.setInterval(() => {
        if (textarea) { window.clearInterval(timer); return; }
        retry += 1;
        textarea = findOnce();
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG] useEditorMarkdown: retry lookup', { retry, found: !!textarea });
        if (textarea) {
          handler();
          textarea.addEventListener('input', handler);
          window.clearInterval(timer);
        }
        if (retry >= maxRetry) window.clearInterval(timer);
      }, 400);
    }

  const handler = () => {
      const val = textarea?.value ?? '';
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] useEditorMarkdown: input event', { length: val.length });
      setDebounced(val);
    };

    if (textarea) {
      handler(); // 初期取得
      textarea.addEventListener('input', handler);
    }
    return () => {
      textarea?.removeEventListener('input', handler);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [setDebounced]);

  return { markdown };
}
