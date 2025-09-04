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
  const observerRef = React.useRef<MutationObserver | null>(null);
  const reorderObserverRef = React.useRef<MutationObserver | null>(null);
  const resolvedRef = React.useRef(false);
  const primaryAnchorRef = React.useRef<HTMLElement | null>(null);
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
        initialAnchor.parentElement.insertBefore(wrapper, initialAnchor.nextSibling);
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] wrapper created & inserted', { time: Date.now(), parent: initialAnchor.parentElement.className, anchorText: normalizeLabel(initialAnchor) });
      }
      // リポジショニング + 色計算共通処理
      const isTransparent = (c: string) => !c || c === 'transparent' || /rgba\(\s*0+\s*,\s*0+\s*,\s*0+\s*,\s*0?\.?0*\s*\)/i.test(c);
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
    }


    // 編集モード検出: ハッシュ/パス名/プレビューコンテナ存在いずれかで判定
    const PREVIEW_CONTAINER_SELECTORS = [
      '.page-editor-preview-container',
      '.page-editor-preview-body',
      '.grw-editor-preview',
      '[data-testid="page-editor-preview"]'
    ];
    const findPreviewContainer = (): HTMLElement | null => {
      for (const sel of PREVIEW_CONTAINER_SELECTORS) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) return el;
      }
      return null;
    };
    const hasEditHash = () => {
      try {
        if (typeof location !== 'undefined') {
          if ((location.hash || '').indexOf('#edit') !== -1) return true;
          if (String(location.pathname || '').indexOf('/edit') !== -1) return true;
        }
      } catch (e) {}
      if (findPreviewContainer()) return true;
      return false;
    };

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
      console.debug('[VivlioDBG][ExternalToggle] detached due to hash change (no #edit)');
    };

    const checkHashAndAttach = () => {
      if (hasEditHash()) {
        if (!resolvedRef.current) {
          const immediate = findAnchorOnce();
          if (immediate) {
            attach(immediate);
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] attached on #edit');
          } else {
            // start polling/observer to wait for anchor to appear
            try { startPollingAndObserver(); } catch (e) { /* ignore if not ready */ }
          }
        }
      } else {
        detachIfAttached();
        try { stopPollingAndObserver(); } catch (e) { /* ignore */ }
      }
    };

    // 初回チェックと hash/popstate 監視
    checkHashAndAttach();
    window.addEventListener('hashchange', checkHashAndAttach);
    window.addEventListener('popstate', checkHashAndAttach);

    // SPA が history.pushState / replaceState を用いる場合に遷移を拾えないため
    // これらをラップしてカスタムイベントを発行し、遷移検知を強化する
    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    let wrappedHistory = false;
    try {
      (history as any).pushState = function (...args: any[]) {
        const ret = originalPush.apply(this, args as any);
        window.dispatchEvent(new Event('pushstate'));
        window.dispatchEvent(new Event('locationchange'));
        return ret;
      };
      (history as any).replaceState = function (...args: any[]) {
        const ret = originalReplace.apply(this, args as any);
        window.dispatchEvent(new Event('replacestate'));
        window.dispatchEvent(new Event('locationchange'));
        return ret;
      };
      window.addEventListener('pushstate', checkHashAndAttach);
      window.addEventListener('replacestate', checkHashAndAttach);
      window.addEventListener('locationchange', checkHashAndAttach);
      wrappedHistory = true;
    } catch (e) {
      // 環境によっては history の書き換えができないことがあるため安全に無視
    }

    // SPA や動的レンダリングで hash/popstate が発生しない遷移を検知するための DOM 監視
    // DOM の変化があれば軽く debounce して判定を再実行する。
    let navObserver: MutationObserver | null = null;
    let navRaf: number | null = null;
    const scheduleNavCheck = () => {
      if (navRaf != null) return;
      navRaf = window.requestAnimationFrame(() => {
        navRaf = null;
        try { checkHashAndAttach(); } catch (e) { /* ignore */ }
      });
    };
    try {
      navObserver = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === 'childList' && (m.addedNodes?.length || m.removedNodes?.length)) { scheduleNavCheck(); break; }
          if (m.type === 'attributes') { scheduleNavCheck(); break; }
        }
      });
      navObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style'] });
    } catch (e) {
      // ignore in restricted environments
    }

    // ポーリング/observer を管理するヘルパ
    let pollTimer: number | null = null;
    let pollCount = 0;
    const maxPoll = 3;
    const pollInterval = 400;

    const startPollingAndObserver = () => {
      // 既に開始済みなら何もしない
      if (pollTimer != null || observerRef.current) return;
      pollCount = 0;
      pollTimer = window.setInterval(() => {
        if (resolvedRef.current) { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } return; }
        const found = findAnchorOnce();
        if (found) {
          attach(found);
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          return;
        }
        pollCount += 1;
        if (pollCount >= maxPoll) {
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        }
      }, pollInterval);

      const obs = new MutationObserver((mutations) => {
        if (resolvedRef.current) return;
        for (const m of mutations) {
          if (!m.addedNodes?.length) continue;
          for (const node of Array.from(m.addedNodes)) {
            if (!(node instanceof HTMLElement)) continue;
            const direct = findAnchorOnce();
            if (direct) {
              attach(direct);
              return;
            }
          }
        }
      });
      observerRef.current = obs;
      obs.observe(document.body, { subtree: true, childList: true });
    };

    const stopPollingAndObserver = () => {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (observerRef.current) { try { observerRef.current.disconnect(); } catch {} observerRef.current = null; }
    };

    // checkHashAndAttach 内で attach された場合にポーリング/observer を止める
    // ただしハッシュがある状態でまだ attach されていない可能性があるため、ハッシュ有効時は開始
    if (hasEditHash()) startPollingAndObserver();

    return () => {
      window.removeEventListener('hashchange', checkHashAndAttach);
      window.removeEventListener('popstate', checkHashAndAttach);
  try { if (navObserver) { navObserver.disconnect(); navObserver = null; } } catch {}
  try { if (navRaf != null) { cancelAnimationFrame(navRaf); navRaf = null; } } catch {}
      // restore history wrappers
      try {
        if (wrappedHistory) {
          (history as any).pushState = originalPush;
          (history as any).replaceState = originalReplace;
          window.removeEventListener('pushstate', checkHashAndAttach);
          window.removeEventListener('replacestate', checkHashAndAttach);
          window.removeEventListener('locationchange', checkHashAndAttach);
        }
      } catch (e) {}
      // ensure full cleanup
      detachIfAttached();
      stopPollingAndObserver();
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