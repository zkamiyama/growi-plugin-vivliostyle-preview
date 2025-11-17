export function createMenuButton(): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'grw-page-control-dropdown-item dropdown-item';
  btn.setAttribute('role', 'menuitem');
  btn.title = 'PDFをビルド';
  // Icon with ghost glow layer
  const iconWrap = document.createElement('span');
  iconWrap.className = 'vivlio-glow-wrap';
  iconWrap.style.setProperty('overflow', 'visible');
  iconWrap.style.setProperty('z-index', '5');
  
  const iconGhost = document.createElement('span');
  iconGhost.className = 'material-symbols-outlined me-1 grw-page-control-dropdown-icon vivlio-glow-textclip';
  iconGhost.textContent = 'cloud_download';
  iconGhost.setAttribute('aria-hidden', 'true');
  iconGhost.style.pointerEvents = 'none';

  const icon = document.createElement('span');
  icon.className = 'material-symbols-outlined me-1 grw-page-control-dropdown-icon vivlio-glow-foreground-clip';
  icon.textContent = 'cloud_download';

  const iconOverlay = document.createElement('span');
  iconOverlay.className = 'material-symbols-outlined me-1 grw-page-control-dropdown-icon vivlio-glow-overlay';
  iconOverlay.textContent = 'cloud_download';
  iconOverlay.setAttribute('aria-hidden', 'true');
  iconOverlay.style.pointerEvents = 'none';
  try {
    // tileable repeating gradient to avoid visible seam when background-position animates past 100%
    const activeBg = 'repeating-linear-gradient(135deg, #d05232 0%, #1a63b8 16.666%, #d05232 33.333%)';
    // store gradient in CSS variable (kept for reference)
    btn.style.setProperty('--vivlio-comp-bg', activeBg);
  // Do NOT set background-image on the button itself (that makes the whole
  // button show the gradient). Keep the CSS variable so the clipped text
  // layers (vivlio-glow-foreground-clip) can use it via CSS background-image.
  // Do NOT force the button background to transparent — preserve the
  // host's default dropdown-item hover highlight by leaving background alone.
    // preserve ability to animate background-position/size for any decorative usage
    btn.style.setProperty('background-size', '300% 100%');
    btn.style.setProperty('background-position', '0% 50%');
    // keep the marker class for potential future styling
    btn.classList.add('vivlio-glow-gradient');
  } catch (e) { /* ignore */ }
  iconWrap.appendChild(iconGhost);
  iconWrap.appendChild(icon);
  iconWrap.appendChild(iconOverlay);
  btn.appendChild(iconWrap);
  const labelWrap = document.createElement('span');
  labelWrap.className = 'vivlio-glow-wrap';
  // allow decorative glow to overflow the button's box so blur isn't clipped
  labelWrap.style.setProperty('overflow', 'visible');
  labelWrap.style.setProperty('z-index', '5');

  // create a blurred "ghost" layer that is a duplicate of the text and sits behind
  // this makes the glow appear to originate from the glyphs rather than the whole background
  const ghostLayer = document.createElement('span');
  ghostLayer.className = 'vivlio-glow-textclip';
  ghostLayer.textContent = 'Build PDF [Vivliostyle CLI]';
  ghostLayer.setAttribute('aria-hidden', 'true');
  ghostLayer.style.pointerEvents = 'none';

  const plainLayer = document.createElement('span');
  // top foreground uses gradient clipping for vibrant colored text
  plainLayer.className = 'vivlio-glow-plain vivlio-glow-foreground-clip';
  plainLayer.textContent = 'Build PDF [Vivliostyle CLI]';

  const overlayLayer = document.createElement('span');
  overlayLayer.className = 'vivlio-glow-overlay';
  overlayLayer.textContent = 'Build PDF [Vivliostyle CLI]';
  overlayLayer.setAttribute('aria-hidden', 'true');
  overlayLayer.style.pointerEvents = 'none';

  labelWrap.appendChild(ghostLayer);
  labelWrap.appendChild(plainLayer);
  labelWrap.appendChild(overlayLayer);
  btn.appendChild(labelWrap);
  // make sure the button itself doesn't clip children glows
  try { btn.style.setProperty('overflow', 'visible'); } catch (e) { /* ignore */ }
  try { btn.style.setProperty('z-index', '2'); } catch (e) { /* ignore */ }
  // (removed duplicate linear-gradient block) the repeating-linear-gradient above
  // is used to make background-position animation loop smoothly.
  btn.addEventListener('click', (ev) => {
    // Try to cause the host to close the dropdown by synthesizing a click
    // on an area outside the menu (blank area). This is useful when the
    // host closes menus in response to outside clicks.
    try {
      const menu = btn.closest('.dropdown-menu') as HTMLElement | null;
      if (menu) {
        const rect = menu.getBoundingClientRect();
        // pick a point slightly to the bottom-right of the menu (clamped)
        const x = Math.min(window.innerWidth - 1, Math.ceil(rect.right + 8));
        const y = Math.min(window.innerHeight - 1, Math.ceil(rect.bottom + 8));
        setTimeout(() => {
          try {
            const target = document.elementFromPoint(x, y) || document.body;
            const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y });
            target.dispatchEvent(ev);
            console.info('[VivlioDBG][BuildPdfMenuInjector] dispatched synthetic outside click', { x, y, target });
          } catch (e) { console.warn('[VivlioDBG] synthetic click failed', e); }
        }, 10);
      }
    } catch (e) { /* ignore */ }

    // Fire build event after a small delay so the host's close handler can run
    // and its internal state can stabilize.
    setTimeout(() => {
      try {
        const event = new CustomEvent('vivlio-build-pdf', { detail: { source: 'menu' } });
        window.dispatchEvent(event);
        console.info('[VivlioDBG][BuildPdfMenuInjector] dispatched vivlio-build-pdf');
      } catch (e) { console.error('[VivlioDBG][BuildPdfMenuInjector] click handler error', e); }
    }, 120);
  });
  return btn;
}
