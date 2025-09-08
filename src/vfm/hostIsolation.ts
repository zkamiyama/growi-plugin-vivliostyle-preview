// hostIsolation.ts
export function ensureHostIsolationCss() {
  const id = 'vivlio-host-isolation';
  if (document.getElementById(id)) return;

  const css = `
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
