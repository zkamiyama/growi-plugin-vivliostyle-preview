// hooks/usePreviewToggle.ts
import * as React from 'react';

export function usePreviewToggle() {
  const [isOpen, setOpen] = React.useState<boolean>(() => {
    const raw = localStorage.getItem('vivlio:isOpen');
    return raw === '1' ? true : false;
  });

  const open = React.useCallback(() => setOpen(true), []);
  const close = React.useCallback(() => setOpen(false), []);
  const toggle = React.useCallback(() => setOpen(v => !v), []);

  React.useEffect(() => {
    localStorage.setItem('vivlio:isOpen', isOpen ? '1' : '0');
    // 外部ボタン同期用カスタムイベント
    try {
      window.dispatchEvent(new CustomEvent('vivlio:state-changed', { detail: { isOpen } }));
    } catch { /* ignore */ }
  }, [isOpen]);

  return { isOpen, open, close, toggle };
}
