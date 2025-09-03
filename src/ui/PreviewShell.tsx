// ui/PreviewShell.tsx
import * as React from 'react';
import '../styles/preview.css';
import VivliostyleFrame from './VivliostyleFrame';
import { useEditorMarkdown } from '../hooks/useEditorMarkdown';
import { useVivliostyleBridge } from '../hooks/useVivliostyleBridge';
import { usePreviewToggle } from '../hooks/usePreviewToggle';
// markdown-it (CommonJS) を ESM で扱う: デフォルト互換を考慮
import MarkdownItCjs from 'markdown-it';
// tsconfig の esModuleInterop:false でも Vite 側が CJS を default export として解決する
const md = new (MarkdownItCjs as unknown as typeof import('markdown-it'))({ html: true, linkify: true });

const PreviewShell: React.FC = () => {
  const { isOpen, toggle } = usePreviewToggle();
  const { markdown } = useEditorMarkdown({ debounceMs: 250 });
  const { updateViewer } = useVivliostyleBridge();

  React.useEffect(() => {
    if (!isOpen) return;
    const nextHtml = md.render(markdown);
    updateViewer(nextHtml);
  }, [markdown, isOpen, updateViewer]);

  return (
    <div className={`vivlio-preview ${isOpen ? 'is-open' : 'is-closed'}`}>
      <div className="vivlio-toolbar">
        <button onClick={toggle} aria-expanded={isOpen}>
          {isOpen ? 'Close Vivliostyle' : 'Open Vivliostyle'}
        </button>
      </div>
      <div className="vivlio-body" role="region" aria-label="Vivliostyle preview">
        {isOpen && <VivliostyleFrame />}
      </div>
    </div>
  );
};

export default PreviewShell;
