// ui/PreviewShell.tsx
import * as React from 'react';
import { VivliostylePreview } from './VivliostylePreview';
import { useAppContext } from '../context/AppContext';

const PreviewShell: React.FC = () => {
  const { isOpen, markdown } = useAppContext();

  React.useEffect(() => {
    const previewContainer = document.getElementById('vivlio-preview-container');
    const originalPreviewBody = document.querySelector('.page-editor-preview-body') as HTMLElement | null;
    if (previewContainer) {
      previewContainer.style.display = isOpen ? 'block' : 'none';
      if (isOpen) {
        const parent = previewContainer.parentElement as HTMLElement | null;
        const ph = parent?.getBoundingClientRect().height || 0;
        if (ph > 0 && previewContainer.getBoundingClientRect().height < ph * 0.5) {
          previewContainer.style.minHeight = ph + 'px';
        }
      }
    }
    if (originalPreviewBody) {
      originalPreviewBody.style.display = isOpen ? 'none' : 'block';
    }
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG] isOpen effect fired', { isOpen, hasContainer: !!previewContainer, hiddenOriginal: !!originalPreviewBody });
  }, [isOpen]);

  return (
    <>
      {/* 既存領域(将来拡張用 / 今は非表示運用) */}
      <div data-vivlio-shell style={{ display: 'none' }} aria-hidden />
      {/* 右下ポップアップ */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            width: '420px',
            height: '60vh',
            maxHeight: '720px',
            minHeight: '360px',
            background: '#fff',
            border: '1px solid #ccc',
            borderRadius: 8,
            boxShadow: '0 8px 28px rgba(0,0,0,.18)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 2147483000,
            overflow: 'hidden'
          }}
        >
          <VivliostylePreview markdown={markdown} isVisible={isOpen} />
        </div>
      )}
    </>
  );
};

export default PreviewShell;
