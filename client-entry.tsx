// client-entry.tsx
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewShell from './src/ui/PreviewShell';
// Plugin-specific preview styles
// import './src/styles/preview.css';
import ExternalToggle from './src/ui/ExternalToggle';
import { AppProvider } from './src/context/AppContext';
import config from './package.json';
import { ensureHostIsolationCss } from './src/vfm/hostIsolation';

// 早期ロード確認ログ (script が読み込まれているか最初に出る)
// eslint-disable-next-line no-console
console.debug('[VivlioDBG][entry] script file evaluated', { time: Date.now(), plugin: config.name });

// GROWIのスクリプトプラグイン規約：activate/deactivateのみ担当
const PLUGIN_ID = config.name;
const CONTAINER_ID = 'vivlio-preview-container';
const PREVIEW_CONTAINER_CANDIDATES = [
  '.page-editor-preview-container',
  '#page-editor-preview-container',
  '.page-editor-preview',
  '.page-editor-preview-body', // 最後の手段: body 自体をホストにしないが存在検知用
];

function getMarkdown(): string {
  // GROWIのエディタからMarkdownを取得
  // CodeMirror 6 (GROWI v6+)
  const cm6 = document.querySelector('.cm-editor') as HTMLElement;
  if (cm6) {
    const view = (cm6 as any).cmView?.view;
    if (view) {
      return view.state.doc.toString();
    }
  }
  // CodeMirror 5 (GROWI v5)
  const cm5 = document.querySelector('.CodeMirror') as HTMLElement;
  if (cm5) {
    const cm = (cm5 as any).CodeMirror;
    if (cm) {
      return cm.getValue();
    }
  }
  // textarea fallback
  const textarea = document.querySelector('textarea#editor, textarea[name="body"]') as HTMLTextAreaElement;
  if (textarea) {
    return textarea.value;
  }
  return '';
}

function locatePreviewContainer(): Element | null {
  // Fast path: prefer the exact inner preview container used by modern GROWI
  const preferred = document.querySelector('.page-editor-preview-container.flex-expand-vert.overflow-y-auto');
  if (preferred) {
    // ensure it's attached and has size
    try {
      const rc = (preferred as HTMLElement).getBoundingClientRect();
      if (rc.width > 0 && rc.height > 0) {
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][locatePreviewContainer] chosen preferred exact selector', { selector: '.page-editor-preview-container.flex-expand-vert.overflow-y-auto', rect: rc });
        return preferred;
      }
    } catch (e) { /* ignore */ }
  }

  for (const sel of PREVIEW_CONTAINER_CANDIDATES) {
    const nodes = Array.from(document.querySelectorAll(sel));
    if (nodes.length === 0) continue;

    // Prefer a visible node that looks like the editor's preview pane.
    const visible = nodes.filter((n) => {
      try {
        const rc = (n as HTMLElement).getBoundingClientRect();
        return rc.width > 0 && rc.height > 0;
      } catch (e) {
        return false;
      }
    });

    // If any visible nodes, prefer the one that contains the usual preview body
    if (visible.length > 0) {
      for (const v of visible) {
        if ((v as Element).querySelector('.page-editor-preview-body') || (v as Element).querySelector('.page-editor-preview')) {
          // eslint-disable-next-line no-console
          console.debug('[VivlioDBG][locatePreviewContainer] chosen visible node with preview body', { sel, candidate: v });
          return v;
        }
      }
      // fallback to first visible
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][locatePreviewContainer] chosen first visible node for selector', { sel, candidate: visible[0] });
      return visible[0];
    }

    // otherwise, take the first node (may be hidden due to responsive classes)
    if (nodes.length > 0) {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][locatePreviewContainer] chosen first node (non-visible) for selector', { sel, candidate: nodes[0] });
      return nodes[0];
    }
  }
  return null;
}

function mount() {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] activate -> mount called, readyState=', document.readyState);
  if (document.readyState === 'loading') {
    // GROWI の遅延ロードタイミングで body 未準備だと失敗することがあるため待機
    document.addEventListener('DOMContentLoaded', () => mount(), { once: true });
    return;
  }

  // --- プレビュー & トグル単一ルートマウント ---
  // Ensure host-side isolation CSS is installed before mounting renderer
  try { ensureHostIsolationCss(); } catch (e) { /* ignore */ }
  const previewContainer = locatePreviewContainer();
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][mount] query preview container', { found: !!previewContainer, candidates: PREVIEW_CONTAINER_CANDIDATES });
  if (!previewContainer) {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][mount] previewContainer not found, retry scheduling (200ms)');
    setTimeout(() => {
      if (!(window as any).__vivlio_root) mount();
    }, 200); // リトライ
    return;
  }
  let host = document.getElementById(CONTAINER_ID);
  if (!host) {
    // Create host wrapper. For stronger isolation we create an iframe and
    // mount the React tree into the iframe's document if possible (srcdoc
    // ensures same-origin). This is a minimal PoC; if iframe createRoot
    // fails we fall back to mounting into the host div in parent document.
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    // base overlay style - display controlled by PreviewShell
    host.style.position = 'absolute';
    host.style.display = 'none';
    host.style.zIndex = '10000';

    // Prefer to append to the stable inner preview container if it matches
    // the exact selector. This allows us to use inset:0 overlay without
    // computing viewport coords and avoids problems when preview is toggled.
    const preferred = document.querySelector('.page-editor-preview-container.flex-expand-vert.overflow-y-auto') as HTMLElement | null;
    // Prefer to mount to body with fixed positioning so the overlay does not
    // follow the inner preview container's scroll. This avoids scroll chaining
    // where editor scrolling would move our overlay.
  document.body.appendChild(host);
    host.dataset.vivlioAttachedTo = 'bodyFixed';
    try {
      if (preferred) {
        const rc = preferred.getBoundingClientRect();
        // position fixed relative to viewport
        host.style.position = 'fixed';
        host.style.left = `${Math.round(rc.left)}px`;
        host.style.top = `${Math.round(rc.top)}px`;
        host.style.width = `${Math.round(rc.width)}px`;
        host.style.height = `${Math.round(rc.height)}px`;
        host.style.zIndex = '10000';
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][mount] host appended to body as fixed overlay', { rect: rc });
      } else {
        // fallback to full-screen fixed overlay
        host.style.position = 'fixed';
        host.style.left = '0';
        host.style.top = '0';
        host.style.right = '0';
        host.style.bottom = '0';
        host.style.width = '100%';
        host.style.height = '100%';
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][mount] host appended to body as fullscreen fixed overlay');
      }
    } catch (e) {
      // fallback append to body (already done)
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][mount] host appended to body (fixed fallback)');
    }
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][mount] host container created');
  }

  let root = (window as any).__vivlio_root;
  if (root) {
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][mount] root already exists - skipping re-create');
  } else {
    // Attempt iframe-based mounting for isolation. Create an iframe and
    // try to mount React into its document. If that fails, fall back to
    // mounting into the host div in the parent document.
    let mountedInIframe = false;
    try {
      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, { width: '100%', height: '100%', border: '0', display: 'block' });
      // minimal same-origin document so we can access contentDocument
      iframe.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><title>Vivlio Preview</title></head><body><div id="vivlio-iframe-root"></div></body></html>';
      // insert iframe into host and wait for load
      host.appendChild(iframe);
      // install minimal styles into iframe once available
      iframe.addEventListener('load', () => {
        try {
          const doc = iframe.contentDocument;
          if (!doc) return;
          // copy our host isolation CSS into iframe head if present
          try {
            const hostStyle = document.getElementById('vivlio-host-isolation') as HTMLStyleElement | null;
            if (hostStyle) {
              const s = doc.createElement('style');
              s.id = hostStyle.id + '-in-iframe';
              s.textContent = hostStyle.textContent || '';
              doc.head.appendChild(s);
            }
          } catch (e) { /* ignore */ }
          const iframeRoot = doc.getElementById('vivlio-iframe-root');
          if (iframeRoot) {
            root = createRoot(iframeRoot as any);
            (window as any).__vivlio_root = root;
            mountedInIframe = true;
            // eslint-disable-next-line no-console
            console.debug('[VivlioDBG][mount] React mounted inside iframe for isolation');
            // render will happen below once root is set
          }
        } catch (e) {
          // ignore and fallback
        }
      }, { once: true });
    } catch (e) {
      // ignore and fallback
    }

    if (!mountedInIframe) {
      root = createRoot(host);
      (window as any).__vivlio_root = root; // 後でunmount用に保持
    }
  }
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][mount] rendering React tree', { hasHost: !!host, childrenBefore: host.childElementCount });
  root.render(
    <React.StrictMode>
      <AppProvider>
        <div style={{ display: 'contents' }}>
          <PreviewShell />
          <ExternalToggle />
        </div>
      </AppProvider>
    </React.StrictMode>
  );
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][mount] mount finished', { hostChildrenAfter: host.childElementCount });

  // Markdown 更新監視
  const updateMarkdown = () => {
    const md = getMarkdown();
    if (md) {
      // AppContext の markdown を更新
      const event = new CustomEvent('vivlio:markdown-updated', { detail: { markdown: md } });
      window.dispatchEvent(event);
    }
  };

  // MutationObserver でエディタ変更を監視
  const observer = new MutationObserver(() => {
    updateMarkdown();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 定期ポーリング (MutationObserver 漏れ対策)
  const pollInterval = setInterval(updateMarkdown, 1000);

  // 初回更新
  updateMarkdown();

  // unmount 用に保存
  (window as any).__vivlio_observer = observer;
  (window as any).__vivlio_pollInterval = pollInterval;
}

function unmount() {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][unmount] called');
  const root = (window as any).__vivlio_root;
  if (root) {
    root.unmount();
    delete (window as any).__vivlio_root;
    // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][unmount] root unmounted');
  }
  const host = document.getElementById(CONTAINER_ID);
  if (host) {
    const attachedTo = host.dataset.vivlioAttachedTo;
    const parent = host.parentElement;
    if (parent && attachedTo === 'previewContainer') {
      // restore previous position if we mutated it
      const prevPos = (parent as HTMLElement).dataset.vivlioPrevPosition;
      if (prevPos !== undefined) {
        (parent as HTMLElement).style.position = prevPos;
        delete (parent as HTMLElement).dataset.vivlioPrevPosition;
      }
    }
    if (host.parentNode) host.parentNode.removeChild(host);
  }

  // 監視クリーンアップ
  const observer = (window as any).__vivlio_observer;
  if (observer) {
    observer.disconnect();
    delete (window as any).__vivlio_observer;
  }
  const pollInterval = (window as any).__vivlio_pollInterval;
  if (pollInterval) {
    clearInterval(pollInterval);
    delete (window as any).__vivlio_pollInterval;
  }
}

const activate = () => {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] activate() invoked', { time: Date.now() });
  mount();
};

const deactivate = () => {
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG] deactivate() invoked', { time: Date.now() });
  unmount();
};

// GROWIへ登録
if ((window as any).pluginActivators == null) (window as any).pluginActivators = {};
(window as any).pluginActivators[PLUGIN_ID] = { activate, deactivate };
// eslint-disable-next-line no-console
console.debug('[VivlioDBG][entry] pluginActivators registered', { id: PLUGIN_ID });

// デバッグ: 3秒後に自動起動 (本来 GROWI が activate を呼ぶが呼ばれないケース調査用)
if (!(window as any).__vivlio_autoActivateTimer) {
  (window as any).__vivlio_autoActivateTimer = setTimeout(() => {
    if (!(window as any).__vivlio_root) {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][entry] auto activating (fallback)');
      activate();
    } else {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][entry] skip auto activate root already present');
    }
  }, 3000);
}

// 手動強制呼び出し用フック
(window as any).__vivlio_forceActivate = activate;
(window as any).__vivlio_forceUnmount = unmount;
