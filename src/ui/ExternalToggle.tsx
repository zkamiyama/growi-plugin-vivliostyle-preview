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
  const [anchorMetrics, setAnchorMetrics] = React.useState<Record<string, string> | null>(null);
  const resolvedRef = React.useRef(false);
  const lastBaseColorRef = React.useRef<string | null>(null);
  const anchorElRef = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    function attach(initialAnchor: HTMLElement) {
      if (resolvedRef.current) return; // 冪等
      if (!initialAnchor.parentElement) return;
      let wrapper = initialAnchor.parentElement.querySelector('.vivlio-inline-toggle') as HTMLElement | null;
      if (!wrapper) {
        wrapper = document.createElement('span');
        wrapper.className = 'vivlio-inline-toggle';
        // put small gap between this button and the following anchor
        wrapper.style.marginRight = '6px';
        // ensure wrapper participates inline and aligns children
        wrapper.style.display = 'inline-flex';
        wrapper.style.alignItems = 'center';
        initialAnchor.parentElement.insertBefore(wrapper, initialAnchor);
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] wrapper created & inserted', { time: Date.now(), parent: initialAnchor.parentElement.className, anchorText: normalizeLabel(initialAnchor) });
      }
      // capture anchor element for metrics
      anchorElRef.current = initialAnchor;
      try {
        const aCs = window.getComputedStyle(initialAnchor);
        setAnchorMetrics({
          height: aCs.height || '',
          paddingTop: aCs.paddingTop || '',
          paddingBottom: aCs.paddingBottom || '',
          paddingLeft: aCs.paddingLeft || '',
          paddingRight: aCs.paddingRight || '',
          fontSize: aCs.fontSize || '',
          lineHeight: aCs.lineHeight || '',
          borderRadius: aCs.borderRadius || '',
          minWidth: aCs.minWidth || '',
        });
      } catch (e) {
        // ignore
      }
      // リポジショニング + 色適用（簡素化）
      // アンカーに適用されている色をそのまま引用する。
      const isTransparent = (c: string) => !c || c === 'transparent' || /rgba\(\s*0+\s*,\s*0+\s*,\s*0?\.?0*\s*\)/i.test(c);

      function findEffectiveColor(elem: Element | null): string | null {
        if (!elem) return null;
        const isTransparentLocal = (c: string) => !c || c === 'transparent' || /rgba\(\s*0+\s*,\s*0+\s*,\s*0?\.?0*\s*\)/i.test(c);
        // 1) CSS custom properties on the element
        try {
          const csVars = window.getComputedStyle(elem as Element);
          const varCandidates = ['--vivlio-comp-color', '--accent-color', '--primary-color', '--color'];
          for (const v of varCandidates) {
            const val = csVars.getPropertyValue(v).trim();
            if (val) return val;
          }
        } catch (e) { /* ignore */ }
        // 2) walk up ancestors to find a non-transparent computed color
        let node: Element | null = elem as Element;
        for (let i = 0; node && i < 8; i++, node = node.parentElement) {
          try {
            const cs = window.getComputedStyle(node);
            const props = [cs.backgroundColor, cs.borderColor, cs.color];
            for (const p of props) {
              if (!isTransparentLocal(p)) return p;
            }
          } catch (e) { /* ignore */ }
        }
        // 3) as a last resort, scan descendants for an explicit color
        try {
          const children = elem.querySelectorAll('*');
          for (const ch of Array.from(children)) {
            try {
              const cs = window.getComputedStyle(ch as Element);
              const props = [cs.backgroundColor, cs.borderColor, cs.color];
              for (const p of props) {
                if (!isTransparentLocal(p)) return p;
              }
            } catch (e) { /* ignore */ }
          }
        } catch (e) { /* ignore */ }
        return null;
      }

      function repositionAndRecolor() {
        try {
          const effective = findEffectiveColor(initialAnchor);
          if (effective && effective !== lastBaseColorRef.current) {
            try {
              wrapper!.style.setProperty('--vivlio-comp-color', effective);
              const btn = wrapper!.querySelector('button') as HTMLElement | null;
              if (btn) btn.style.setProperty('--vivlio-comp-color', effective);
            } catch (e) { /* ignore */ }
            lastBaseColorRef.current = effective;
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] applied effective color', { effective });
          } else {
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][ExternalToggle] no effective color found', { effective });
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[VivlioDBG][ExternalToggle] error applying effective color', e);
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

  // Force important inline styles on the real button element in case external CSS uses !important
  React.useEffect(() => {
    if (!wrapperEl) return;
    try {
      const btn = wrapperEl.querySelector('button.vivlio-toggle-btn') as HTMLElement | null;
      if (!btn) return;
      btn.style.setProperty('background', 'linear-gradient(135deg, #1a63b8 0%, #15549a 45%, #d05232 100%)', 'important');
      btn.style.setProperty('color', '#ffffff', 'important');
      btn.style.setProperty('box-shadow', '0 4px 0 rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)', 'important');
      btn.style.setProperty('border', 'none', 'important');
      btn.style.setProperty('border-radius', '6px', 'important');
      btn.style.setProperty('padding', '6px 10px', 'important');
      btn.style.setProperty('font-weight', '600', 'important');
      // apply measured metrics from anchor when available to match size/spacing
      if (anchorMetrics) {
        try {
          if (anchorMetrics.height) btn.style.setProperty('height', anchorMetrics.height, 'important');
          if (anchorMetrics.fontSize) btn.style.setProperty('font-size', anchorMetrics.fontSize, 'important');
          // avoid using anchor line-height directly; keep normal to center text inside inline-flex
          btn.style.setProperty('line-height', 'normal', 'important');
          // use top/bottom + left/right padding if available
          const pt = anchorMetrics.paddingTop || '6px';
          const pb = anchorMetrics.paddingBottom || '6px';
          const pl = anchorMetrics.paddingLeft || '10px';
          const pr = anchorMetrics.paddingRight || '10px';
          btn.style.setProperty('padding', `${pt} ${pr}`, 'important');
          // border-radius: if anchor has 0px, fallback to 6px for rounded look
          const br = (anchorMetrics.borderRadius && anchorMetrics.borderRadius !== '0px') ? anchorMetrics.borderRadius : '6px';
          btn.style.setProperty('border-radius', br, 'important');
          if (anchorMetrics.minWidth) btn.style.setProperty('min-width', anchorMetrics.minWidth, 'important');
        } catch (e) { /* ignore */ }
      }
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][ExternalToggle] applied important inline styles to button');
    } catch (e) {
      // ignore
    }
  }, [wrapperEl]);

  if (!wrapperEl) return null;
  // アンカー基準クラスから active を除去し、状態に応じて付与
  const baseClasses = anchorClasses
    .split(/\s+/)
    .filter(c => c && c !== 'active')
    .join(' ');
  const finalClassName = `${baseClasses} vivlio-toggle-btn vivlio-comp${isOpen ? ' active' : ''}`.trim();
  // inline style: 立体的なグラデーション（提供画像のブルー→オレンジ系）と白文字を強制
  const buttonStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #1a63b8 0%, #15549a 45%, #d05232 100%)',
    color: '#ffffff',
    border: 'none',
  padding: '6px 10px',
  borderRadius: '6px',
    boxShadow: '0 4px 0 rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)',
    cursor: 'pointer',
    fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 'normal',
  verticalAlign: 'middle',
    // ensure CSS custom props don't override visible color
    WebkitAppearance: 'none',
  };

  return createPortal(
    <button
      type="button"
      className={finalClassName}
      style={buttonStyle}
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