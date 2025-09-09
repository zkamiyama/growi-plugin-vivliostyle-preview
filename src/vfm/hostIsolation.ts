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
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}
`;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);

  // MutationObserver: when vivliostyle host containers are created, force their
  // outer container size to match the target page size (mm -> px conversion).
  // This helps when the viewer creates a container using a different default
  // (e.g. A4) before content-side @page rules are applied.
  const mmToPx = (mm: number) => (96.0 / 25.4) * mm; // 96dpi ~ 3.779527559 px/mm

  const applyContainerSizing = (el: Element) => {
    try {
      // Target page size set by our inline @page in the generated content
      const pageWidthMm = 148; // A5 width in mm
      const pageHeightMm = 210; // A5 height in mm
      const bleedMm = 3; // matches inline @page bleed

  const pageBoxW = Math.round((pageWidthMm + bleedMm * 2) * mmToPx(1));
  const pageBoxH = Math.round((pageHeightMm + bleedMm * 2) * mmToPx(1));

      // Prefer setting the outer page container to the bleed-box size so that
      // inner page-box/page-area align to the expected trim and bleed.
      const elAny = el as HTMLElement;
      elAny.style.width = `${pageBoxW}px`;
      elAny.style.height = `${pageBoxH}px`;
      elAny.style.maxWidth = `${pageBoxW}px`;
      elAny.style.maxHeight = `${pageBoxH}px`;
      elAny.style.boxSizing = 'content-box';
    } catch (e) {
      // ignore
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (!(node instanceof Element)) continue;
        // if a page-container appears, apply sizing
        if (node.matches && node.matches('[data-vivliostyle-page-container]')) {
          applyContainerSizing(node);
        }
        // also check descendants
        const found = node.querySelectorAll ? node.querySelectorAll('[data-vivliostyle-page-container]') : [];
        for (const f of Array.from(found)) applyContainerSizing(f);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Run once immediately in case elements already exist
  document.querySelectorAll('[data-vivliostyle-page-container]').forEach(applyContainerSizing);
}
