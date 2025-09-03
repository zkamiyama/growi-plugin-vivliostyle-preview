// ExternalToggle.tsx
// GROWI の既存編集バー(例えば Edit ボタン)の隣に常に表示させる外部トグル。
// DOM 構造に強く依存しないよう、特定の既知クラスを探索し最初に見つかった要素の直後に差し込む。
import * as React from 'react';
import { useAppContext } from '../context/AppContext';
import { createPortal } from 'react-dom';

// 旧単一実装のロジックを簡略移植: 編集/表示ボタンを優先探索し、その直後へ差し込む
let attempt = 0;
function findAnchor(): HTMLElement | null {
  // data-testid 優先 (GROWI 新UI)
  const edit = document.querySelector('[data-testid="editor-button"]') as HTMLElement | null;
  const view = document.querySelector('[data-testid="view-button"]') as HTMLElement | null;
  let target: HTMLElement | null = edit || view;
  if (!target) {
    const btns = Array.from(document.querySelectorAll('button, a.btn')) as HTMLElement[];
    target = btns.find(b => /Edit$/i.test((b.textContent||'').replace(/\s+/g,' ').trim()))
      || btns.find(b => /View$/i.test((b.textContent||'').replace(/\s+/g,' ').trim()))
      || null;
  }
  if (!target && attempt < 5) {
    attempt++;
    // 次のレイアウト確定を待ってリトライ
    setTimeout(() => { findAnchor(); }, 400);
  }
  return target;
}

export const ExternalToggle: React.FC = () => {
  const { isOpen, toggle } = useAppContext();
  const [wrapperEl, setWrapperEl] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    function ensureWrapper() {
      if (cancelled) return;
      const anchor = findAnchor();
      if (!anchor || !anchor.parentElement) {
        setTimeout(ensureWrapper, 500);
        return;
      }
      let wrapper = anchor.parentElement.querySelector('.vivlio-inline-toggle') as HTMLElement | null;
      if (!wrapper) {
        wrapper = document.createElement('span');
        wrapper.className = 'vivlio-inline-toggle';
        wrapper.style.marginLeft = '6px';
        anchor.parentElement.insertBefore(wrapper, anchor.nextSibling);
      }
      setWrapperEl(wrapper);
    }
    ensureWrapper();
    return () => { cancelled = true; };
  }, []);

  if (!wrapperEl) return null;
  return createPortal(
    <button
      type="button"
      className={`btn btn-sm ${isOpen ? 'btn-secondary' : 'btn-outline-secondary'}`}
      onClick={toggle}
      aria-pressed={isOpen}
      title="Toggle Vivliostyle Preview"
    >
      {isOpen ? 'Vivlio Close' : 'Vivlio Preview'}
    </button>,
    wrapperEl
  );
};

export default ExternalToggle;