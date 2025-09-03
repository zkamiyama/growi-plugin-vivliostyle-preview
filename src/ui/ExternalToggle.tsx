// ExternalToggle.tsx
// GROWI の既存編集バー(例えば Edit ボタン)の隣に常に表示させる外部トグル。
// DOM 構造に強く依存しないよう、特定の既知クラスを探索し最初に見つかった要素の直後に差し込む。
import * as React from 'react';
import { useAppContext } from '../context/AppContext';
import { createPortal } from 'react-dom';

/**
 * ボタン挿入用アンカー探索ロジック
 * - 複数候補CSSセレクタを優先順に試行
 * - 見つからない場合はヒューリスティック(文言/role)走査
 * - 遅延レンダリング対策として MutationObserver で監視
 */
const ANCHOR_SELECTOR_CANDIDATES = [
  '.page-editor-meta .btn-edit-page',               // 旧/一部テーマ
  '[data-testid="editor-button"]',                // 新UI (編集)
  '[data-testid="view-button"]',                  // 新UI (表示)
  '.page-editor-header .btn-edit',
  '.btn-edit-page',
];

function pickFirst<T>(arr: T[] | null | undefined): T | null {
  if (!arr || !arr.length) return null;
  return arr[0];
}

function normalizeLabel(el: Element): string {
  return (el.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function queryAnchorBySelectors(): HTMLElement | null {
  for (const sel of ANCHOR_SELECTOR_CANDIDATES) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

function heuristicScan(): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll('button, a.btn, a')) as HTMLElement[];
  const scored: { el: HTMLElement; score: number }[] = [];
  buttons.forEach(el => {
    const label = normalizeLabel(el);
    if (!label) return;
    let score = 0;
    if (/edit/.test(label)) score += 3;
    if (/view/.test(label)) score += 2;
    if (/page/.test(label)) score += 1;
    if (/\bedit\b/.test(label)) score += 2;
    if (score > 0) scored.push({ el, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return pickFirst(scored.map(s => s.el));
}

function findAnchorOnce(): HTMLElement | null {
  return queryAnchorBySelectors() || heuristicScan();
}

export const ExternalToggle: React.FC = () => {
  const { isOpen, toggle } = useAppContext();
  const [wrapperEl, setWrapperEl] = React.useState<HTMLElement | null>(null);
  const observerRef = React.useRef<MutationObserver | null>(null);
  const resolvedRef = React.useRef(false);

  React.useEffect(() => {
    function attach(anchor: HTMLElement) {
      if (resolvedRef.current) return; // 冪等
      if (!anchor.parentElement) return;
      let wrapper = anchor.parentElement.querySelector('.vivlio-inline-toggle') as HTMLElement | null;
      if (!wrapper) {
        wrapper = document.createElement('span');
        wrapper.className = 'vivlio-inline-toggle';
        wrapper.style.marginLeft = '6px';
        anchor.parentElement.insertBefore(wrapper, anchor.nextSibling);
      }
      setWrapperEl(wrapper);
      resolvedRef.current = true;
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    }

    // 1) 即時試行
    const immediate = findAnchorOnce();
    if (immediate) {
      attach(immediate);
      return () => { /* no-op cleanup */ };
    }

    // 2) ポーリング (早期 DOM 未構築ケース) + 3回
    let pollCount = 0;
    const maxPoll = 3;
    const pollInterval = 400;
    const pollTimer = setInterval(() => {
      if (resolvedRef.current) return;
      const found = findAnchorOnce();
      if (found) {
        attach(found);
        clearInterval(pollTimer);
        return;
      }
      pollCount += 1;
      if (pollCount >= maxPoll) {
        clearInterval(pollTimer);
      }
    }, pollInterval);

    // 3) MutationObserver (最終手段) - body 配下を監視して候補が追加されたら即 attach
    observerRef.current = new MutationObserver((mutations) => {
      if (resolvedRef.current) return;
      for (const m of mutations) {
        if (!m.addedNodes?.length) continue;
        for (const node of Array.from(m.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
            // 追加ノード自体 or 子孫に anchor が含まれるか
            const direct = findAnchorOnce();
            if (direct) {
              attach(direct);
              return;
            }
        }
      }
    });
    observerRef.current.observe(document.body, { subtree: true, childList: true });

    return () => {
      clearInterval(pollTimer);
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  if (!wrapperEl) return null;
  return createPortal(
    <button
      type="button"
      className={`btn btn-sm ${isOpen ? 'btn-secondary' : 'btn-outline-secondary'}`}
      onClick={toggle}
      aria-pressed={isOpen}
      title="Toggle Vivliostyle Preview"
      data-vivlio-toggle="true"
    >
      {isOpen ? 'Close Vivliostyle' : 'Vivliostyle Preview'}
    </button>,
    wrapperEl
  );
};

export default ExternalToggle;