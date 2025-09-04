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

export const ExternalToggle: React.FC = () => {
  const { isOpen, toggle } = useAppContext();
  const [wrapperEl, setWrapperEl] = React.useState<HTMLElement | null>(null);
  const [anchorClasses, setAnchorClasses] = React.useState<string>('');
  const [isEditing, setIsEditing] = React.useState(false);
  const resolvedRef = React.useRef(false);
  const primaryAnchorRef = React.useRef<HTMLElement | null>(null);
  const lastBaseColorRef = React.useRef<string | null>(null);

  // 編集画面判定: window.__MY_PLUGIN_STATE__.isEditPreview を参照
  React.useEffect(() => {
    const check = () => {
      setIsEditing(!!(window as any).__MY_PLUGIN_STATE__?.isEditPreview);
    };
    check();
    window.addEventListener('vivlio:preview-ready', check);
    window.addEventListener('vivlio:preview-mounted', check);
    // hashchange/popstate でも再評価
    window.addEventListener('hashchange', check);
    window.addEventListener('popstate', check);
    // 定期的な再評価（念のため）
    const interval = setInterval(check, 1000);
    return () => {
      window.removeEventListener('vivlio:preview-ready', check);
      window.removeEventListener('vivlio:preview-mounted', check);
      window.removeEventListener('hashchange', check);
      window.removeEventListener('popstate', check);
      clearInterval(interval);
    };
  }, []);

  React.useEffect(() => {
    const initialAnchor = findAnchorOnce();
    if (!initialAnchor) return;
    if (resolvedRef.current) return;
    if (!initialAnchor.parentElement) return;
    let wrapper = initialAnchor.parentElement.querySelector('.vivlio-inline-toggle') as HTMLElement | null;
    if (!wrapper) {
      wrapper = document.createElement('span');
      wrapper.className = 'vivlio-inline-toggle';
      wrapper.style.marginLeft = '6px';
      initialAnchor.parentElement.insertBefore(wrapper, initialAnchor.nextSibling);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][ExternalToggle] wrapper created & inserted', { time: Date.now(), parent: initialAnchor.parentElement.className, anchorText: normalizeLabel(initialAnchor) });
    }
    // リポジショニング + 色計算共通処理
    const isTransparent = (c: string) => !c || c === 'transparent' || /rgba\(\s*0+\s*,\s*0+\s*,\s*0?\.?0*\s*\)/i.test(c);
    function parseToRgb(input: string): { r: number; g: number; b: number } | null {
      const m = input.trim().match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (m) return { r: +m[1], g: +m[2], b: +m[3] };
      const hm = input.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (hm) {
        let h = hm[1]; if (h.length===3) h = h.split('').map(c=>c+c).join('');
        const iv = parseInt(h,16);
        return { r: (iv>>16)&255, g:(iv>>8)&255, b:iv&255 };
      }
      return null;
    }
    function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
      r/=255; g/=255; b/=255;
      const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max-min;
      let h=0, s=0, l=(max+min)/2;
      if (d!==0) {
        s = d/(1 - Math.abs(2*l-1));
        if (max===r) h = ((g-b)/d + (g<b?6:0))/6;
        else if (max===g) h = ((b-r)/d + 2)/6;
        else h = ((r-g)/d + 4)/6;
      }
      return { h: h*360, s: s*100, l: l*100 };
    }
    function hslToHex(h: number, s: number, l: number): string {
      h/=360; s/=100; l/=100;
      const hue2rgb=(p:number,q:number,t:number)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
      const q = l<0.5 ? l*(1+s) : l+s-l*s;
      const p = 2*l-q;
      const r2 = hue2rgb(p,q,h+1/3);
      const g2 = hue2rgb(p,q,h);
      const b2 = hue2rgb(p,q,h-1/3);
      const toHex=(x:number)=> Math.round(x*255).toString(16).padStart(2,'0');
      return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
    }
    function computeComplement(color: string): { compHex: string; fg: string } | null {
      const rgb = parseToRgb(color);
      if (!rgb) return null;
      const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
      const compHex = hslToHex((h + 180) % 360, 100, 50);
      const fg = '#000';
      return { compHex, fg };
    }
    const pickButtons = (parent: HTMLElement) => {
      const kids = Array.from(parent.children) as HTMLElement[];
      const view = kids.find(el => /\bview\b/i.test(normalizeLabel(el)) && el !== wrapper) || null;
      const edit = kids.find(el => /\bedit\b/i.test(normalizeLabel(el)) && el !== wrapper) || null;
      return { view, edit };
    };
    const isVisible = (el: HTMLElement | null): boolean => !!el && el.offsetParent !== null;
    const repositionAndRecolor = () => {
      const parent = wrapper!.parentElement;
      if (!parent) return;
      const { view, edit } = pickButtons(parent);
      const anchor = (isVisible(edit) ? edit : null) || (isVisible(view) ? view : null) || initialAnchor;
      const currentPosition = wrapper!.previousElementSibling;
      const needsReposition = anchor && currentPosition !== anchor;
      if (needsReposition) {
        const now = Date.now();
        const lastMoveKey = `${normalizeLabel(anchor)}`;
        const lastMoveTime = (repositionAndRecolor as any).lastMoveMap?.[lastMoveKey] || 0;
        if (now - lastMoveTime > 100) {
          parent.insertBefore(wrapper!, anchor.nextElementSibling);
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][ExternalToggle] reposition (cycle)', { anchor: normalizeLabel(anchor) });
          if (!(repositionAndRecolor as any).lastMoveMap) (repositionAndRecolor as any).lastMoveMap = {};
          (repositionAndRecolor as any).lastMoveMap[lastMoveKey] = now;
        }
      }
      if (anchor) setAnchorClasses(anchor.className);
      try {
        const cs = window.getComputedStyle(anchor || initialAnchor);
        let baseColor = cs.backgroundColor;
        if (isTransparent(baseColor)) baseColor = cs.borderColor;
        if (isTransparent(baseColor)) baseColor = cs.color;
        if (baseColor && baseColor !== lastBaseColorRef.current) {
          const res = computeComplement(baseColor);
          if (res) {
            wrapper!.style.setProperty('--vivlio-comp-color', res.compHex);
            wrapper!.style.setProperty('--vivlio-comp-fg', res.fg);
            lastBaseColorRef.current = baseColor;
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] color recomputed', { baseColor, res });
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[VivlioDBG][ExternalToggle] color compute error', e);
      }
    };
    repositionAndRecolor();
    primaryAnchorRef.current = initialAnchor;
    setWrapperEl(wrapper);
    resolvedRef.current = true;
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][ExternalToggle] attached to anchor', { anchorSel: initialAnchor.className, text: normalizeLabel(initialAnchor) });
    if (wrapper.parentElement) {
      const parent = wrapper.parentElement;
      let rafId: number | null = null;
      const schedule = () => {
        if (rafId != null) return;
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          repositionAndRecolor();
        });
      };
      const reorderObserver = new MutationObserver(schedule);
      reorderObserver.observe(parent, { childList: true, subtree: true, attributes: true, attributeFilter: ['style','class'] });
    }
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


  if (!wrapperEl || !isEditing) return null;
  const baseClasses = anchorClasses
    .split(/\s+/)
    .filter(c => c && c !== 'active')
    .join(' ');
  const finalClassName = `${baseClasses} vivlio-toggle-btn vivlio-comp${isOpen ? ' active' : ''}${isOverflow ? ' is-overflowing' : ''}`.trim();

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