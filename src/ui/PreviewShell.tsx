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
  const { isOpen, markdown, updateViewer } = useAppContext();

  React.useEffect(() => {
    if (!isOpen) return;
    const nextHtml = md.render(markdown);
    updateViewer(nextHtml);
  }, [markdown, isOpen, updateViewer]);

  React.useEffect(() => {
    // 既存プレビュー本体 (中身) のみを消す
    const originalPreviewBody = document.querySelector('.page-editor-preview-body') as HTMLElement | null;
    const vivlioHost = document.getElementById('vivlio-preview-container');
    if (!vivlioHost) return;
    const originalBodyDisplay = originalPreviewBody?.style.display || '';

    if (isOpen) {
      if (originalPreviewBody) originalPreviewBody.style.display = 'none';
      vivlioHost.style.display = 'flex';
    } else {
      if (originalPreviewBody) originalPreviewBody.style.display = originalBodyDisplay || '';
      vivlioHost.style.display = 'none';
    }

    return () => {
      if (originalPreviewBody) originalPreviewBody.style.display = originalBodyDisplay || '';
      vivlioHost.style.display = 'none';
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return (
    <div className="vivlio-preview" role="region" aria-label="Vivliostyle preview">
      <div className="vivlio-body">
        <VivliostyleFrame />
      </div>
    </div>
  );
};

export default PreviewShell;
