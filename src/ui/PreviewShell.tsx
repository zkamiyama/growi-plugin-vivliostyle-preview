// ui/PreviewShell.tsx
import * as React from 'react';
import '../styles/preview.css';
import VivliostyleFrame from './VivliostyleFrame';
import { useEditorMarkdown } from '../hooks/useEditorMarkdown';
import { useVivliostyleBridge } from '../hooks/useVivliostyleBridge';
import { usePreviewToggle } from '../hooks/usePreviewToggle';
// markdown-it の型定義は export = 形式のため、ts-jest (esModuleInterop: false) 下では require で扱う
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MarkdownIt = require('markdown-it');
const md: import('markdown-it') = new MarkdownIt({ html: true, linkify: true });

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
