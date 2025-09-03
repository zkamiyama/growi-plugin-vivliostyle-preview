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

// --- color helpers (simple RGB/HEX -> HSL complement) ---
function parseToRgb(input: string): { r: number; g: number; b: number } | null {
  if (!input) return null;
  const hex = input.trim();
  const rgbm = hex.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbm) {
    return { r: Number(rgbm[1]), g: Number(rgbm[2]), b: Number(rgbm[3]) };
  }
  const hexm = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexm) {
    let h = hexm[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const intVal = parseInt(h, 16);
    return { r: (intVal >> 16) & 255, g: (intVal >> 8) & 255, b: intVal & 255 };
  }
  return null;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let h = 0; let s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  h /= 360; s /= 100; l /= 100;
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number; let g: number; let b: number;
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (x: number) => {
    const v = Math.round(x * 255).toString(16).padStart(2, '0');
    return v;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function computeComplement(color: string): { bg: string; fg: string } | null {
  const rgb = parseToRgb(color);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const compH = (hsl.h + 180) % 360;
  const compHex = hslToHex(compH, hsl.s, hsl.l);
  // 簡易輝度で前景色選択
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  const fg = luminance > 0.55 ? '#000' : '#fff';
  return { bg: compHex, fg };
}

export const ExternalToggle: React.FC = () => {
  const { isOpen, toggle } = useAppContext();
  const [wrapperEl, setWrapperEl] = React.useState<HTMLElement | null>(null);
  const [anchorClasses, setAnchorClasses] = React.useState<string>('');
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
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] wrapper created & inserted', { time: Date.now(), parent: anchor.parentElement.className, anchorText: normalizeLabel(anchor) });
      }
      // アンカーのクラスをコピーして同一スキームに揃える
      setAnchorClasses(anchor.className || '');
      // 補色計算: anchor 背景 or 文字色（背景が透過の場合）
      try {
        const cs = window.getComputedStyle(anchor);
        let baseColor = cs.backgroundColor;
        if (!baseColor || /rgba\(0, 0, 0, 0\)/.test(baseColor) || baseColor === 'transparent') {
          baseColor = cs.color;
        }
        const comp = computeComplement(baseColor);
        if (comp) {
          wrapper.style.setProperty('--vivlio-active-bg', comp.bg);
          wrapper.style.setProperty('--vivlio-active-fg', comp.fg);
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][ExternalToggle] complement color computed', { baseColor, comp });
        } else {
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][ExternalToggle] complement color skipped (parse failed)', { baseColor });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[VivlioDBG][ExternalToggle] complement compute error', e);
      }

      setWrapperEl(wrapper);
      resolvedRef.current = true;
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][ExternalToggle] attached to anchor', { anchorSel: anchor.className, text: normalizeLabel(anchor) });
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

  // ラベル溢れ検出用
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const [isOverflow, setIsOverflow] = React.useState(false);

  React.useEffect(() => {
    if (!btnRef.current) return;
    const el = btnRef.current;
    const overflow = el.scrollWidth > el.clientWidth;
    if (overflow !== isOverflow) setIsOverflow(overflow);
  }, [isOpen, wrapperEl]);

  if (!wrapperEl) return null;
  // アンカー基準クラスから active を除去し、状態に応じて付与
  const baseClasses = anchorClasses
    .split(/\s+/)
    .filter(c => c && c !== 'active')
    .join(' ');
  const finalClassName = `${baseClasses} vivlio-toggle-btn vivlio-complement${isOpen ? ' active' : ''}${isOverflow ? ' is-overflowing' : ''}`.trim();

  return createPortal(
    <button
      ref={btnRef}
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