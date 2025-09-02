// --- Vivliostyle Preview (recovered & simplified) ---------------------------------
// @ts-nocheck  (最小安定版: 型エラーでビルド阻害しないため一時的に全チェック無効化)
// 目的: 白画面化を解消する最小安定コード。viewer の初期化レースを避けるため iframe 内で
// queue => viewer script 注入 => viewer.viewer 出現ポーリング => render の順序を保証。

// (renamed copy note) 元ファイル内容。build が参照していない可能性が高い。
import MarkdownIt from 'markdown-it';
// @ts-ignore
import markdownItRuby from 'markdown-it-ruby';
// @ts-ignore
import viewerRaw from '@vivliostyle/viewer/lib/js/vivliostyle-viewer.js?raw';
// @ts-ignore
import cssViewer from '@vivliostyle/viewer/lib/css/vivliostyle-viewer.css?raw';
// @ts-ignore
import cssArrows from '@vivliostyle/viewer/lib/css/ui.arrows.css?raw';
// @ts-ignore
import cssMenu from '@vivliostyle/viewer/lib/css/ui.menu-bar.css?raw';
// @ts-ignore
import cssMsg from '@vivliostyle/viewer/lib/css/ui.message-dialog.css?raw';
// @ts-ignore
import cssLoading from '@vivliostyle/viewer/lib/css/ui.loading-overlay.css?raw';
// @ts-ignore
import cssSelMenu from '@vivliostyle/viewer/lib/css/ui.text-selection-menu.css?raw';
import config from './package.json';

// build script が置換するパターンを維持
export const BUILD_ID = 'LOCAL_PLACEHOLDER';
console.log('[vivlio:min] BUILD_ID', BUILD_ID);
// MARKER: simplified-impl test (should appear in dist if this file is used)
console.log('[vivlio:min] __MARKER_SIMPLE_IMPL__');
// Second marker
console.log('[vivlio:min] __MARKER_SIMPLE_IMPL_2__');
(globalThis as any).__SIMPLE_IMPL_ACTIVE__ = true;

const md = new MarkdownIt({ html: true, linkify: true }).use(markdownItRuby);
const EMBED_CSS_LANGS = ['vivlio-css','vivliostyle','css:vivlio','css-vivlio'];

let iframe: HTMLIFrameElement | null = null;
let vivlioReady = false;
let lastSrc = '';
let debounceTimer: number | null = null;

// タブ UI 状態
let toggleInitialized = false;
let currentMode: 'markdown' | 'vivlio' = 'markdown';
let vivlioPanel: HTMLElement | null = null;
let toggleBtn: HTMLButtonElement | null = null;
let attachPollId: number | null = null;
const detachFns: Array<() => void> = [];
let findControlAttempts = 0;
const LOG_PREFIX = '[vivlio:min]';

function renderMarkdownWithEmbeddedCss(src: string){
  try {
  const tokens = md.parse(src, {});
  // debug (disabled for build stability)
  // (debug token summary removed)
    let css: string | null = null;
    for (let i=0;i<tokens.length;i++){
      const t = tokens[i];
      if (t.type==='fence' && t.info){
        const lang = t.info.trim().split(/\s+/)[0].toLowerCase();
        if (EMBED_CSS_LANGS.includes(lang)) { css=(t.content||'').trim(); tokens.splice(i,1); break; }
      }
    }
    const html = md.renderer.render(tokens, md.options, {});
    return { html, css };
  } catch(e){ console.warn('[vivlio:min] markdown parse error', e); return { html: md.render(src), css: null }; }
}

function ensureIframe(): HTMLIFrameElement {
  if (iframe && document.body.contains(iframe)) return iframe;
  iframe = document.createElement('iframe');
  Object.assign(iframe.style, { width:'100%',height:'100%',border:'0',background:'#fff'});
  const styleBundle = [cssViewer,cssArrows,cssMenu,cssMsg,cssLoading,cssSelMenu].map(c=>`<style>${c}</style>`).join('\n');
  // viewerRaw を生で template literal に埋め込むとバッククォート/制御文字で SyntaxError が出る可能性があるため base64 エンコード
  const viewerB64 = btoa(unescape(encodeURIComponent(viewerRaw)));
  iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"/>${styleBundle}<style>html,body{margin:0;height:100%;}#log{position:fixed;bottom:0;left:0;right:0;max-height:35%;overflow:auto;font:11px monospace;background:#000c;color:#0f0;padding:4px;display:none;white-space:pre-wrap;}#vs-status{position:fixed;top:4px;left:4px;font:12px system-ui;background:#fff;border:1px solid #ccc;padding:2px 6px;border-radius:4px;}#fallbackHtml{position:absolute;inset:0;overflow:auto;font:14px system-ui;display:none;padding:12px;}</style></head><body><div id="vivliostyle-viewer-viewport" data-vivliostyle-viewer-viewport></div><div id="vivliostyle-menu-bar"></div><div id="vivliostyle-message-dialog"></div><div id="vs-status">boot</div><pre id="log"></pre><div id="fallbackHtml"></div><script>(function(){
  const status=document.getElementById('vs-status');
  const logEl=document.getElementById('log');
  const fallbackEl=document.getElementById('fallbackHtml');
  function setStatus(s){ if(status) status.textContent=s; }
  function log(m){ try{ if(logEl){ logEl.style.display='block'; logEl.textContent += m+'\n'; if(logEl.textContent.length>10000) logEl.textContent = logEl.textContent.slice(-8000);} }catch{} }
  let pending=null; let ready=false; let lastUrl=null;
  window.addEventListener('message',e=>{ const d=e.data; if(!d||d.type!=='HTML_FULL') return; if(!ready){ pending=d; log('queue msg'); } else { render(d); } });
  function render(d){ try{ const htmlDoc = d.full || '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'+(d.html||'')+'</body></html>'; if(lastUrl) try{URL.revokeObjectURL(lastUrl);}catch{}; const blob=new Blob([htmlDoc],{type:'text/html'}); const url=URL.createObjectURL(blob); lastUrl=url; location.hash='#src='+encodeURIComponent(url); try{ if(window.VivliostyleViewer&&window.VivliostyleViewer.viewer&&window.VivliostyleViewer.viewer.load){ window.VivliostyleViewer.viewer.load(url); } }catch(ex){ log('viewer.load fail '+ex); } setStatus('render'); }catch(ex){ log('render err '+ex); fallback(d.full || d.html || ''); }}
  function fallback(htmlDoc){ try{ if(fallbackEl){ fallbackEl.innerHTML=htmlDoc; fallbackEl.style.display='block'; setStatus('fallback'); } }catch(err){ log('fallback err '+err); } }
  function poll(){ let c=0; const iv=setInterval(()=>{ c++; if(window.VivliostyleViewer&&window.VivliostyleViewer.viewer){ clearInterval(iv); ready=true; setStatus('ready'); parent.postMessage({type:'VIVLIO_READY'},'*'); if(pending){ const d=pending; pending=null; render(d);} } else if(c>200){ clearInterval(iv); setStatus('timeout'); log('viewer timeout'); } },100); }
  function inject(){ setStatus('inject'); try{ var raw=decodeURIComponent(escape(atob('${viewerB64}'))); }catch(e){ setStatus('b64-decode-error'); log('b64 decode error '+e); return; } const blob=new Blob([raw],{type:'text/javascript'}); const u=URL.createObjectURL(blob); const s=document.createElement('script'); s.src=u; s.onload=()=>{ URL.revokeObjectURL(u); setStatus('script'); poll(); }; s.onerror=e=>{ setStatus('err'); log('script err'); }; document.head.appendChild(s);} inject(); })();</script></body></html>`;
  if (vivlioPanel) { vivlioPanel.innerHTML=''; vivlioPanel.appendChild(iframe); } else document.body.appendChild(iframe);
  return iframe;
}

function buildFullDoc(html: string, css?: string|null){
  const userCss = css ? css : '';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+userCss+'</style></head><body>'+html+'</body></html>';
}

function post(html: string, css?: string | null){
  const f=ensureIframe();
  if(!f.contentWindow) return;
  const full = buildFullDoc(html, css);
  f.contentWindow.postMessage({type:'HTML_FULL', html, css, full}, '*');
}

function scheduleRender(src: string){
  lastSrc = src;
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(()=>{ const {html, css}=renderMarkdownWithEmbeddedCss(lastSrc); post(html, css); }, 250);
}

let originalPreviewBody: HTMLElement | null = null;

function ensurePreviewBodies() {
  if (originalPreviewBody && originalPreviewBody.isConnected) return true;
  const container = document.querySelector('.page-editor-preview-container');
  if (!container) return false;
  originalPreviewBody = container.querySelector('.page-editor-preview-body') as HTMLElement | null;
  if (!originalPreviewBody) {
    if (container.firstElementChild) originalPreviewBody = container.firstElementChild as HTMLElement;
  }
  if (!originalPreviewBody) return false;
  // Vivlio パネル未生成なら作成して隣に配置
  if (!vivlioPanel || !vivlioPanel.isConnected) {
    vivlioPanel = document.createElement('div');
    vivlioPanel.className = 'vivlio-panel';
    Object.assign(vivlioPanel.style, { width:'100%', height:'100%', overflow:'hidden', display:'none' });
    originalPreviewBody.after(vivlioPanel);
  }
  return true;
}

function findControlContainer(): HTMLElement | null {
  // 候補セレクタを網羅的に試す (GROWI バージョン差異吸収)
  const selectors = [
    '.grw-page-controls .btn-group',
    '.grw-page-controls',
    '.page-editor-mode-manager .btn-group',
    '.page-editor-mode-manager',
    '.page-editor-navbar .btn-group',
    '.page-editor-navbar',
    '#page-operation-control .btn-group',
    '#page-operation-control',
    '.btn-toolbar .btn-group',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) return el;
  }
  // 新: 動的ハッシュ付きクラス (例: EditorNavbar_editor-navbar__liqCr) への対応
  // class 名に editor-navbar を含む最上位要素を探索
  const dynNavs = Array.from(document.querySelectorAll('[class*="editor-navbar"]')) as HTMLElement[];
  for (const nav of dynNavs) {
    // 子に View/Edit ボタン相当があるか軽くチェック
    const hasViewEdit = !!nav.querySelector('button, a.btn');
    if (hasViewEdit) return nav;
  }
  // Fallback: View/Edit ボタンを直接探して親を利用
  const btns = Array.from(document.querySelectorAll('button, a.btn')) as HTMLElement[];
  const ve = btns.find(b => /^(View|Edit)$/i.test((b.textContent||'').trim()));
  if (ve) return ve.parentElement as HTMLElement | null;
  if (findControlAttempts < 20) {
    findControlAttempts++;
    try {
      // 早期デバッグ: 上位付近の候補をダンプ
      const dumpTargets = Array.from(document.querySelectorAll('[class*="editor"], [class*="navbar"], header'))
        .slice(0, 6)
        .map(el => (el as HTMLElement).className)
        .join(' | ');
      console.debug(LOG_PREFIX,'control-container not found attempt', findControlAttempts, 'dump=', dumpTargets);
    } catch {}
  }
  return null;
}

// View / Edit ボタンのグループ(最も右の操作ボタングループ) を優先的に返す
function refineToButtonGroup(base: HTMLElement | null): HTMLElement | null {
  if (!base) return null;
  // 既に btn-group なら採用
  if (/(^|\s)btn-group(\s|$)/.test(base.className)) return base;
  // 内側に複数の btn-group があれば、View/Edit を含む最後のもの
  const groups = Array.from(base.querySelectorAll('.btn-group')) as HTMLElement[];
  if (groups.length) {
    const viewEditGroups = groups.filter(g => /View|Edit/i.test(g.textContent||''));
    if (viewEditGroups.length) return viewEditGroups[viewEditGroups.length - 1];
    return groups[groups.length - 1];
  }
  // ボタンが横並びならその親を使う
  const editBtn = Array.from(base.querySelectorAll('button, a.btn')).find(b => /Edit/i.test((b.textContent||'').trim()));
  if (editBtn && editBtn.parentElement) return editBtn.parentElement as HTMLElement;
  return base;
}

function initVivlioToggle() {
  if (toggleInitialized) return;
  if (!ensurePreviewBodies()) return; // プレビュー未描画なら後で再試行
  let controls = findControlContainer();
  if (!controls) return;
  controls = refineToButtonGroup(controls) || controls;
  if (!controls) return;
  // 既に間違った場所(外側)に巨大ボタンとして存在する場合は移動
  const existing = document.querySelector('.vivlio-toggle-btn') as HTMLButtonElement | null;
  if (existing && existing.parentElement !== controls) {
    controls.appendChild(existing);
    toggleBtn = existing;
    toggleInitialized = true;
    tuneToggleStyle(existing, controls);
    updateToggleActive();
    return;
  }
  if (controls.querySelector('.vivlio-toggle-btn')) { toggleInitialized = true; return; }
  toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'btn btn-sm btn-outline-secondary vivlio-toggle-btn';
  toggleBtn.style.marginLeft = '6px';
  toggleBtn.style.flex = '0 0 auto';
  toggleBtn.style.whiteSpace = 'nowrap';
  toggleBtn.textContent = 'Vivliostyle';
  toggleBtn.setAttribute('data-bs-toggle','button');
  toggleBtn.onclick = () => setMode(currentMode === 'vivlio' ? 'markdown' : 'vivlio');
  controls.appendChild(toggleBtn);
  tuneToggleStyle(toggleBtn, controls);
  toggleInitialized = true;
  updateToggleActive();
}

function tuneToggleStyle(btn: HTMLButtonElement, controls: HTMLElement){
  try {
    // Edit ボタンからサイズ感コピー (padding / font-size)
    const edit = Array.from(controls.querySelectorAll('button, a.btn')).find(b => /Edit/i.test((b.textContent||'').trim())) as HTMLElement | undefined;
    if (edit) {
      const cs = getComputedStyle(edit);
      btn.style.padding = cs.padding;
      btn.style.fontSize = cs.fontSize;
      btn.style.lineHeight = cs.lineHeight;
      btn.style.height = cs.height;
    }
    // 親が flex-column の場合は一行維持のため親を flex-row 化 (安全策: data 属性で一度だけ)
    const parent = controls.closest('[class*="flex-column"]') as HTMLElement | null;
    if (parent && !parent.dataset.vivlioNavFixed) {
      parent.dataset.vivlioNavFixed = '1';
      parent.style.display = 'flex';
      parent.style.flexDirection = 'row';
      parent.style.flexWrap = 'nowrap';
      parent.style.alignItems = 'center';
    }
  } catch {}
}

function updateToggleActive() {
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', currentMode === 'vivlio');
    toggleBtn.classList.toggle('btn-primary', currentMode === 'vivlio');
    toggleBtn.classList.toggle('btn-outline-secondary', currentMode !== 'vivlio');
  }
  if (originalPreviewBody && vivlioPanel) {
    originalPreviewBody.style.display = currentMode === 'markdown' ? '' : 'none';
    vivlioPanel.style.display = currentMode === 'vivlio' ? 'block' : 'none';
  }
}

function setMode(m:'markdown'|'vivlio') {
  if (m === currentMode) return;
  currentMode = m;
  if (m === 'vivlio') {
    ensurePreviewBodies();
    ensureIframe();
    if (!lastSrc) { const t = tryReadEditorText(); if (t) lastSrc = t; }
    scheduleRender(lastSrc || '# Vivliostyle Preview');
  }
  updateToggleActive();
}

function tryReadEditorText(): string | null {
  try { const cmHost=document.querySelector('.CodeMirror'); if(cmHost && (cmHost as any).CodeMirror) return (cmHost as any).CodeMirror.getValue(); } catch{}
  try { const ta=document.querySelector('textarea'); if(ta) return (ta as HTMLTextAreaElement).value; } catch{}
  try { const cm6=document.querySelector('.cm-content[contenteditable="true"]'); if(cm6) return cm6.textContent||''; } catch{}
  return null;
}

function activate(){
  if((window as any).__VIVLIO_PREVIEW_ACTIVE__) return;
  (window as any).__VIVLIO_PREVIEW_ACTIVE__=true;
  (window as any).__VIVLIO_PREVIEW__={ scheduleRender };
  window.addEventListener('message',e=>{ if(e.data?.type==='VIVLIO_READY'){ vivlioReady=true; if(lastSrc){ const {html,css}=renderMarkdownWithEmbeddedCss(lastSrc); post(html,css);} }});
  function tryAttach(){ const cmHost=document.querySelector('.CodeMirror'); if(cmHost && (cmHost as any).CodeMirror){ const cm=(cmHost as any).CodeMirror; const h=()=>{ try{ scheduleRender(cm.getValue()); }catch{} }; cm.on('change',h); detachFns.push(()=>{ try{ cm.off('change',h);}catch{} }); try{ scheduleRender(cm.getValue()); }catch{} return true;} return false; }
  attachPollId = window.setInterval(()=>{
    try { initVivlioToggle(); } catch {}
    if (tryAttach()) { if (attachPollId) clearInterval(attachPollId); }
  }, 800);
}

function deactivate(){ if(iframe){ iframe.remove(); iframe=null;} if(attachPollId) clearInterval(attachPollId); detachFns.forEach(f=>f()); detachFns.length=0; delete (window as any).__VIVLIO_PREVIEW__; delete (window as any).__VIVLIO_PREVIEW_ACTIVE__; }

// GROWI plugin activator 登録
if(!(window as any).pluginActivators) (window as any).pluginActivators={};
(window as any).pluginActivators[config.name]={ activate, deactivate };
console.log('[vivlio:min] registered');

export {};
