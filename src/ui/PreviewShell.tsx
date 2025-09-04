// ui/PreviewShell.tsx
import * as React from 'react';
import '../styles/preview.css';
import VivliostyleFrame from './VivliostyleFrame';
import { useAppContext } from '../context/AppContext';
import { useVivliostyleBridge } from '../hooks/useVivliostyleBridge';
// markdown-it の型定義は export = 形式のため、ts-jest (esModuleInterop: false) 下では require で扱う
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MarkdownIt = require('markdown-it');
const md: import('markdown-it') = new MarkdownIt({ html: true, linkify: true });

const PreviewShell: React.FC = () => {
  const { isVivliostyleActive, markdown } = useAppContext();
  const { updateViewer } = useVivliostyleBridge();

  React.useEffect(() => {
    if (!isVivliostyleActive) return;
    const nextHtml = md.render(markdown);
    updateViewer(nextHtml);
  }, [markdown, isVivliostyleActive, updateViewer]);

  return (
    <div className={`vivlio-preview ${isVivliostyleActive ? 'is-open' : 'is-closed'}`}>
      <div className="vivlio-toolbar">
        <button onClick={() => {}} aria-expanded={isVivliostyleActive}>
          {isVivliostyleActive ? 'Close Vivliostyle' : 'Open Vivliostyle'}
        </button>
      </div>
      <div className="vivlio-body" role="region" aria-label="Vivliostyle preview">
        {isVivliostyleActive && <VivliostyleFrame />}
      </div>
    </div>
  );
};

export default PreviewShell;
