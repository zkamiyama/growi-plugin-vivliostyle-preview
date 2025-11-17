import React from 'react';

export type CreateElementFn = () => HTMLElement;

export interface MenuInjectorProps {
  anchorSelector?: string;
  matchTexts?: string[];
  createElement: CreateElementFn;
  processedAttr?: string;
}

const DEFAULT_PROCESSED = 'data-vivlio-build-added';

function parseRgbFromString(c: string): [number,number,number] | null {
  if (!c) return null;
  const m = c.match(/rgba?\s*\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10)];
  const mh = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (mh) {
    let h = mh[1];
    if (h.length === 3) h = h.split('').map(s=>s+s).join('');
    return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
  }
  return null;
}

const MenuInjector2: React.FC<MenuInjectorProps> = ({ anchorSelector, matchTexts, createElement, processedAttr }) => {
  const ATTR = processedAttr || DEFAULT_PROCESSED;

  const applyColor = (el: HTMLElement, context?: Element | null) => {
    try {
      const src = context || document.querySelector('.vivlio-inline-toggle');
      if (!src) return;
      const cs = window.getComputedStyle(src as Element);
      const bg = (cs.backgroundImage || '').trim();
      const color = (cs.getPropertyValue('--vivlio-comp-color') || cs.color || '').trim();
      if (bg && /gradient/i.test(bg)) {
        el.style.setProperty('--vivlio-comp-bg', bg);
        el.classList.add('vivlio-glow-gradient');
        return;
      }
      const rgb = parseRgbFromString(color || '');
      if (rgb) {
        const [r,g,b] = rgb;
        el.style.setProperty('--vivlio-comp-color', `rgb(${r}, ${g}, ${b})`);
        el.style.setProperty('--vivlio-comp-glow-1', `rgba(${r}, ${g}, ${b}, 0.85)`);
        el.style.setProperty('--vivlio-comp-glow-2', `rgba(${r}, ${g}, ${b}, 0.55)`);
        el.style.setProperty('--vivlio-comp-glow-3', `rgba(${r}, ${g}, ${b}, 0.28)`);
        el.style.setProperty('--vivlio-comp-bg', `linear-gradient(90deg, rgb(${r}, ${g}, ${b}) 0%, rgba(255,255,255,0.9) 100%)`);
        el.classList.add('vivlio-glow-gradient');
      }
    } catch (_) { /* ignore */ }
  };

  const injectIntoMenu = (menu: HTMLElement, anchorEl?: HTMLElement | null) => {
    if (menu.getAttribute(ATTR) === '1') return;
    const exists = Array.from(menu.querySelectorAll('button')).some(b => (b.textContent || '').includes('Build PDF'));
    if (exists) { menu.setAttribute(ATTR, '1'); return; }
    const el = createElement();
    applyColor(el, anchorEl || menu);
    if (anchorEl && anchorEl.nextSibling && anchorEl.parentElement) anchorEl.parentElement.insertBefore(el, anchorEl.nextSibling);
    else menu.appendChild(el);
    menu.setAttribute(ATTR, '1');
  };

  const scan = () => {
    if (anchorSelector) {
      const anchor = document.querySelector(anchorSelector) as HTMLElement | null;
      if (!anchor) return;
      const menu = anchor.closest('.d-print-none.dropdown-menu') as HTMLElement | null || (anchor.parentElement && anchor.parentElement.closest('.d-print-none.dropdown-menu') as HTMLElement | null);
      if (menu) injectIntoMenu(menu, anchor);
      return;
    }
    const menus = document.querySelectorAll('.d-print-none.dropdown-menu.show');
    menus.forEach(m => {
      const menu = m as HTMLElement;
      const items = Array.from(menu.querySelectorAll('button, a, [role="menuitem"]')) as HTMLElement[];
      let idx = -1;
      if (matchTexts) {
        for (let i=0;i<items.length;i++) for (const mt of matchTexts) if ((items[i].textContent||'').includes(mt)) { idx = i; break; }
      }
      if (idx >= 0) injectIntoMenu(menu, items[idx]);
    });
  };

  React.useEffect(() => {
    scan();
    const mo = new MutationObserver(scan);
    try { mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); } catch(_){}
    const onClick = (ev: Event) => { const t = ev.target as Element | null; if (!t) return; const btn = t.closest('[data-testid="open-page-item-control-btn"], .btn-page-item-control, .grw-page-item-control'); if (btn) setTimeout(scan, 50); };
    document.addEventListener('click', onClick, true);
    return () => { try { mo.disconnect(); } catch{} document.removeEventListener('click', onClick, true); };
  }, []);

  return null;
};

export default MenuInjector2;
