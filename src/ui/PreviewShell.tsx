// ui/PreviewShell.tsx
import * as React from 'react';
import { VivliostylePreview } from './VivliostylePreview';
import { useAppContext } from '../context/AppContext';

// 元の `.page-editor-preview-container` 内に生成した #vivlio-preview-container を
// トグルで表示/非表示し、従来の preview body (.page-editor-preview-body) を隠すだけの
// シンプルな差し替え方式。ポップアップは廃止。
const PreviewShell: React.FC = () => {
  const { isOpen, markdown } = useAppContext();
  const dragState = React.useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    mode: 'none' | 'h' | 'corner';
  }>({ startX: 0, startY: 0, startWidth: 0, startHeight: 0, mode: 'none' });
  const [autoFit, setAutoFit] = React.useState(false);
  const roRef = React.useRef<ResizeObserver | null>(null);

  const fitToContainer = React.useCallback(() => {
    const host = document.getElementById('vivlio-preview-container');
    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;
    if (!host || !previewContainer) return;
    // size to inner content area
    host.style.width = `${previewContainer.clientWidth}px`;
    host.style.height = `${previewContainer.clientHeight}px`;
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
      host.style.position = 'relative';
  // if width not explicitly set, default to 60% width so resize makes sense
  if (!host.style.width || host.style.width === '100%') host.style.width = '60%';
  if (!host.style.height || host.style.height === '100%') host.style.height = '100%';
      host.style.overflow = 'auto';
      host.style.zIndex = '10';
      if (!host.style.minHeight) host.style.minHeight = '400px';
    }

    let hiddenCount = 0;
    let restoredCount = 0;
    const processed: string[] = [];

    if (previewContainer) {
      const children = Array.from(previewContainer.children) as HTMLElement[];
      children.forEach((el, idx) => {
        if (el === host) return; // 自分は対象外
        processed.push(`${idx}:${el.className || el.id || el.tagName}`);
        if (isOpen) {
          // 既に保存していなければ元displayを保存
            if (!el.dataset.vivlioPrevDisplay) {
              el.dataset.vivlioPrevDisplay = el.style.display || '';
            }
            el.style.setProperty('display', 'none', 'important');
            el.setAttribute('aria-hidden', 'true');
            hiddenCount += 1;
        } else {
          if (el.dataset.vivlioPrevDisplay !== undefined) {
            el.style.display = el.dataset.vivlioPrevDisplay;
            delete el.dataset.vivlioPrevDisplay; // 復帰後クリア
          } else {
            el.style.display = '';
          }
          el.removeAttribute('aria-hidden');
          restoredCount += 1;
        }
      });
    }

    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][PreviewShell] toggle siblings', {
      isOpen,
      hasHost: !!host,
      hasPreviewContainer: !!previewContainer,
      hostDisplay: host.style.display,
      markdownLen: markdown.length,
      hiddenCount,
      restoredCount,
      processed,
      previewChildren: previewContainer ? previewContainer.children.length : -1,
    });
  }, [isOpen]);

  // Auto-fit behavior: when enabled, observe the editor preview container and
  // size the host to match. Also provide a manual 'Fit now' action.
  React.useEffect(() => {
    const previewContainer = document.querySelector('.page-editor-preview-container') as HTMLElement | null;
    const host = document.getElementById('vivlio-preview-container');
    if (!autoFit) {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      return;
    }
    if (!previewContainer || !host) return;
    // initial fit
    fitToContainer();
    const ro = new (window as any).ResizeObserver(() => {
      fitToContainer();
    });
    ro.observe(previewContainer);
    roRef.current = ro;
    return () => {
      try { ro.disconnect(); } catch (e) {}
      roRef.current = null;
    };
  }, [autoFit, fitToContainer]);

  // Resize handlers: adjust host width/height by dragging handles rendered inside the React tree
  React.useEffect(() => {
    const onPointerMove = (ev: PointerEvent) => {
      const ds = dragState.current;
      if (ds.mode === 'none') return;
      const host = document.getElementById('vivlio-preview-container');
      if (!host) return;
      if (ds.mode === 'h') {
        const dx = ev.clientX - ds.startX;
        // left-edge handle: moving right decreases width
        const newWidth = Math.max(300, ds.startWidth - dx);
        host.style.width = `${newWidth}px`;
      } else if (ds.mode === 'corner') {
        const dx = ev.clientX - ds.startX;
        const dy = ev.clientY - ds.startY;
        const newWidth = Math.max(300, ds.startWidth + dx);
        const newHeight = Math.max(200, ds.startHeight + dy);
        host.style.width = `${newWidth}px`;
        host.style.height = `${newHeight}px`;
      }
      ev.preventDefault();
    };

    const onPointerUp = () => {
      dragState.current.mode = 'none';
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };

    // attach when dragging starts via handlers below
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const startHorizontalResize = (e: React.PointerEvent) => {
    const host = document.getElementById('vivlio-preview-container');
    if (!host) return;
    const rect = host.getBoundingClientRect();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      mode: 'h'
    };
    // attach global listeners
    const onPointerMove = (ev: PointerEvent) => {
      const ds = dragState.current;
      if (ds.mode !== 'h') return;
      const dx = ev.clientX - ds.startX;
      const newWidth = Math.max(300, ds.startWidth - dx);
      host.style.width = `${newWidth}px`;
      ev.preventDefault();
    };
    const onPointerUp = () => {
      dragState.current.mode = 'none';
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
  };

  const startCornerResize = (e: React.PointerEvent) => {
    const host = document.getElementById('vivlio-preview-container');
    if (!host) return;
    const rect = host.getBoundingClientRect();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      mode: 'corner'
    };
    const onPointerMove = (ev: PointerEvent) => {
      const ds = dragState.current;
      if (ds.mode !== 'corner') return;
      const dx = ev.clientX - ds.startX;
      const dy = ev.clientY - ds.startY;
      const newWidth = Math.max(300, ds.startWidth + dx);
      const newHeight = Math.max(200, ds.startHeight + dy);
      host.style.width = `${newWidth}px`;
      host.style.height = `${newHeight}px`;
      ev.preventDefault();
    };
    const onPointerUp = () => {
      dragState.current.mode = 'none';
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp, { once: true });
  };

  // Host (#vivlio-preview-container) 内にマウントされるのでラッパ不要
  if (!isOpen) {
    return null;
  }
  return (
    <div data-vivlio-shell-root style={{ position: 'relative' }}>
      {/* Fit controls */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 1002, display: 'flex', gap: 8 }}>
        <button
          onClick={() => { fitToContainer(); }}
          style={{ padding: '6px 8px', fontSize: 12 }}
        >
          Fit now
        </button>
        <button
          onClick={() => { setAutoFit(v => !v); }}
          style={{ padding: '6px 8px', fontSize: 12, background: autoFit ? '#0a84ff' : undefined, color: autoFit ? 'white' : undefined }}
        >
          Auto fit
        </button>
      </div>
      {/* Vertical drag handle on the left for horizontal resize */}
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={startHorizontalResize}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 8,
          cursor: 'ew-resize',
          zIndex: 1001,
          background: 'transparent'
        }}
      />

      {/* Corner handle for width+height */}
      <div
        onPointerDown={startCornerResize}
        style={{
          position: 'absolute',
          right: 4,
          bottom: 4,
          width: 16,
          height: 16,
          background: '#666',
          borderRadius: 2,
          cursor: 'nwse-resize',
          zIndex: 1001
        }}
      />

      <VivliostylePreview markdown={markdown} />
    </div>
  );
};

export default PreviewShell;
