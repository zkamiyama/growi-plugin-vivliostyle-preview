// ExternalToggle.tsx
// GROWI の既存編集バー(例えば Edit ボタン)の隣に常に表示させる外部トグル。
// DOM 構造に強く依存しないよう、特定の既知クラスを探索し最初に見つかった要素の直後に差し込む。
import * as React from 'react';
import { useAppContext } from '../context/AppContext';
import { createPortal } from 'react-dom';

function findAnchor(): HTMLElement | null {
  // 編集/表示ボタンを優先探索
  return document.querySelector('.page-editor-meta .btn-edit-page');
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
      {isOpen ? 'Close Vivliostyle' : 'Vivliostyle Preview'}
    </button>,
    wrapperEl
  );
};

export default ExternalToggle;