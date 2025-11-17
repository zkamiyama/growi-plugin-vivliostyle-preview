// MenuInjectorStandalone.ts
// This small module ensures the Build PDF menu item is injected whenever a
// matching dropdown menu appears on the page, independent of React mounting.
import { createMenuButton } from './createMenuButton';

function defaultMatchTexts() {
  return [ 'ページとその配下のページを全てエクスポート', '全てエクスポート', 'エクスポート' ];
}

function scanAndInject({ anchorSelector, matchTexts, processedAttr, createElement }: {
  anchorSelector?: string;
  matchTexts: string[];
  processedAttr: string;
  createElement: () => HTMLElement;
}) {
  try {
    // If anchorSelector is provided, try to find anchor and then its nearest dropdown menu
    if (anchorSelector) {
      const anchor = document.querySelector(anchorSelector) as Element | null;
      if (anchor) {
        // find nearest ancestor menu (dropdown) or sibling menu
        const menu = anchor.closest('.dropdown-menu') || (anchor.parentElement && anchor.parentElement.querySelector('.dropdown-menu')) || null;
        if (menu && !(menu as HTMLElement).hasAttribute(processedAttr)) {
          // attempt to match by text content
          const menuText = (menu as HTMLElement).textContent || '';
          if (matchTexts.some((t) => menuText.indexOf(t) !== -1) || (menu as HTMLElement).querySelector('li, a, button')) {
            const el = createElement();
            // Insert immediately after the actionable element inside the anchor if present.
            let target: Element | null = null;
            try {
              if ((anchor as Element).matches && (anchor as Element).matches('button, a, [role="menuitem"]')) target = anchor;
            } catch (e) { /* ignore */ }
            if (!target && (anchor as Element).querySelector) target = (anchor as Element).querySelector('button, a, [role="menuitem"]');
            if (target && target.parentElement) {
              target.parentElement.insertBefore(el, target.nextSibling);
            } else {
              // fallback: append to menu
              (menu as HTMLElement).appendChild(el);
            }
            (menu as HTMLElement).setAttribute(processedAttr, '1');
            return true;
          }
        }
      }
    }

    // fallback: scan all dropdown menus in document
    const menus = Array.from(document.querySelectorAll('.d-print-none.dropdown-menu, .dropdown-menu')) as HTMLElement[];
    for (const m of menus) {
      if (m.hasAttribute(processedAttr)) continue;
      const text = m.textContent || '';
      if (matchTexts.some((t) => text.indexOf(t) !== -1) || m.querySelector('li, a, button')) {
        const el = createElement();
        m.appendChild(el);
        m.setAttribute(processedAttr, '1');
        return true;
      }
    }
  } catch (e) {
    // ignore
  }
  return false;
}

function ensureInjection() {
  const cfg = {
    anchorSelector: '#bulkExportDropdownItem',
    matchTexts: defaultMatchTexts(),
    processedAttr: 'data-vivlio-build-added',
    createElement: createMenuButton,
  };
  scanAndInject(cfg);
}

// Run at DOMContentLoaded and also observe mutations for late-inserted menus
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureInjection, { once: true });
} else {
  ensureInjection();
}

const mo = new MutationObserver((mutations) => {
  // quick bail-out if nothing looks like a menu
  const addedMenu = mutations.some((m) => Array.from(m.addedNodes).some((n) => (n as Element).matches && (n as Element).matches('.dropdown-menu, .d-print-none.dropdown-menu')));
  if (addedMenu) ensureInjection();
});
mo.observe(document.body, { childList: true, subtree: true });

export {};
