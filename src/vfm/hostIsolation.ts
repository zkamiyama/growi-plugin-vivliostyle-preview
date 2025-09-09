// hostIsolation.ts
export function ensureHostIsolationCss() {
  const id = 'vivlio-host-isolation';
  if (document.getElementById(id)) return;

  // Two strategies:
  // 1) Create exclusion rules so typical global resets (e.g. `*, *::before, *::after { box-sizing: border-box }`)
  //    won't apply to vivliostyle host containers. This is the preferred, non-invasive approach.
  // 2) Provide a minimal, targeted override to ensure layout calculations assume content-box and correct positioning.
  const css = `
/* Exclude vivliostyle host containers from broad global resets (non-invasive) */
*:where(:not([data-vivliostyle-outer-zoom-box],
             [data-vivliostyle-spread-container],
             [data-vivliostyle-page-container],
             [data-vivliostyle-bleed-box],
             [data-vivliostyle-page-box],
             [data-vivliostyle-page-area]))::before,
*:where(:not([data-vivliostyle-outer-zoom-box],
             [data-vivliostyle-spread-container],
             [data-vivliostyle-page-container],
             [data-vivliostyle-bleed-box],
             [data-vivliostyle-page-box],
             [data-vivliostyle-page-area]))::after,
*:where(:not([data-vivliostyle-outer-zoom-box],
             [data-vivliostyle-spread-container],
             [data-vivliostyle-page-container],
             [data-vivliostyle-bleed-box],
             [data-vivliostyle-page-box],
             [data-vivliostyle-page-area])) {
  /* leave global resets as-is for other elements */
}

/* Fallback: minimal, targeted override to ensure layout calculations assume content-box */
.vivlio-simple-viewer [data-vivliostyle-outer-zoom-box],
.vivlio-simple-viewer [data-vivliostyle-spread-container],
.vivlio-simple-viewer [data-vivliostyle-page-container],
.vivlio-simple-viewer [data-vivliostyle-bleed-box],
.vivlio-simple-viewer [data-vivliostyle-page-box] {
  box-sizing: content-box !important;
  padding: 0 !important;
  border: 0 !important;
}

/* Force correct positioning for Vivliostyle layout layers */
.vivlio-simple-viewer [data-vivliostyle-viewer-viewport] {
  display: flex !important;
  justify-content: center !important;
  align-items: flex-start !important;
  position: relative !important;
  overflow: auto;
}
.vivlio-simple-viewer [data-vivliostyle-spread-container] {
  display: flex !important;
  justify-content: center !important;
  flex: none;
  transform-origin: left top;
}
.vivlio-simple-viewer [data-vivliostyle-page-container] {
  position: relative !important;
  margin: 0 auto;
  overflow: hidden;
  box-sizing: content-box !important;
}
.vivlio-simple-viewer [data-vivliostyle-bleed-box],
.vivlio-simple-viewer [data-vivliostyle-page-box],
.vivlio-simple-viewer [data-vivliostyle-page-area] {
  /* Do not force absolute/full-stretch positioning here — let Vivliostyle
     author the stacking/positioning of these internal boxes. For safety,
     only normalize spacing and box-sizing so global resets don't break layout. */
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}
`;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  // Safer approach: do NOT force width/height on the page-container. Instead
  // ensure viewer containers are centered and optionally perform a single
  // measurement/log so we can detect mismatches without clobbering the
  // viewer's internal coordinate system (which may use transforms/scale).

  const mmToPx = (mm: number) => (96.0 / 25.4) * mm; // helper for logging only

  const safeAdjust = (pc: Element) => {
    try {
      const el = pc as HTMLElement;
      // DO NOT mutate layout here; centering/positioning should come from
      // viewer-viewport CSS (we already set that above). Only perform a
      // one-time measurement so we can detect mismatches without interfering.

      const bleed = el.querySelector('[data-vivliostyle-bleed-box]') as HTMLElement | null;
      const pageBox = el.querySelector('[data-vivliostyle-page-box]') as HTMLElement | null;
      if (bleed && pageBox) {
        // Use bounding client rect to get rendered size (includes transforms)
        const bRect = bleed.getBoundingClientRect();
        const pRect = pageBox.getBoundingClientRect();
        const expectedDiffPx = mmToPx(6); // 3mm bleed each side => 6mm total
        const actualDiff = Math.abs((bRect.width - pRect.width) - expectedDiffPx);
        if (actualDiff > 8) { // threshold: 8px (tunable)
          // Collect richer diagnostics to help root-cause analysis without
          // mutating the viewer DOM. This includes computed styles, offset/
          // client sizes and any transforms applied to the elements or their
          // ancestors.
          try {
            const bleedCS = getComputedStyle(bleed);
            const pageCS = getComputedStyle(pageBox);
            const collectSizes = (n: HTMLElement) => ({
              offset: { w: n.offsetWidth, h: n.offsetHeight },
              client: { w: n.clientWidth, h: n.clientHeight },
              scroll: { w: n.scrollWidth, h: n.scrollHeight }
            });

            const findAncestorTransform = (n: HTMLElement) => {
              let cur: HTMLElement | null = n.parentElement;
              while (cur) {
                const cs = getComputedStyle(cur);
                if (cs.transform && cs.transform !== 'none') return { el: cur, transform: cs.transform };
                cur = cur.parentElement;
              }
              return null;
            };

            const bleedSizes = collectSizes(bleed);
            const pageSizes = collectSizes(pageBox);
            const bleedAncestor = findAncestorTransform(bleed as HTMLElement);
            const pageAncestor = findAncestorTransform(pageBox as HTMLElement);

            // eslint-disable-next-line no-console
            console.warn('[VivlioDBG] page/bleed size mismatch detected', {
              pageContainer: el,
              bleedSize: { w: bRect.width, h: bRect.height },
              pageBoxSize: { w: pRect.width, h: pRect.height },
              expectedBleedPx: expectedDiffPx,
              actualDiff,
              bleedBounding: bRect,
              pageBounding: pRect,
              bleedComputed: { width: bleedCS.width, height: bleedCS.height, transform: bleedCS.transform, boxSizing: bleedCS.boxSizing },
              pageComputed: { width: pageCS.width, height: pageCS.height, transform: pageCS.transform, boxSizing: pageCS.boxSizing },
              bleedOffsets: bleedSizes,
              pageOffsets: pageSizes,
              bleedAncestorTransform: bleedAncestor,
              pageAncestorTransform: pageAncestor,
              devicePixelRatio: (typeof window !== 'undefined' && (window as any).devicePixelRatio) || 1
            });
          } catch (innerErr) {
            // fallback to simple log if diagnostics collection fails
            // eslint-disable-next-line no-console
            console.warn('[VivlioDBG] page/bleed size mismatch detected (partial)', {
              pageContainer: el,
              bleedSize: { w: bRect.width, h: bRect.height },
              pageBoxSize: { w: pRect.width, h: pRect.height },
              expectedBleedPx: expectedDiffPx,
              actualDiff
            });
          }
        }
      }
    } catch (e) {
      // ignore errors; this helper must be non-fatal
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (!(node instanceof Element)) continue;
        if (node.matches && node.matches('[data-vivliostyle-page-container]')) safeAdjust(node);
        if (node.querySelectorAll) {
          const found = node.querySelectorAll('[data-vivliostyle-page-container]');
          for (const f of Array.from(found)) safeAdjust(f);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Run once immediately in case elements already exist
  document.querySelectorAll('[data-vivliostyle-page-container]').forEach(safeAdjust);
}
