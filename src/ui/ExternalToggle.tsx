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
  const observerRef = React.useRef<MutationObserver | null>(null);
  const reorderObserverRef = React.useRef<MutationObserver | null>(null);
  const resolvedRef = React.useRef(false);
  const primaryAnchorRef = React.useRef<HTMLElement | null>(null);
  const lastBaseColorRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    // 即時チェック & MutationObserver による検知（ポーリングを廃止）
    const update = () => {
      try {
        const rootEl = document.querySelector('.layout-root');
        const editing = rootEl ? rootEl.classList.contains('editing') : false;
        setIsEditing(editing);
      } catch (e) {
        // ignore
      }
    };

    update(); // マウント直後に即時反映

    let layoutObserver: MutationObserver | null = null;
    const observeLayoutRoot = (el: Element | null) => {
      try {
        if (layoutObserver) { layoutObserver.disconnect(); layoutObserver = null; }
        if (!el) return;
        layoutObserver = new MutationObserver(() => update());
        layoutObserver.observe(el, { attributes: true, attributeFilter: ['class'] });
      } catch (e) {
        if (layoutObserver) { layoutObserver.disconnect(); layoutObserver = null; }
      }
    };

    // body 上で .layout-root の追加や属性変化を監視するオブザーバ（MutationObserver のみで対応）
    let bodyObserver: MutationObserver | null = null;
    try {
      bodyObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList' && (m.addedNodes?.length || m.removedNodes?.length)) {
            const root = document.querySelector('.layout-root');
            if (root) {
              update();
              observeLayoutRoot(root);
              return; // まとまって処理されれば十分
            }
          }
          if (m.type === 'attributes') {
            // attributes の変化が body 内で発生した場合も再評価
            update();
          }
        }
      });
      if (document.body) bodyObserver.observe(document.body, { childList: true, subtree: true, attributes: true });
    } catch (e) {
      if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; }
    }

    // 初期存在する場合は直接監視を開始
    try { observeLayoutRoot(document.querySelector('.layout-root')); } catch {}

    return () => {
      try { if (bodyObserver) { bodyObserver.disconnect(); bodyObserver = null; } } catch {}
      try { if (layoutObserver) { layoutObserver.disconnect(); layoutObserver = null; } } catch {}
    };
  }, []);

  React.useEffect(() => {
    const initialAnchor = findAnchorOnce();
    if (!initialAnchor) return; // アンカーが見つからない場合は何もしない

    if (resolvedRef.current && !isEditing) return; // 編集モード変更時のみ再実行
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
    // --- HSL補色計算: Hのみ+180°, S/L保持 ---
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
    // HSL: 補色 (H+180), S=1, L=50%
    const compHex = hslToHex((h + 180) % 360, 100, 50);
      // 明度が高いので前景色は黒
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
      
      // より厳密な再配置判定: anchor が存在し、かつ wrapper が anchor の直後にない場合のみ移動
      const currentPosition = wrapper!.previousElementSibling;
      const needsReposition = anchor && currentPosition !== anchor;
      
      if (needsReposition) {
        // 無限ループ防止: 同じ anchor への移動を短時間で繰り返さない
        const now = Date.now();
        const lastMoveKey = `${normalizeLabel(anchor)}`;
        const lastMoveTime = (repositionAndRecolor as any).lastMoveMap?.[lastMoveKey] || 0;
        
        if (now - lastMoveTime > 100) { // 100ms のデバウンス
          parent.insertBefore(wrapper!, anchor.nextElementSibling);
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][ExternalToggle] reposition (cycle)', { anchor: normalizeLabel(anchor) });
          
          // 移動時刻を記録
          if (!(repositionAndRecolor as any).lastMoveMap) (repositionAndRecolor as any).lastMoveMap = {};
          (repositionAndRecolor as any).lastMoveMap[lastMoveKey] = now;
        }
      }
      
      // クラス継承 (表示基準 anchor)
      if (anchor) setAnchorClasses(anchor.className);
      // 色計算
      try {
        const cs = window.getComputedStyle(anchor || initialAnchor);
        // 優先順: backgroundColor → borderColor → color
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

    // 初回計算
    repositionAndRecolor();
    primaryAnchorRef.current = initialAnchor;
    setWrapperEl(wrapper);
    resolvedRef.current = true;
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][ExternalToggle] attached to anchor', { anchorSel: initialAnchor.className, text: normalizeLabel(initialAnchor) });

    // 親の子要素 + 属性変化を監視 (表示/非表示, class変更)
    if (wrapper.parentElement && !reorderObserverRef.current) {
      const parent = wrapper.parentElement;
      let rafId: number | null = null;
      const schedule = () => {
        if (rafId != null) return;
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          repositionAndRecolor();
        });
      };
      reorderObserverRef.current = new MutationObserver(schedule);
      reorderObserverRef.current.observe(parent, { childList: true, subtree: true, attributes: true, attributeFilter: ['style','class'] });
    }

    // 編集モード検出: isEditing を使用
    const detachIfAttached = () => {
      if (!resolvedRef.current) return;
      // remove wrapper element if present
      try {
        const wrapper = primaryAnchorRef.current?.parentElement?.querySelector('.vivlio-inline-toggle') as HTMLElement | null;
        if (wrapper && wrapper.parentElement) wrapper.remove();
      } catch (e) {
        // ignore
      }
      // disconnect observers
      try { if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; } } catch {}
      try { if (reorderObserverRef.current) { reorderObserverRef.current.disconnect(); reorderObserverRef.current = null; } } catch {}
      resolvedRef.current = false;
      primaryAnchorRef.current = null;
      lastBaseColorRef.current = null;
      setWrapperEl(null);
      setAnchorClasses('');
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][ExternalToggle] detached due to not editing');
    };

    const checkAndAttach = () => {
      if (isEditing) {
        if (!resolvedRef.current) {
          const immediate = findAnchorOnce();
          if (immediate) {
            // attach は既に実行済みなので、ここでは何もしない
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] attached on editing');
          }
        }
      } else {
        detachIfAttached();
      }
    };

    // 初回チェック
    checkAndAttach();

    // preview の生成完了を待つ通知が来たら再チェック
    const onPreviewReady = () => { try { checkAndAttach(); } catch {} };
    window.addEventListener('vivlio:preview-ready', onPreviewReady);
    window.addEventListener('vivlio:preview-mounted', onPreviewReady);

    return () => {
      window.removeEventListener('vivlio:preview-ready', onPreviewReady);
      window.removeEventListener('vivlio:preview-mounted', onPreviewReady);
      // ensure full cleanup
      detachIfAttached();
    };
  }, [isEditing]);

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