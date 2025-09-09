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
    return () => {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][PreviewShell] unmount', { time: Date.now() });
    };
  }, []);

  React.useEffect(() => {
    const host = document.getElementById('vivlio-preview-container');
    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;

    if (!host) {
      // eslint-disable-next-line no-console
      console.warn('[VivlioDBG][PreviewShell] host container missing when toggling', { isOpen });
      return;
    }

    host.dataset.vivlioMount = 'true';
    host.style.display = isOpen ? 'block' : 'none';
    // Prepare overlay to fully intercept pointer input
    if (isOpen) {
      // ensure host exactly fills the preview container
      host.style.position = 'absolute';
      host.style.top = '0';
      host.style.left = '0';
      host.style.right = '0';
      host.style.bottom = '0';
      host.style.width = '100%';
      host.style.height = '100%';
      host.style.overflow = 'hidden';
      // keep zIndex very high so overlay intercepts scrollbar drags
      host.style.zIndex = '100000';
      // Try a less invasive approach: hide the visual scrollbar in the
      // original preview container (so the UI doesn't show a scrollbar to
      // grab) while keeping the container functional. We inject a stylesheet
      // once and toggle a class on the preview container.
      try {
        if (previewContainer) {
          // ensure our stylesheet is present
          if (!document.getElementById('vivlio-hide-scroll-style')) {
            const s = document.createElement('style');
            s.id = 'vivlio-hide-scroll-style';
            s.textContent = `
              .vivlio-hide-scrollbar {
                scrollbar-width: none; /* Firefox */
                -ms-overflow-style: none;  /* IE 10+ */
              }
              .vivlio-hide-scrollbar::-webkit-scrollbar { display: none; width: 0; height: 0; }
            `;
            document.head.appendChild(s);
          }
          (previewContainer as HTMLElement).classList.add('vivlio-hide-scrollbar');
        }
      } catch (e) { /* ignore */ }
    }

    // Do NOT hide sibling elements. Instead, we overlay the host on top of the
    // existing preview area so layout and accessibility are preserved. Log
    // children for debugging.
    let childrenInfo: string[] = [];
    if (previewContainer) {
      childrenInfo = Array.from(previewContainer.children).map((el, idx) => `${idx}:${el.className || el.id || el.tagName}`);
    }

    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] mount info (overlay mode)', {
      isOpen,
      hasHost: !!host,
      hasPreviewContainer: !!previewContainer,
      hostDisplay: host.style.display,
      markdownLen: markdown.length,
      children: childrenInfo,
      previewChildren: previewContainer ? previewContainer.children.length : -1,
    });
    // when closing, remove our visual scrollbar-hiding class and restore
    if (!isOpen) {
      try {
        if (previewContainer) {
          (previewContainer as HTMLElement).classList.remove('vivlio-hide-scrollbar');
        }
      } catch (e) { /* ignore */ }
    }

    // No global input blocking anymore. Cleanup just ensures our class is removed
    // if the effect re-runs or the component unmounts.
    return () => {
      try {
        if (previewContainer) {
          (previewContainer as HTMLElement).classList.remove('vivlio-hide-scrollbar');
        }
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
      {/* Minimal controls: manual fit button only (auto-fit always enabled via ResizeObserver) */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 1002 }}>
        <button
          onClick={() => { fitToContainer(); }}
          style={{ padding: '6px 8px', fontSize: 12 }}
        >
          Fit now
        </button>
      </div>

      <VivliostylePreview markdown={markdown} />
    </div>
  );
};

export default PreviewShell;
