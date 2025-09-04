// client-entry.tsx（全面書き直し：編集モード検出ロジック）
// TypeScript を前提。@growi/pluginkit はビルド時に使います。

/**
 * 依存:
 *  - GROWI 本体が注入するグローバル growiFacade
 *  - window.pluginActivators への登録というプラグイン標準の起動フロー
 * 参考: 公式ドキュメント「スクリプトプラグインを開発する」
 * https://docs.growi.org/ja/dev/plugin/script.html
 */

type AnyFn = (...args: any[]) => any;

// 必要最小限の型（@growi/core の型定義にも対応あり）
type GrowiFacade = {
  markdownRenderer?: {
    optionsGenerators?: {
      // 既定のオプション生成
      generateViewOptions?: AnyFn;
      generatePreviewOptions?: AnyFn;
      // プラグインが差し替えるためのフック
      customGenerateViewOptions?: AnyFn;
      customGeneratePreviewOptions?: AnyFn;
    };
  };
  react?: any;
};

// GROWI がグローバルに露出させている facade（実行時に存在）
declare const growiFacade: GrowiFacade;

// どこからでも読めるように（必要なければ外す）
declare global {
  interface Window {
    __MY_PLUGIN_STATE__?: {
      isEditPreview: boolean;
      lastMode: 'view' | 'preview' | null;
    };
    pluginActivators?: Record<
      string,
      { activate: () => void; deactivate: () => void }
    >;
  }
}

const PLUGIN_NAME = 'growi-plugin-vivliostyle-preview';

// 保存しておく元の関数
let originalCustomGenerateViewOptions: AnyFn | undefined;
let originalCustomGeneratePreviewOptions: AnyFn | undefined;

// 初期化ヘルパ
function ensureState() {
  if (!window.__MY_PLUGIN_STATE__) {
    window.__MY_PLUGIN_STATE__ = { isEditPreview: false, lastMode: null };
  }
  return window.__MY_PLUGIN_STATE__;
}

// ===== プラグイン本体 =====
const activate = (): void => {
  // GROWI 側がまだ準備できていないケースの防御
  if (
    growiFacade == null ||
    growiFacade.markdownRenderer == null ||
    growiFacade.markdownRenderer.optionsGenerators == null
  ) {
    return;
  }

  const { optionsGenerators } = growiFacade.markdownRenderer;

  // 既存を退避（他プラグインがすでに差し込んでいる可能性もある）
  originalCustomGenerateViewOptions = optionsGenerators.customGenerateViewOptions;
  originalCustomGeneratePreviewOptions =
    optionsGenerators.customGeneratePreviewOptions;

  // ---- View（閲覧）用フック ----
  optionsGenerators.customGenerateViewOptions = (...args: any[]) => {
    const state = ensureState();
    state.isEditPreview = false;
    state.lastMode = 'view';

    // 既存の custom を尊重し、なければ generate を呼ぶ
    const base =
      originalCustomGenerateViewOptions ??
      optionsGenerators.generateViewOptions;
    const viewOptions = base ? base(...args) : {};

    // ここに「閲覧時だけ有効にしたい処理」を書く
    // 例: viewOptions.remarkPlugins.push(myRemarkPlugin);

    return viewOptions;
  };

  // ---- Preview（編集プレビュー）用フック ----
  optionsGenerators.customGeneratePreviewOptions = (...args: any[]) => {
    const state = ensureState();
    state.isEditPreview = true; // ★ これが「今は編集画面」判定
    state.lastMode = 'preview';

    // 既存の custom を尊重し、なければ generate を呼ぶ
    const base =
      originalCustomGeneratePreviewOptions ??
      optionsGenerators.generatePreviewOptions;
    const previewOptions = base ? base(...args) : {};

    // ここに「編集プレビュー時だけ有効にしたい処理」を書く
    // 例: previewOptions.rehypePlugins.push(myRehypePlugin);

    return previewOptions;
  };

  // 任意：わかりやすいようログ
  const s = ensureState();
  // eslint-disable-next-line no-console
  console.log(`[${PLUGIN_NAME}] activated. initial state:`, s);
};

const deactivate = (): void => {
  if (
    growiFacade?.markdownRenderer?.optionsGenerators
  ) {
    const { optionsGenerators } = growiFacade.markdownRenderer;
    // フックを元に戻す（クリーンアップ）
    if (originalCustomGenerateViewOptions) {
      optionsGenerators.customGenerateViewOptions =
        originalCustomGenerateViewOptions;
    }
    if (originalCustomGeneratePreviewOptions) {
      optionsGenerators.customGeneratePreviewOptions =
        originalCustomGeneratePreviewOptions;
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[${PLUGIN_NAME}] deactivated.`);
};

// 起動フローへ登録（公式の手順）
if (window.pluginActivators == null) {
  window.pluginActivators = {};
}
window.pluginActivators[PLUGIN_NAME] = {
  activate,
  deactivate,
};

// 便利なユーティリティ（他ファイルから使いたい場合など）
export function isEditingNow(): boolean {
  return !!window.__MY_PLUGIN_STATE__?.isEditPreview;
}