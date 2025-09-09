// ui/PreviewShell.tsx
import * as React from 'react';
import { VivliostylePreview } from './VivliostylePreview';
import { useAppContext } from '../context/AppContext';

// 元の `.page-editor-preview-container` 内に生成した #vivlio-preview-container を
// トグルで表示/非表示し、従来の preview body (.page-editor-preview-body) を隠すだけの
// シンプルな差し替え方式。ポップアップは廃止。
const PreviewShell: React.FC = () => {
  const { isOpen, markdown } = useAppContext();
  const roRef = React.useRef<ResizeObserver | null>(null);

  const fitToContainer = React.useCallback(() => {
  const host = document.getElementById('vivlio-preview-container');
  const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;
  if (!host || !previewContainer) return;
  host.style.boxSizing = 'border-box';
  // For fixed-body-mounted overlay, compute the viewport rect of the
  // previewContainer and set host to fixed position so it does not move
  // during inner scrolling. Do not re-position on window scroll (avoid
  // chaining). Only adjust on resize/mutation.
  try {
    const rect = previewContainer.getBoundingClientRect();
    host.style.position = 'fixed';
    host.style.left = `${Math.round(rect.left)}px`;
    host.style.top = `${Math.round(rect.top)}px`;
    host.style.width = `${Math.round(rect.width)}px`;
    host.style.height = `${Math.round(rect.height)}px`;
    host.style.zIndex = '100000';
    // prevent scroll chaining
    host.style.overscrollBehavior = 'contain';
    host.style.touchAction = 'auto';
  } catch (e) { /* ignore */ }
  }, []);

  // 初回マウントログ
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] mount', { time: Date.now() });
    try {
      // runtime diagnostic: React version and simple mount context
      // eslint-disable-next-line no-console
      console.info('[VivlioDBG][diag] React', { version: (React as any).version || null, component: 'PreviewShell' });
    } catch (e) { /* ignore */ }
    return () => {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][PreviewShell] unmount', { time: Date.now() });
    };
  }, []);

  React.useEffect(() => {
    // Ensure a top-level host element exists under document.body to avoid any
    // ancestor transforms from the editor chrome affecting the measurement
    // inside the vivliostyle renderer. We create/move #vivlio-preview-container
    // to document.body and style it as a fixed overlay matching the preview
    // container's viewport rectangle.
    let host = document.getElementById('vivlio-preview-container') as HTMLElement | null;
    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;

    const ensureHostUnderBody = () => {
      host = document.getElementById('vivlio-preview-container') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.id = 'vivlio-preview-container';
        document.body.appendChild(host);
      } else if (host.parentElement !== document.body) {
        // move existing host to body to escape transforms
        document.body.appendChild(host);
      }
      // baseline styles to avoid inheriting transforms
      host.style.position = 'fixed';
      host.style.left = '0';
      host.style.top = '0';
      host.style.width = '100%';
      host.style.height = '100%';
      host.style.margin = '0';
      host.style.padding = '0';
      host.style.overflow = 'hidden';
      host.style.zIndex = '100000';
      host.dataset.vivlioMount = 'true';
    };

    try { ensureHostUnderBody(); } catch (e) { /* ignore */ }

    if (!host) {
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG][PreviewShell] host container missing when toggling (after ensure)');
      return undefined;
    }

    host.style.display = isOpen ? 'block' : 'none';

    // If previewContainer exists, compute its viewport rect and create an
    // inner wrapper inside the body-host that matches the preview area. This
    // keeps the vivliostyle renderer visually aligned while the host itself
    // remains unaffected by ancestor transforms.
    let innerWrapper: HTMLElement | null = host.querySelector('.vivlio-body-wrapper') as HTMLElement | null;
    if (!innerWrapper && host) {
      innerWrapper = document.createElement('div');
      innerWrapper.className = 'vivlio-body-wrapper';
      // make wrapper centered and pointer-events pass through default areas
      innerWrapper.style.position = 'absolute';
      innerWrapper.style.transform = 'none';
      innerWrapper.style.left = '0';
      innerWrapper.style.top = '0';
      innerWrapper.style.width = '100%';
      innerWrapper.style.height = '100%';
      innerWrapper.style.boxSizing = 'border-box';
      host.appendChild(innerWrapper);
    }

    if (isOpen && previewContainer && innerWrapper) {
      try {
        const rect = previewContainer.getBoundingClientRect();
        // Position innerWrapper to exactly overlay the previewContainer in the
        // viewport. Because host is fixed to the body, this positioning is free
        // from ancestor transforms.
        innerWrapper.style.left = `${Math.round(rect.left)}px`;
        innerWrapper.style.top = `${Math.round(rect.top)}px`;
        innerWrapper.style.width = `${Math.round(rect.width)}px`;
        innerWrapper.style.height = `${Math.round(rect.height)}px`;
      } catch (e) { /* ignore */ }
    }

    // Hide the original preview container scrollbar visually to avoid double
    // scrollbars, but do not move the element in the DOM.
    try {
      if (previewContainer) {
        if (!document.getElementById('vivlio-hide-scroll-style')) {
          const s = document.createElement('style');
          s.id = 'vivlio-hide-scroll-style';
          s.textContent = `
            .vivlio-hide-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
            .vivlio-hide-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
          `;
          document.head.appendChild(s);
        }
        previewContainer.classList.add('vivlio-hide-scrollbar');
      }
    } catch (e) { /* ignore */ }

    // cleanup on unmount or re-run
    return () => {
      try {
        if (previewContainer) previewContainer.classList.remove('vivlio-hide-scrollbar');
        // keep host in body but hide it
        if (host) host.style.display = 'none';
      } catch (e) { /* ignore */ }
    };
  }, [isOpen]);

  // Auto-fit behavior: when enabled, observe the editor preview container and
  // size the host to match. Also provide a manual 'Fit now' action.
  // Always-on fit: observe the editor preview container and size the host to match
  React.useEffect(() => {
    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;
    const host = document.getElementById('vivlio-preview-container');
    if (!previewContainer || !host) return;
    // initial fit: perform once and reveal immediately; observers will correct
    try {
      fitToContainer();
    } catch (e) { /* ignore */ }
    host.style.display = 'block';
    const ro = new (window as any).ResizeObserver(() => {
      fitToContainer();
    });
    ro.observe(previewContainer);
    roRef.current = ro;

    // Do not reposition on scroll: fixed overlay stays put relative to
    // viewport; only listen to resize to recompute placement.
    const onResize = () => { fitToContainer(); };
    window.addEventListener('resize', onResize);

    // watch previewContainer attribute/class changes (visibility toggles)
    try {
      const mo = new MutationObserver(() => {
        try { fitToContainer(); } catch (e) { /* ignore */ }
      });
      mo.observe(previewContainer, { attributes: true, attributeFilter: ['class', 'style'] });
    } catch (e) { /* ignore */ }

    return () => {
  try { ro.disconnect(); } catch (e) {}
  roRef.current = null;
  window.removeEventListener('resize', onResize);
    };
  }, [fitToContainer]);



  // Host (#vivlio-preview-container) 内にマウントされるのでラッパ不要
  if (!isOpen) {
    return null;
  }
  return (
    <div data-vivlio-shell-root style={{ position: 'relative', height: '100%' }}>
      <VivliostylePreview markdown={markdown} />
    </div>
  );
};

export default PreviewShell;
