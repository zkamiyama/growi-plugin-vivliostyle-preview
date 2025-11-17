// hooks/usePreviewToggle.ts
import * as React from 'react';

export function usePreviewToggle() {
  const [isOpen, setOpen] = React.useState<boolean>(() => {
    const raw = localStorage.getItem('vivlio:isOpen');
    const val = raw === '1' ? true : false;
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][usePreviewToggle] init', { raw, val });
    return val;
  });

  const open = React.useCallback(() => setOpen(true), []);
  const close = React.useCallback(() => setOpen(false), []);
  const toggle = React.useCallback(() => {
    setOpen(v => {
      const next = !v;
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][usePreviewToggle] toggle', { from: v, to: next });
      return next;
    });
  }, []);

  React.useEffect(() => {
    localStorage.setItem('vivlio:isOpen', isOpen ? '1' : '0');
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][usePreviewToggle] persist', { isOpen });
    // 外部ボタン同期用カスタムイベント
    try {
      window.dispatchEvent(new CustomEvent('vivlio:state-changed', { detail: { isOpen } }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG][usePreviewToggle] event dispatch failed', e);
    }
  }, [isOpen]);

  return { isOpen, open, close, toggle };
}
