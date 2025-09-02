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
let tabsInitialized = false;
let currentMode: 'markdown' | 'vivlio' = 'markdown';
let markdownPanel: HTMLElement | null = null;
let vivlioPanel: HTMLElement | null = null;
let detectedMarkdownPreview: HTMLElement | null = null;
let attachPollId: number | null = null;
const detachFns: Array<() => void> = [];

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

function initTabsIfPossible() {
  if (tabsInitialized) return;
  const previewContainer = document.querySelector('.page-editor-preview-container');
  if (!previewContainer) return;

  if (previewContainer.closest('.vivlio-preview-wrapper') || previewContainer.querySelector('.vivlio-preview-wrapper')) {
    tabsInitialized = true;
    return;
  }

  let target: HTMLElement | DocumentFragment;
  let parent: HTMLElement;

  const previewBody = previewContainer.querySelector('.page-editor-preview-body');

  if (previewBody) {
    // .page-editor-preview-body が見つかった場合、それをターゲットにする
    target = previewBody;
    parent = previewBody.parentElement;
    if (!parent || target.closest('.vivlio-preview-wrapper')) return;
  } else if (previewContainer.hasChildNodes()) {
    // .page-editor-preview-body がなく、コンテナに子要素がある場合
    // 子要素を DocumentFragment にまとめてターゲットにする
    const fragment = document.createDocumentFragment();
    while (previewContainer.firstChild) {
      fragment.appendChild(previewContainer.firstChild);
    }
    target = fragment;
    parent = previewContainer;
  } else {
    return; // レンダリング前なので待機
  }

  if (!parent) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'vivlio-preview-wrapper';
  Object.assign(wrapper.style, { width: '100%', height: '100%', display: 'flex', flexDirection: 'column' });

  const tabs = document.createElement('ul');
  tabs.className = 'nav nav-tabs vivlio-tabs';
  tabs.style.flexShrink = '0';

  const mdLi = document.createElement('li');
  mdLi.className = 'nav-item';
  const mdBtn = document.createElement('button');
  mdBtn.type = 'button';
  mdBtn.className = 'nav-link active';
  mdBtn.textContent = 'Markdown';
  mdBtn.onclick = () => setMode('markdown');
  mdLi.appendChild(mdBtn);

  const vvLi = document.createElement('li');
  vvLi.className = 'nav-item';
  const vvBtn = document.createElement('button');
  vvBtn.type = 'button';
  vvBtn.className = 'nav-link';
  vvBtn.textContent = 'Vivliostyle';
  vvBtn.onclick = () => setMode('vivlio');
  vvLi.appendChild(vvBtn);

  tabs.appendChild(mdLi);
  tabs.appendChild(vvLi);

  const panels = document.createElement('div');
  panels.className = 'vivlio-panels';
  Object.assign(panels.style, { position: 'relative', flex: '1 1 auto', minHeight: '0' });

  markdownPanel = document.createElement('div');
  markdownPanel.className = 'markdown-panel';
  Object.assign(markdownPanel.style, { width: '100%', height: '100%', overflow: 'auto' });

  vivlioPanel = document.createElement('div');
  vivlioPanel.className = 'vivlio-panel';
  Object.assign(vivlioPanel.style, { width: '100%', height: '100%', overflow: 'hidden', display: 'none' });

  // markdownPanel にターゲット (previewBody または子要素のフラグメント) を追加
  markdownPanel.appendChild(target);

  panels.appendChild(markdownPanel);
  panels.appendChild(vivlioPanel);
  wrapper.appendChild(tabs);
  wrapper.appendChild(panels);

  // 親要素 (previewBodyの親 または previewContainer) にラッパーを追加
  parent.appendChild(wrapper);

  tabsInitialized = true;
  updateTabActive();
}

function updateTabActive(){
  const tabsRoot = document.querySelector('.vivlio-tabs'); if(!tabsRoot) return;
  const links = tabsRoot.querySelectorAll('.nav-link'); links.forEach(l=>{ const isViv = /vivlio/i.test(l.textContent||''); l.classList.toggle('active', (isViv && currentMode==='vivlio')||(!isViv && currentMode==='markdown')); });
  if(markdownPanel&&vivlioPanel){ markdownPanel.style.display=currentMode==='markdown'?'block':'none'; vivlioPanel.style.display=currentMode==='vivlio'?'block':'none'; }
}

function setMode(m:'markdown'|'vivlio'){
  if (m===currentMode) return; currentMode=m; if(m==='vivlio'){ ensureIframe(); if(!lastSrc){ const t=tryReadEditorText(); if(t) lastSrc=t; } scheduleRender(lastSrc||'# Vivliostyle Preview'); } updateTabActive(); }

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
  attachPollId=window.setInterval(()=>{ initTabsIfPossible(); if(tryAttach()){ if(attachPollId) clearInterval(attachPollId);} },1000);
}

function deactivate(){ if(iframe){ iframe.remove(); iframe=null;} if(attachPollId) clearInterval(attachPollId); detachFns.forEach(f=>f()); detachFns.length=0; delete (window as any).__VIVLIO_PREVIEW__; delete (window as any).__VIVLIO_PREVIEW_ACTIVE__; }

// GROWI plugin activator 登録
if(!(window as any).pluginActivators) (window as any).pluginActivators={};
(window as any).pluginActivators[config.name]={ activate, deactivate };
console.log('[vivlio:min] registered');

export {};
