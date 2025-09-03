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
    // TODO: GROWIの正規APIで購読に置き換え
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea.editor') 
      || document.querySelector<HTMLTextAreaElement>('#page-editor textarea');

    const handler = () => {
      const val = textarea?.value ?? '';
      setDebounced(val);
    };

    handler(); // 初期取得
    textarea?.addEventListener('input', handler);
    return () => {
      textarea?.removeEventListener('input', handler);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [setDebounced]);

  return { markdown };
}
