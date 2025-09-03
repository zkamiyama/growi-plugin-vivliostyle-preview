// client-entry.tsx
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import PreviewShell from './src/ui/PreviewShell';
import { AppProvider } from './src/context/AppContext';
import config from './package.json';

// GROWIのスクリプトプラグイン規約：activate/deactivateのみ担当
const PLUGIN_ID = config.name;
const CONTAINER_ID = 'vivlio-preview-container';

// ボタン挿入関連変数 (旧単一実装から移植)
let toggleInitialized = false;
let currentMode: 'markdown' | 'vivlio' = 'markdown';
let toggleBtn: HTMLButtonElement | null = null;
let findControlAttempts = 0;
const LOG_PREFIX = '[vivlio:min]';

// 旧単一実装のボタン挿入ロジック移植
function findViewEditButton(): HTMLButtonElement | null {
  // data-testid 優先 (GROWI 新UI)
  const editById = document.querySelector('[data-testid="editor-button"]') as HTMLButtonElement | null;
  const viewById = document.querySelector('[data-testid="view-button"]') as HTMLButtonElement | null;
  let target: HTMLElement | null = editById || viewById;

  if (!target) {
    const btns = Array.from(document.querySelectorAll('button, a.btn')) as HTMLElement[];
    target = btns.find(b => /Edit$/i.test((b.textContent||'').replace(/\s+/g,' ').trim())) ||
             btns.find(b => /View$/i.test((b.textContent||'').replace(/\s+/g,' ').trim())) || null;
  }

  if (findControlAttempts < 30) {
    findControlAttempts++;
    try {
      const btns = Array.from(document.querySelectorAll('button, a.btn')) as HTMLElement[];
      const sampled = btns.slice(0, 12).map(b => {
        const raw=(b.textContent||'').replace(/\s+/g,' ').trim();
        const tail = raw.slice(-20);
        return tail;
      }).join(' | ');
      console.debug(LOG_PREFIX, 'findViewEditButton attempt', findControlAttempts, 'targetFound:', !!target, 'sample tails:', sampled);
    } catch {}
  }
  return target as HTMLButtonElement | null;
}

function initVivlioToggle() {
  if (toggleInitialized) return;
  console.debug(LOG_PREFIX, 'initVivlioToggle attempt');

  // 既存のトグルボタンがあるか確認
  const existing = document.querySelector('.vivlio-toggle-btn') as HTMLButtonElement | null;
  if (existing) {
    console.debug(LOG_PREFIX, 'existing toggle found, skipping');
    toggleBtn = existing;
    toggleInitialized = true;
    return;
  }

  const targetBtn = findViewEditButton();
  if (!targetBtn) {
    console.debug(LOG_PREFIX, 'View/Edit button not found');
    return;
  }

  console.debug(LOG_PREFIX, 'inserting toggle after button:', targetBtn.textContent?.trim());

  // トグルボタンを作成
  toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn btn-sm btn-outline-secondary vivlio-toggle-btn';
  toggleBtn.textContent = 'Vivliostyle';
  toggleBtn.setAttribute('data-bs-toggle','button');
  toggleBtn.onclick = () => setMode(currentMode === 'vivlio' ? 'markdown' : 'vivlio');

  // 文字はみ出し対策: 確実なスタイル設定
  Object.assign(toggleBtn.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '90px',
    maxWidth: '120px',
    padding: '4px 12px',
    fontSize: '13px',
    lineHeight: '1.2',
    whiteSpace: 'nowrap',
    overflow: 'visible',
    wordBreak: 'keep-all',
    textOverflow: 'clip',
    marginLeft: '6px',
    flex: '0 0 auto'
  });

  // 直接同一グループ内 (または親コンテナ) に挿入して表示崩れを最小化
  const parent = targetBtn.parentElement || document.body;
  parent.insertBefore(toggleBtn, targetBtn.nextSibling);

  // スタイル調整 (軽微調整のみ、基本スタイルは上で設定済み)
  tuneToggleStyle(toggleBtn, targetBtn);

  toggleInitialized = true;
  updateToggleActive();

  console.debug(LOG_PREFIX, 'toggle button inserted successfully');
}

function tuneToggleStyle(btn: HTMLButtonElement, referenceBtn: HTMLElement){
  try {
    console.debug(LOG_PREFIX, 'tuning toggle style from reference:', referenceBtn.textContent?.trim());

    // 参照ボタンからスタイルコピー (軽微調整のみ)
    const cs = getComputedStyle(referenceBtn);

    // 高さのみ参照 (幅や padding は上で確実に設定済み)
    if (cs.height && cs.height !== 'auto') {
      btn.style.minHeight = cs.height;
    }

    // フォントサイズ調整
    if (cs.fontSize) {
      btn.style.fontSize = cs.fontSize;
    }

    console.debug(LOG_PREFIX, 'applied minimal style adjustments - fontSize:', cs.fontSize, 'height:', cs.height);
  } catch(e) {
    console.warn(LOG_PREFIX, 'tuneToggleStyle error:', e);
  }
}

function updateToggleActive() {
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', currentMode === 'vivlio');
    toggleBtn.classList.toggle('btn-primary', currentMode === 'vivlio');
    toggleBtn.classList.toggle('btn-outline-secondary', currentMode !== 'vivlio');
  }
}

function setMode(m:'markdown'|'vivlio') {
  if (m === currentMode) return;
  currentMode = m;
  updateToggleActive();
  // モード変更をAppContextに通知 (必要に応じて)
  if (m === 'vivlio') {
    // Vivliostyleモードに切り替え
    (window as any).dispatchEvent(new CustomEvent('vivlio:mode-changed', { detail: { mode: m } }));
  } else {
    (window as any).dispatchEvent(new CustomEvent('vivlio:mode-changed', { detail: { mode: m } }));
  }
}

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
  root.render(
    <AppProvider>
      <PreviewShell />
    </AppProvider>
  );
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
  // DOM操作でボタンを挿入
  setTimeout(() => initVivlioToggle(), 100);
};

const deactivate = () => {
  unmount();
};

// GROWIへ登録
if ((window as any).pluginActivators == null) (window as any).pluginActivators = {};
(window as any).pluginActivators[PLUGIN_ID] = { activate, deactivate };
