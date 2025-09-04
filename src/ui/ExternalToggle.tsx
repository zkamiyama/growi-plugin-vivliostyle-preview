// ExternalToggle.tsx
// GROWI の既存編集バー(例えば Edit ボタン)の隣に常に表示させる外部トグル。
// DOM 構造に強く依存しないよう、特定の既知クラスを探索し最初に見つかった要素の直後に差し込む。
import * as React from 'react';
import { useAppContext } from '../context/AppContext';
import '../VivlioToggle.css';
import { createPortal } from 'react-dom';

/**
 * ボタン挿入用アンカー探索ロジック
 * - 複数候補CSSセレクタを優先順に試行
 * - 見つからない場合はヒューリスティック(文言/role)走査
 */
const ANCHOR_SELECTOR_CANDIDATES = [
  '[data-testid="view-button"]',                  // 新UI (表示) - 優先的にViewボタンを探す
  '.page-editor-meta .btn-edit-page',               // 旧/一部テーマ
  '[data-testid="editor-button"]',                // 新UI (編集)
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
    if (/view/.test(label)) score += 4;  // viewを最優先に
    if (/edit/.test(label)) score += 2;
    if (/page/.test(label)) score += 1;
    if (/\bedit\b/.test(label)) score += 1;
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
  const [anchorClasses, setAnchorClasses] = React.useState<string>('');
  const resolvedRef = React.useRef(false);
  const lastBaseColorRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    function attach(initialAnchor: HTMLElement) {
      if (resolvedRef.current) return; // 冪等
      if (!initialAnchor.parentElement) return;
      let wrapper = initialAnchor.parentElement.querySelector('.vivlio-inline-toggle') as HTMLElement | null;
      if (!wrapper) {
        wrapper = document.createElement('span');
        wrapper.className = 'vivlio-inline-toggle';
        wrapper.style.marginLeft = '6px';
        initialAnchor.parentElement.insertBefore(wrapper, initialAnchor);
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] wrapper created & inserted', { time: Date.now(), parent: initialAnchor.parentElement.className, anchorText: normalizeLabel(initialAnchor) });
      }
      // リポジショニング + 色適用（簡素化）
      // アンカーに適用されている色をそのまま引用する。
      const isTransparent = (c: string) => !c || c === 'transparent' || /rgba\(\s*0+\s*,\s*0+\s*,\s*0?\.?0*\s*\)/i.test(c);

      function repositionAndRecolor() {
        try {
          const cs = window.getComputedStyle(initialAnchor);
          // 優先順: backgroundColor → borderColor → color
          let baseColor = cs.backgroundColor;
          if (isTransparent(baseColor)) baseColor = cs.borderColor;
          if (isTransparent(baseColor)) baseColor = cs.color;
          if (baseColor && baseColor !== lastBaseColorRef.current) {
            // 直接引用: アンカーに適用されている CSS 値をそのまま --vivlio-comp-color に設定
            try {
              wrapper!.style.setProperty('--vivlio-comp-color', baseColor);
              const btn = wrapper!.querySelector('button') as HTMLElement | null;
              if (btn) btn.style.setProperty('--vivlio-comp-color', baseColor);
            } catch (e) {
              // ignore
            }
            lastBaseColorRef.current = baseColor;
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] color applied from anchor', { baseColor });
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[VivlioDBG][ExternalToggle] color compute error', e);
        }
      }

      // 初回計算
      repositionAndRecolor();
      setWrapperEl(wrapper);
      resolvedRef.current = true;
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][ExternalToggle] attached to anchor', { anchorSel: initialAnchor.className, text: normalizeLabel(initialAnchor) });
    }

    // 即時試行のみ（MutationObserver/ポーリングなし）
    const immediate = findAnchorOnce();
    if (immediate) {
      attach(immediate);
    }
  }, []);

  if (!wrapperEl) return null;
  // アンカー基準クラスから active を除去し、状態に応じて付与
  const baseClasses = anchorClasses
    .split(/\s+/)
    .filter(c => c && c !== 'active')
    .join(' ');
  const finalClassName = `${baseClasses} vivlio-toggle-btn vivlio-comp${isOpen ? ' active' : ''}`.trim();
  return createPortal(
    <button
      type="button"
      className={finalClassName}
      onClick={(e) => {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][ExternalToggle] click', { isOpenBefore: isOpen, time: Date.now(), anchorClasses });
        toggle();
      }}
      aria-pressed={isOpen}
      title="Toggle Vivliostyle Preview"
      data-vivlio-toggle="true"
    >
      Vivliostyle
    </button>,
    wrapperEl
  );
};

export default ExternalToggle;