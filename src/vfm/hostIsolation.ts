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
}
