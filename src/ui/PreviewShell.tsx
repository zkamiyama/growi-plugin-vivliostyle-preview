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
    <div
      data-vivlio-shell
      style={{ width: '100%', height: '100%', position: 'relative', display: isOpen ? 'flex' : 'none', flexDirection: 'column' }}
      aria-hidden={!isOpen}
    >
  <VivliostylePreview markdown={markdown} isVisible={isOpen} />
    </div>
  );
};

export default PreviewShell;
