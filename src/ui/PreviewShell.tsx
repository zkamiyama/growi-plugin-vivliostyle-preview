// ui/PreviewShell.tsx
import * as React from 'react';
import '../styles/preview.css';
import VivliostyleFrame from './VivliostyleFrame';
import { useAppContext } from '../context/AppContext';
// markdown-it (CommonJS) を ESM で扱う: デフォルト互換を考慮
import MarkdownItModule from 'markdown-it';
// Jest 実行時 (ts-jest transpile) では CJS の module.exports = function() 形式が default に乗らないケースがあるため require フォールバック
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MarkdownItCtor: any = (MarkdownItModule as any)?.default || (MarkdownItModule as any);
// まだ関数でなければ require 試行 (Jest は CommonJS ランタイム)
if (typeof MarkdownItCtor !== 'function') {
  try {
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const req = require('markdown-it');
    MarkdownItCtor = req.default || req;
  } catch {
    /* ignore */
  }
}
if (typeof MarkdownItCtor !== 'function') {
  throw new Error('Failed to load markdown-it constructor');
}
const md = new MarkdownItCtor({ html: true, linkify: true });

const PreviewShell: React.FC = () => {
  const { isOpen, toggle, markdown, updateViewer } = useAppContext();

  React.useEffect(() => {
    if (!isOpen) return;
    const nextHtml = md.render(markdown);
    updateViewer(nextHtml);
  }, [markdown, isOpen, updateViewer]);

  React.useEffect(() => {
    const originalPreviewBody = document.querySelector('.page-editor-preview-body') as HTMLElement | null;
    if (!originalPreviewBody) return;

    if (isOpen) {
      originalPreviewBody.style.visibility = 'hidden';
    } else {
      originalPreviewBody.style.visibility = 'visible';
    }

    return () => { // クリーンアップ
      originalPreviewBody.style.visibility = 'visible';
    };
  }, [isOpen]);

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
