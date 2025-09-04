/* client-entry.tsx — fix for vivliostyle-preview button mounting/leakage
   ポイント:
   - GROWI 公式の optionsGenerators（View/Preview）にフック
   - シングルトン ButtonManager でマウント/アンマウントを厳密管理
   - SPA遷移を意識し、モード切替時に必ずクリーンアップ
   参考: 公式「Developing script plugins」, テンプレ/実装例（Qiita/Dev.to）
*/

declare global {
  interface Window {
    pluginActivators?: Record<
      string,
      { activate: () => void; deactivate: () => void }
    >;
  }
}

type AnyFn = (...args: any[]) => any;

type ViewOptions = {
  components?: Record<string, any>;
  remarkPlugins?: any[];
  rehypePlugins?: any[];
};

type OptionsGenerators = {
  generateViewOptions?: (...args: any[]) => ViewOptions;
  generatePreviewOptions?: (...args: any[]) => ViewOptions;
  customGenerateViewOptions?: (...args: any[]) => ViewOptions;
  customGeneratePreviewOptions?: (...args: any[]) => ViewOptions;
};

type GrowiFacade = {
  markdownRenderer?: {
    optionsGenerators?: OptionsGenerators;
  };
};

// GROWI が実行時に与える
declare const growiFacade: GrowiFacade;

// =========================
// 設定値
// =========================
const PLUGIN_NAME = 'growi-plugin-vivliostyle-preview';
const BTN_ROOT_ID = 'vivlio-preview-floating-button-root';
const SHOW_IN_VIEW = false; // ← 閲覧画面でも表示したければ true に

// =========================
// ButtonManager（単一管理）
// =========================
const ButtonManager = (() => {
  let mounted = false;
  let currentMode: 'preview' | 'view' | null = null;

  function ensureRoot(): HTMLElement {
    let el = document.getElementById(BTN_ROOT_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = BTN_ROOT_ID;
      // 最低限のスタイル（テーマ依存を回避）
      el.style.position = 'fixed';
      el.style.right = '20px';
      el.style.bottom = '20px';
      el.style.zIndex = '2147483647'; // 最前面
      document.body.appendChild(el);
    }
    return el;
  }

  function renderButton(mode: 'preview' | 'view') {
    const root = ensureRoot();
    root.innerHTML = ''; // 再描画前にクリア（React 未使用の素朴実装）
    const btn = document.createElement('button');
    btn.textContent =
      mode === 'preview' ? 'Vivliostyleプレビュー' : 'Vivliostyle（閲覧）';
    // 依存の少ない見た目
    btn.style.padding = '10px 14px';
    btn.style.borderRadius = '6px';
    btn.style.border = '1px solid #999';
    btn.style.background = mode === 'preview' ? '#165dff' : '#666';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
    btn.setAttribute('type', 'button');

    // 実際の挙動：現在ページを Vivliostyle Viewer に渡す（必要に応じて調整）
    btn.addEventListener('click', () => {
      // ここは既存実装のロジックに置き換えてください
      // 例: location.href を Vivliostyle Viewer の URL に組み込む 等
      const url = new URL(location.href);
      // サンプル: クエリを付けて新窓で開く
      url.searchParams.set('vivlio', '1');
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    });

    root.appendChild(btn);
  }

  return {
    mount(mode: 'preview' | 'view') {
      // 閲覧では表示しない設定なら即 return
      if (mode === 'view' && !SHOW_IN_VIEW) {
        this.unmount();
        currentMode = 'view';
        return;
      }
      renderButton(mode);
      mounted = true;
      currentMode = mode;
    },
    unmount() {
      const el = document.getElementById(BTN_ROOT_ID);
      if (el && el.parentElement) {
        el.parentElement.removeChild(el);
      }
      mounted = false;
      currentMode = null;
    },
    isMounted() {
      return mounted;
    },
    getMode() {
      return currentMode;
    },
  };
})();

// =========================
// プラグイン起動/停止
// =========================
let originalView: AnyFn | undefined;
let originalPreview: AnyFn | undefined;

function activate() {
  const og = growiFacade?.markdownRenderer?.optionsGenerators;
  if (!og) return;

  // 既存退避
  originalView = og.customGenerateViewOptions ?? og.generateViewOptions;
  originalPreview = og.customGeneratePreviewOptions ?? og.generatePreviewOptions;

  // --- 閲覧 ---
  og.customGenerateViewOptions = (...args: any[]) => {
    try {
      // 閲覧に入った時点でプレビュー用のボタンは消す（症状Aの根治）
      ButtonManager.unmount();
      // 必要なら閲覧でもマウント
      ButtonManager.mount('view');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[${PLUGIN_NAME}] view mount error`, e);
    }
    const base = originalView ?? (() => ({}));
    return base(...args);
  };

  // --- プレビュー（編集） ---
  og.customGeneratePreviewOptions = (...args: any[]) => {
    try {
      // プレビューに入ったら必ずマウント（症状Bの根治）
      ButtonManager.mount('preview');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[${PLUGIN_NAME}] preview mount error`, e);
    }
    const base = originalPreview ?? (() => ({}));
    return base(...args);
  };

  // eslint-disable-next-line no-console
  console.log(`[${PLUGIN_NAME}] activated`);
}

function deactivate() {
  try {
    ButtonManager.unmount();
  } catch {
    // noop
  }
  const og = growiFacade?.markdownRenderer?.optionsGenerators;
  if (og) {
    if (originalView) og.customGenerateViewOptions = originalView;
    if (originalPreview) og.customGeneratePreviewOptions = originalPreview;
  }
  // eslint-disable-next-line no-console
  console.log(`[${PLUGIN_NAME}] deactivated`);
}

// GROWI 規約に沿って登録
if (!window.pluginActivators) window.pluginActivators = {};
window.pluginActivators[PLUGIN_NAME] = { activate, deactivate };

export {};
