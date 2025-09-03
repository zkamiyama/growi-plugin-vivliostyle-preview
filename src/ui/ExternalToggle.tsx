// ExternalToggle.tsx
// GROWI の既存編集バー(例えば Edit ボタン)の隣に常に表示させる外部トグル。
// DOM 構造に強く依存しないよう、特定の既知クラスを探索し最初に見つかった要素の直後に差し込む。
import * as React from 'react';
import { usePreviewToggle } from '../hooks/usePreviewToggle';

function findAnchor(): HTMLElement | null {
  // 代表的な候補クラス (GROWI 側で必要に応じ追加)
  const selectors = [
    '.btn-edit',
    '#edit-button',
    '.grw-page-control-buttons .btn-primary',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

export const ExternalToggle: React.FC = () => {
  const { isOpen, toggle } = usePreviewToggle();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // 既存ボタンの近くにラッパ span を確保
    const anchor = findAnchor();
    if (!anchor || anchor.parentElement == null) return;
    if (anchor.parentElement.querySelector('.vivlio-inline-toggle')) {
      setMounted(true);
      return; // 既に挿入済み
    }
    const wrapper = document.createElement('span');
    wrapper.className = 'vivlio-inline-toggle';
    wrapper.style.marginLeft = '8px';
    anchor.parentElement.insertBefore(wrapper, anchor.nextSibling);
    setMounted(true);
    return () => {
      if (wrapper.parentElement) wrapper.parentElement.removeChild(wrapper);
    };
  }, []);

  if (!mounted) return null;
  return (
    <button
      type="button"
      className={`btn btn-sm ${isOpen ? 'btn-secondary' : 'btn-outline-secondary'}`}
      onClick={toggle}
      aria-pressed={isOpen}
      title="Toggle Vivliostyle Preview"
    >
      {isOpen ? 'Vivlio Close' : 'Vivlio Preview'}
    </button>
  );
};

export default ExternalToggle;