// hostIsolation.ts
export function ensureHostIsolationCss() {
  const id = 'vivlio-host-isolation';
  if (document.getElementById(id)) return;

  // Two strategies:
  // 1) Create exclusion rules so typical global resets (e.g. `*, *::before, *::after { box-sizing: border-box }`)
  //    won't apply to vivliostyle host containers. This is the preferred, non-invasive approach.
  // 2) Provide a minimal, targeted override for the most harmful properties as a fallback.
  const css = `
/* Exclude vivliostyle host containers from broad global resets (non-invasive) */
*:where(:not([data-vivliostyle-outer-zoom-box],
             [data-vivliostyle-spread-container],
             [data-vivliostyle-page-container],
             [data-vivliostyle-bleed-box],
             [data-vivliostyle-page-box]))::before,
*:where(:not([data-vivliostyle-outer-zoom-box],
             [data-vivliostyle-spread-container],
             [data-vivliostyle-page-container],
             [data-vivliostyle-bleed-box],
             [data-vivliostyle-page-box]))::after,
*:where(:not([data-vivliostyle-outer-zoom-box],
             [data-vivliostyle-spread-container],
             [data-vivliostyle-page-container],
             [data-vivliostyle-bleed-box],
             [data-vivliostyle-page-box])) {
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
`;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}
