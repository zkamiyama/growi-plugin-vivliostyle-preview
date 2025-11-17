import React from 'react';

export type CreateElementFn = () => HTMLElement;

export interface MenuInjectorProps {
  /** If provided, we'll insert after the element matched by this selector. */
  anchorSelector?: string;
  /** Fallback: match menu by containing text snippets (in order). */
  matchTexts?: string[];
  createElement: CreateElementFn;
  processedAttr?: string;
}

const DEFAULT_PROCESSED = 'data-vivlio-build-added';

const MenuInjector: React.FC<MenuInjectorProps> = ({ anchorSelector, matchTexts, createElement, processedAttr }) => {
  const ATTR = processedAttr || DEFAULT_PROCESSED;

  const scanAndInject = React.useCallback(() => {
    try {
      if (anchorSelector) {
        const anchor = document.querySelector(anchorSelector) as HTMLElement | null;
        // if anchor not found, fall back to scanning all menus below (do not return)
        if (anchor) {
          // Ensure anchor is not inside sidebar-nav
          if (anchor.closest('.grw-sidebar-nav, .sidebar, [class*="SidebarNav"]')) {
            console.debug('[VivlioDBG][MenuInjector] Anchor found but inside sidebar-nav, skipping');
            // Fall through to menu scanning
          } else {
            const menu = anchor.closest('.d-print-none.dropdown-menu') as HTMLElement | null || (anchor.parentElement && anchor.parentElement.closest('.d-print-none.dropdown-menu') as HTMLElement | null);
            // If menu found and not processed, insert after the anchor element (the anchor may wrap the button)
            if (menu && menu.getAttribute(ATTR) !== '1') {
              // avoid double-insert
              if (Array.from(menu.querySelectorAll('button')).some(b => (b.textContent || '').includes('Build PDF'))) {
                menu.setAttribute(ATTR, '1');
                return;
              }
              const el = createElement();
              // try to inherit vivlio color from nearby vivlio-inline-toggle or anchor
              try {
                const src = anchor.closest('.vivlio-inline-toggle') || anchor.querySelector('.vivlio-inline-toggle') || document.querySelector('.vivlio-inline-toggle');
                let color = null;
                if (src) color = (window.getComputedStyle(src as Element).getPropertyValue('--vivlio-comp-color') || window.getComputedStyle(src as Element).color || '').trim();
                if (!color) color = (window.getComputedStyle(anchor).getPropertyValue('--vivlio-comp-color') || window.getComputedStyle(anchor).color || '').trim();
                // ignore transparent/none
                if (color && !/^(transparent|none|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(,\s*0\s*)?\))$/i.test(color)) {
                  const parseRgb = (c: string) => {
                    // handle rgb/rgba
                    const m = c.match(/rgba?\s*\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
                    if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
                    // hex
                    const mh = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
                    if (mh) {
                      let h = mh[1];
                      if (h.length === 3) h = h.split('').map(s => s + s).join('');
                      return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
                    }
                    return null;
                  };
                  const rgb = parseRgb(color) || null;
                  if (rgb) {
                    const [r,g,b] = rgb;
                    el.style.setProperty('--vivlio-comp-color', `rgb(${r}, ${g}, ${b})`);
                    el.style.setProperty('--vivlio-comp-glow-1', `rgba(${r}, ${g}, ${b}, 0.85)`);
                    el.style.setProperty('--vivlio-comp-glow-2', `rgba(${r}, ${g}, ${b}, 0.55)`);
                    el.style.setProperty('--vivlio-comp-glow-3', `rgba(${r}, ${g}, ${b}, 0.28)`);
                  } else {
                    // fallback: set raw value
                    el.style.setProperty('--vivlio-comp-color', color);
                  }
                }
              } catch (e) { /* ignore */ }
              // Prefer to insert immediately after the actual menu item element.
              // The anchor may be a wrapper (e.g. <span id="bulkExportDropdownItem"><button>...</button></span>).
              // Try to find the inner actionable element (button/a/[role="menuitem"]) and insert after it.
              let target: Element | null = null;
              try {
                if (anchor.matches && (anchor.matches('button, a, [role="menuitem"]'))) target = anchor;
              } catch (e) { /* ignore */ }
              if (!target) target = anchor.querySelector && (anchor.querySelector('button, a, [role="menuitem"]') as Element | null);
              if (!target) target = anchor; // fallback to anchor itself
              if (target && target.parentElement) {
                const parent = target.parentElement;
                parent.insertBefore(el, target.nextSibling);
              } else if (anchor.parentElement) {
                // ultimate fallback: append to anchor's parent
                anchor.parentElement.appendChild(el);
              }
              menu.setAttribute(ATTR, '1');
              return;
            }
          }
        }
        // if anchor not present, continue to fallback scanning of all shown menus
      }

      // Fallback: scan menus for text matches
      // Only look for menus that are actually dropdown menus (not sidebar-nav or other containers)
      const menus = Array.from(document.querySelectorAll('.d-print-none.dropdown-menu.show'))
        .filter(menu => {
          // Exclude sidebar-nav and other non-dropdown menus
          if (menu.closest('.grw-sidebar-nav, .sidebar, [class*="SidebarNav"]')) {
            return false;
          }
          // Must have actual menu items
          const hasMenuItems = menu.querySelector('button, a, [role="menuitem"]') !== null;
          return hasMenuItems;
        });
      
      menus.forEach(menu => {
        const m = menu as HTMLElement;
        if (m.getAttribute(ATTR) === '1') return;
        const items = Array.from(m.querySelectorAll('button, a, [role="menuitem"]')) as HTMLElement[];
        let targetIndex = -1;
        if (matchTexts && matchTexts.length) {
          for (let i = 0; i < items.length; i++) {
            const txt = (items[i].textContent || '').trim();
            for (const mt of matchTexts) {
              if (txt.includes(mt)) { targetIndex = i; break; }
            }
            if (targetIndex >= 0) break;
          }
        }
        if (targetIndex >= 0) {
          const target = items[targetIndex];
          const el = createElement();
          // inherit vivlio color from nearby elements
          try {
            const src = target.closest('.vivlio-inline-toggle') || target.querySelector('.vivlio-inline-toggle') || document.querySelector('.vivlio-inline-toggle');
            let color = null;
            if (src) color = (window.getComputedStyle(src as Element).getPropertyValue('--vivlio-comp-color') || window.getComputedStyle(src as Element).color || '').trim();
            if (!color) color = (window.getComputedStyle(target).getPropertyValue('--vivlio-comp-color') || window.getComputedStyle(target).color || '').trim();
            if (color && !/^(transparent|none|rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(,\s*0\s*)?\))$/i.test(color)) {
              const parseRgb = (c: string) => {
                const m = c.match(/rgba?\s*\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
                if (m) return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
                const mh = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
                if (mh) {
                  let h = mh[1];
                  if (h.length === 3) h = h.split('').map(s => s + s).join('');
                  return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
                }
                return null;
              };
              const rgb = parseRgb(color) || null;
              if (rgb) {
                const [r,g,b] = rgb;
                el.style.setProperty('--vivlio-comp-color', `rgb(${r}, ${g}, ${b})`);
                el.style.setProperty('--vivlio-comp-glow-1', `rgba(${r}, ${g}, ${b}, 0.85)`);
                el.style.setProperty('--vivlio-comp-glow-2', `rgba(${r}, ${g}, ${b}, 0.55)`);
                el.style.setProperty('--vivlio-comp-glow-3', `rgba(${r}, ${g}, ${b}, 0.28)`);
              } else {
                el.style.setProperty('--vivlio-comp-color', color);
              }
            }
          } catch (e) { /* ignore */ }
          if (target.parentElement) {
            if (target.nextSibling) target.parentElement.insertBefore(el, target.nextSibling);
            else target.parentElement.appendChild(el);
            m.setAttribute(ATTR, '1');
          }
        }
      });
    } catch (e) {
      // swallow errors
    }
  }, [anchorSelector, matchTexts, createElement, ATTR]);

  React.useEffect(() => {
    // initial attempt
    scanAndInject();

    const mo = new MutationObserver(() => scanAndInject());
    try { mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] }); } catch (e) { /* ignore */ }

    const onClick = (ev: Event) => {
      try {
        const t = ev.target as Element | null;
        if (!t) return;
        const btn = t.closest('[data-testid="open-page-item-control-btn"], .btn-page-item-control, .grw-page-item-control');
        if (btn) setTimeout(scanAndInject, 50);
      } catch (e) { /* ignore */ }
    };
    document.addEventListener('click', onClick, true);

    return () => { try { mo.disconnect(); } catch {} document.removeEventListener('click', onClick, true); };
  }, [scanAndInject]);

  return null;
};

export default MenuInjector;
