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
  const rect = previewContainer.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;
  // position host in viewport absolute coordinates so it overlays correctly
  host.style.boxSizing = 'border-box';
  host.style.position = 'absolute';
  host.style.left = `${Math.round(rect.left + scrollX)}px`;
  host.style.top = `${Math.round(rect.top + scrollY)}px`;
  host.style.width = `${Math.round(rect.width)}px`;
  host.style.height = `${Math.round(rect.height)}px`;
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
      host.style.zIndex = '10';
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
  }, [isOpen]);

  // Auto-fit behavior: when enabled, observe the editor preview container and
  // size the host to match. Also provide a manual 'Fit now' action.
  // Always-on fit: observe the editor preview container and size the host to match
  React.useEffect(() => {
    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;
    const host = document.getElementById('vivlio-preview-container');
    if (!previewContainer || !host) return;
    // initial fit
    fitToContainer();
    const ro = new (window as any).ResizeObserver(() => {
      fitToContainer();
    });
    ro.observe(previewContainer);
    roRef.current = ro;

    const onScroll = () => { fitToContainer(); };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    return () => {
      try { ro.disconnect(); } catch (e) {}
      roRef.current = null;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
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
