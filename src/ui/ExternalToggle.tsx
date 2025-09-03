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
      // View ボタンと同じ外観にしたいので、兄弟要素から "view" を含むラベルを優先してクラス複製
      let viewBtn: HTMLElement | undefined;
      try {
        const siblings = Array.from(anchor.parentElement.children) as HTMLElement[];
        viewBtn = siblings.find(el => /\bview\b/i.test(normalizeLabel(el))) || undefined;
      } catch { /* ignore */ }
      setAnchorClasses(viewBtn?.className || anchor.className || '');
      // ---- 補色+彩度1.5倍計算 ----
      const computeVividComplement = (baseColor: string): { compHex: string; fg: string } | null => {
        const rgbMatch = baseColor.match(/^rgba?\((\d+),(\d+),(\d+)/i);
        const hexMatch = baseColor.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        let r: number | null = null; let g: number | null = null; let b: number | null = null;
        if (rgbMatch) { r = +rgbMatch[1]; g = +rgbMatch[2]; b = +rgbMatch[3]; }
        else if (hexMatch) { let h = hexMatch[1]; if (h.length === 3) h = h.split('').map(c=>c+c).join(''); const iv = parseInt(h,16); r=(iv>>16)&255; g=(iv>>8)&255; b=iv&255; }
        if (r==null||g==null||b==null) return null;
        let R=r/255, G=g/255, B=b/255; const max=Math.max(R,G,B), min=Math.min(R,G,B); let h=0, s=0; const l=(max+min)/2; const d=max-min;
        if (d!==0) { s = l>0.5 ? d/(2-max-min) : d/(max+min); if (max===R) h=(G-B)/d+(G<B?6:0); else if (max===G) h=(B-R)/d+2; else h=(R-G)/d+4; h/=6; }
        h = (h*360+180)%360; // complement hue
        s = Math.min(1, s * 1.5); // 彩度1.5倍 (上限1.0)
        const hue2rgb=(p:number,q:number,t:number)=>{ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
        const q=l<0.5?l*(1+s):l+s-l*s; const p=2*l-q;
        const r2=Math.round(hue2rgb(p,q,(h/360)+1/3)*255); const g2=Math.round(hue2rgb(p,q,(h/360))*255); const b2=Math.round(hue2rgb(p,q,(h/360)-1/3)*255);
        const toHex=(x:number)=>x.toString(16).padStart(2,'0');
        const compHex=`#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
        const luminance=(0.2126*r2+0.7152*g2+0.0722*b2)/255; const fg=luminance>0.55?'#000':'#fff';
        return { compHex, fg }; };
      try {
        const cs = window.getComputedStyle(viewBtn || anchor);
        const isTransparent = (c: string) => !c || c === 'transparent' || /rgba\(\s*0+\s*,\s*0+\s*,\s*0+\s*,\s*0?\.?0*\s*\)/i.test(c);
        let baseColor = cs.borderColor;
        if (isTransparent(baseColor)) baseColor = cs.backgroundColor;
        if (isTransparent(baseColor)) baseColor = cs.color;
        if (baseColor && baseColor !== lastBaseColorRef.current) {
          const res = computeVividComplement(baseColor);
          if (res) {
            wrapper.style.setProperty('--vivlio-comp-color', res.compHex);
            wrapper.style.setProperty('--vivlio-comp-fg', res.fg);
            lastBaseColorRef.current = baseColor;
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] vivid complement', { baseColor, res });
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[VivlioDBG][ExternalToggle] vivid complement error', err);
      }
      primaryAnchorRef.current = anchor;
      setWrapperEl(wrapper);
      resolvedRef.current = true;
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][ExternalToggle] attached to anchor', { anchorSel: anchor.className, text: normalizeLabel(anchor) });

      // 親の子要素変化を監視して再配置 & 色再計算
      if (wrapper.parentElement && !reorderObserverRef.current) {
        const parent = wrapper.parentElement;
        reorderObserverRef.current = new MutationObserver(() => {
          if (!wrapper || !parent) return;
          const children = Array.from(parent.children) as HTMLElement[];
          // view / edit ラベルを持つ最後の要素を探す（wrapper自身は除外）
          const target = [...children].reverse().find(el => el !== wrapper && /\b(edit|view)\b/i.test(normalizeLabel(el)));
          if (target && target.nextSibling !== wrapper) {
            parent.insertBefore(wrapper, target.nextSibling);
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] reposition wrapper after resize', { target: normalizeLabel(target) });
          }
          // anchor 要素が差し替わった場合、色再計算
          const newAnchor = children.find(el => el !== wrapper && /\bedit\b/i.test(normalizeLabel(el)));
          if (newAnchor && newAnchor !== primaryAnchorRef.current) {
            primaryAnchorRef.current = newAnchor;
            try {
              const cs2 = window.getComputedStyle(newAnchor);
              let baseColor2 = cs2.borderColor;
              const isTr = (c: string) => !c || c === 'transparent' || /rgba\(\s*0+\s*,\s*0+\s*,\s*0+\s*,\s*0?\.?0*\s*\)/i.test(c);
              if (isTr(baseColor2)) baseColor2 = cs2.backgroundColor;
              if (isTr(baseColor2)) baseColor2 = cs2.color;
              if (baseColor2 && baseColor2 !== lastBaseColorRef.current) {
                const res = computeVividComplement(baseColor2);
                if (res) {
                  wrapper.style.setProperty('--vivlio-comp-color', res.compHex);
                  wrapper.style.setProperty('--vivlio-comp-fg', res.fg);
                  lastBaseColorRef.current = baseColor2;
                  // eslint-disable-next-line no-console
                  console.debug('[VivlioDBG][ExternalToggle] vivid complement recalculated', { baseColor2, res });
                }
              }
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[VivlioDBG][ExternalToggle] recolor error', e);
            }
          }
        });
        reorderObserverRef.current.observe(parent, { childList: true });
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
      if (reorderObserverRef.current) {
        reorderObserverRef.current.disconnect();
        reorderObserverRef.current = null;
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