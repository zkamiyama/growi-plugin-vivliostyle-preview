// ui/VivliostyleFrame.tsx
import React from 'react';

const VIEWER_URL = '/plugins/growi-plugin-vivliostyle-preview/viewer/index.html';

/**
 * sandbox 警告回避 / セキュリティトレードオフ戦略
 * モード切替方法 (優先順):
 *  1. window.VIVLIO_VIEWER_MODE = 'trusted' | 'balanced' | 'strict'; をコンソール等で設定
 *  2. <body data-vivlio-viewer-mode="..."> 属性
 *  3. localStorage.getItem('vivlio.viewer.mode')
 *  4. デフォルト: 'balanced'
 *
 *  各モード:
 *   - trusted : sandbox 属性を外す (警告なし / セキュリティ最小制限)
 *   - balanced: sandbox="allow-scripts allow-same-origin allow-popups allow-downloads" (現行 / 警告出る可能性)
 *   - strict  : sandbox="allow-scripts" (スタイル崩れ/フォント不可の可能性 / CORS 要配慮)
 */
function resolveMode(): 'trusted' | 'balanced' | 'strict' {
  // @ts-ignore: 外部で任意設定可能
  const wMode = (window as any).VIVLIO_VIEWER_MODE as string | undefined;
  if (wMode === 'trusted' || wMode === 'balanced' || wMode === 'strict') return wMode;
  const bodyAttr = document.body?.getAttribute('data-vivlio-viewer-mode');
  if (bodyAttr === 'trusted' || bodyAttr === 'balanced' || bodyAttr === 'strict') return bodyAttr;
  const ls = typeof localStorage !== 'undefined' ? localStorage.getItem('vivlio.viewer.mode') : null;
  if (ls === 'trusted' || ls === 'balanced' || ls === 'strict') return ls;
  return 'balanced';
}

const VivliostyleFrame: React.FC = () => {
  const mode = resolveMode();

  let sandbox: string | undefined;
  if (mode === 'balanced') {
    sandbox = 'allow-scripts allow-same-origin allow-popups allow-downloads';
  } else if (mode === 'strict') {
    sandbox = 'allow-scripts';
  } else {
    // trusted: sandbox 付与しない (完全信頼)
    sandbox = undefined;
  }

  return (
    <iframe
      id="vivlio-iframe"
      title="Vivliostyle Viewer"
      src={VIEWER_URL}
      style={{ width: '100%', height: '100%', border: 0 }}
      {...(sandbox ? { sandbox } : {})}
    />
  );
};

export default VivliostyleFrame;
