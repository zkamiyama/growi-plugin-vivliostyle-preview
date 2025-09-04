// ExternalToggle.tsx
// GROWI の既存編集バー(例えば Edit ボタン)の隣に常に表示させる外部トグル。
// DOM 構造に強く依存しないよう、特定の既知クラスを探索し最初に見つかった要素の直後に差し込む。
import * as React from 'react';
import { useAppContext } from '../context/AppContext';

function findAnchor(): HTMLElement | null {
  // 代表的な候補クラス (GROWI 側で必要に応じ追加)
  const selectors = [
    '.btn-edit',
    '#edit-button',
    '.grw-page-control-buttons .btn-primary',
    '.btn-primary[href*="edit"]',
    '[data-testid="edit-button"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) return el;
  }
  return null;
}

export const ExternalToggle: React.FC = () => {
  const { activeTab, setActiveTabWithOpen } = useAppContext();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // 既存ボタンの近くにラッパ span を確保
    const anchor = findAnchor();
    if (!anchor || anchor.parentElement == null) {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG] anchor not found for ExternalToggle');
      return;
    }

    if (anchor.parentElement.querySelector('.vivlio-inline-toggle')) {
      setMounted(true);
      return; // 既に挿入済み
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'vivlio-inline-toggle';
    wrapper.style.cssText = `
      margin-left: 8px;
      display: inline-block;
    `;

    // anchorの後に挿入
    if (anchor.nextSibling) {
      anchor.parentElement.insertBefore(wrapper, anchor.nextSibling);
    } else {
      anchor.parentElement.appendChild(wrapper);
    }

    setMounted(true);

    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] ExternalToggle mounted');

    return () => {
      if (wrapper.parentElement) wrapper.parentElement.removeChild(wrapper);
    };
  }, []);

  if (!mounted) return null;

  return (
    <button
      type="button"
      className={`btn btn-sm ${activeTab === 'vivliostyle' ? 'btn-secondary' : 'btn-outline-secondary'}`}
      onClick={() => setActiveTabWithOpen(activeTab === 'vivliostyle' ? 'markdown' : 'vivliostyle')}
      aria-pressed={activeTab === 'vivliostyle'}
      title="Toggle Vivliostyle Preview"
      style={{
        fontSize: '12px',
        padding: '4px 8px',
        borderRadius: '4px',
      }}
    >
      {activeTab === 'vivliostyle' ? 'Markdown' : 'Vivliostyle'}
    </button>
  );
};

export default ExternalToggle;