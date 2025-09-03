// client-entry.tsx
import * as React from 'react';
import { createRoot } from 'react-dom/client';
// NOTE: client-entry.tsx はリポジトリルートにあるため src 配下へは "./src/..." ではなく "./src/..." ではなく "./src" なしで参照できない。
// 正: './src/ui/PreviewShell' ではなく '../src/ui/PreviewShell' でもないので、tsconfig の include に client-entry.tsx を入れている構成では
// ビルド時 path 解決は相対(同階層)起点。src/ui はルート直下 'src/ui' に存在するため './src/ui/..' で合っているが
// 実行時 (バンドラ) では package.json を参照するため config import の方だけ './package.json' で良い。一方 TSC では前の commit で失敗したのは
// PreviewShell を './ui/PreviewShell' (ルート直下に ui フォルダ無し) と書いていたため。ここを './src/ui/PreviewShell' から
// 逆にビルド後の出力階層簡潔化のため 'src/ui/PreviewShell' のエントリを維持しつつ Vite のルート=プロジェクトルートなので 'src/...' 形式に変更する。
import PreviewShell from './src/ui/PreviewShell';
import ExternalToggle from './src/ui/ExternalToggle';
import FloatingToggle from './src/ui/FloatingToggle';
import config from './package.json';

// GROWIのスクリプトプラグイン規約：activate/deactivateのみ担当
const PLUGIN_ID = config.name;
const CONTAINER_ID = 'vivlio-preview-container';

function mount() {
  if (document.readyState === 'loading') {
    // GROWI の遅延ロードタイミングで body 未準備だと失敗することがあるため待機
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
    return;
  }
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    document.body.appendChild(host);
  }
  const root = createRoot(host);
  root.render(<>
    <PreviewShell />
    <ExternalToggle />
    <FloatingToggle />
  </>);
  (window as any).__vivlio_root = root; // 後でunmount用に保持
}

function unmount() {
  const root = (window as any).__vivlio_root;
  if (root) {
    root.unmount();
    delete (window as any).__vivlio_root;
  }
  const host = document.getElementById(CONTAINER_ID);
  if (host?.parentNode) host.parentNode.removeChild(host);
}

const activate = () => {
  // 初期は非表示。ユーザー操作で開く（PreviewShell側で制御）
  mount();
};

const deactivate = () => {
  unmount();
};

// GROWIへ登録
if ((window as any).pluginActivators == null) (window as any).pluginActivators = {};
(window as any).pluginActivators[PLUGIN_ID] = { activate, deactivate };
