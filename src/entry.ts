// (neutralized) legacy file intentionally left blank
// @ts-nocheck
import { createMd, parseWithCss } from './markdown';
import { buildSrcDoc } from './viewerHost';

const RUNTIME_BUILD_ID = (typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : Date.now().toString());
const RUNTIME_BUILD_TIME = (typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString());
// Persistent diagnostic markers (avoid minifier removal by bracket access & template string parts)
(() => { const tag = '[VIVLIO_DEV]'; console.info(tag + ' bundle loaded', { id: RUNTIME_BUILD_ID, time: RUNTIME_BUILD_TIME }); })();

const md = createMd();
let iframe: HTMLIFrameElement | null = null;
let lastSrc = '';
let debounceTimer: number | null = null;
let tabsInitialized = false;
let currentMode: 'markdown' | 'vivlio' = 'markdown';
let markdownPanel: HTMLElement | null = null;
let vivlioPanel: HTMLElement | null = null;
let detectedMarkdownPreview: HTMLElement | null = null;
let attachPollId: number | null = null;
const detachFns: Array<() => void> = [];
let vivlioReady = false;

function ensureIframe(): HTMLIFrameElement {
  if (iframe && document.body.contains(iframe)) return iframe;
  iframe = document.createElement('iframe');
  Object.assign(iframe.style, { width:'100%',height:'100%',border:'0',background:'#fff'});
  iframe.srcdoc = buildSrcDoc();
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
  debounceTimer = window.setTimeout(()=>{ const {html, css}=parseWithCss(md, lastSrc); post(html, css); }, 250);
}

// Candidate selectors for preview container (robustness)
const PREVIEW_CONTAINER_SELECTORS = [
  '.page-editor-preview-container',
  '.page-editor-preview-body',
  '.grw-editor-preview',
  '[data-testid="page-editor-preview"]'
];

function findPreviewContainer(): HTMLElement | null {
  for (const sel of PREVIEW_CONTAINER_SELECTORS) {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (el) return sel === '.page-editor-preview-body' && el.parentElement ? el.parentElement as HTMLElement : el;
  }
  return null;
}

function initTabsIfPossible(){
  if (tabsInitialized || stopAutoInit) return;
  detectedMarkdownPreview = findPreviewContainer();
  if(!detectedMarkdownPreview) {
    initRetry += 1;
    // ログを抑えつつ状況を追跡
    console.debug('[VIVLIO_DEV][init] preview container not found', { retry: initRetry });
    if (initRetry >= MAX_INIT_RETRY) {
      stopAutoInit = true;
      // eslint-disable-next-line no-console
      console.warn('[VIVLIO_DEV] preview init: max retries reached, stopping further attempts');
    }
    return;
  }
  if (detectedMarkdownPreview.closest('.vivlio-preview-wrapper')) { tabsInitialized=true; return; }
  let target = detectedMarkdownPreview;
  const innerBody = detectedMarkdownPreview.querySelector('.page-editor-preview-body');
  if (innerBody) target = innerBody as HTMLElement;
  const wrapper = document.createElement('div'); wrapper.className='vivlio-preview-wrapper'; Object.assign(wrapper.style,{width:'100%',height:'100%',display:'flex',flexDirection:'column'});
  const tabs = document.createElement('ul'); tabs.className='nav nav-tabs vivlio-tabs'; tabs.style.flexShrink='0';
  const mdLi=document.createElement('li'); mdLi.className='nav-item'; const mdBtn=document.createElement('button'); mdBtn.type='button'; mdBtn.className='nav-link active'; mdBtn.textContent='Markdown'; mdBtn.onclick=()=>setMode('markdown'); mdLi.appendChild(mdBtn);
  const vvLi=document.createElement('li'); vvLi.className='nav-item'; const vvBtn=document.createElement('button'); vvBtn.type='button'; vvBtn.className='nav-link'; vvBtn.textContent='Vivliostyle'; vvBtn.onclick=()=>setMode('vivlio'); vvLi.appendChild(vvBtn);
  tabs.appendChild(mdLi); tabs.appendChild(vvLi);
  const panels=document.createElement('div'); panels.className='vivlio-panels'; Object.assign(panels.style,{position:'relative',flex:'1 1 auto',minHeight:'0'});
  markdownPanel=document.createElement('div'); markdownPanel.className='markdown-panel'; Object.assign(markdownPanel.style,{width:'100%',height:'100%',overflow:'auto'});
  vivlioPanel=document.createElement('div'); vivlioPanel.className='vivlio-panel'; Object.assign(vivlioPanel.style,{width:'100%',height:'100%',overflow:'hidden',display:'none'});
  const parent = target.parentElement; if(!parent) return; parent.insertBefore(wrapper, target); markdownPanel.appendChild(target); panels.appendChild(markdownPanel); panels.appendChild(vivlioPanel); wrapper.appendChild(tabs); wrapper.appendChild(panels);
  tabsInitialized=true; updateTabActive();
  console.info('[VIVLIO_DEV] tabs initialized');
}

function updateTabActive(){
  const tabsRoot = document.querySelector('.vivlio-tabs'); if(!tabsRoot) return;
  const links = tabsRoot.querySelectorAll('.nav-link'); links.forEach(l=>{ const isViv = /vivlio/i.test(l.textContent||''); l.classList.toggle('active', (isViv && currentMode==='vivlio')||(!isViv && currentMode==='markdown')); });
  if(markdownPanel&&vivlioPanel){ markdownPanel.style.display=currentMode==='markdown'?'block':'none'; vivlioPanel.style.display=currentMode==='vivlio'?'block':'none'; }
}

function setMode(m:'markdown'|'vivlio'){
  if (m===currentMode) return; currentMode=m; if(m==='vivlio'){ ensureIframe(); if(!lastSrc){ const t=tryReadEditorText(); if(t) lastSrc=t; } scheduleRender(lastSrc||'# Vivliostyle Preview'); } updateTabActive(); }

function tryReadEditorText(): string | null {
  // 1) CM5 instance via DOM (preferred over DOM text)
  try {
    const cmHost = document.querySelector('.CodeMirror') as any;
    if (cmHost && cmHost.CodeMirror && typeof cmHost.CodeMirror.getValue === 'function') {
      return cmHost.CodeMirror.getValue();
    }
  } catch {}
      const ta = document.querySelector('textarea[name="markdown"], textarea.markdown-body, textarea') as HTMLTextAreaElement | null;
      if (ta) return ta.value;
  try {
    const EditorView = (window as any).EditorView || (window as any).CodeMirror?.EditorView;
    const cmRoot = document.querySelector('.cm-editor') as HTMLElement | null;
    if (EditorView && cmRoot && typeof EditorView.findFromDOM === 'function') {
      const view = EditorView.findFromDOM(cmRoot);
      if (view && view.state) {
        if (view.state.doc && typeof view.state.doc.toString === 'function') return view.state.doc.toString();
        if (typeof view.state.sliceDoc === 'function') return view.state.sliceDoc();
      }
    }
  } catch {}

  // 3) Textarea fallback
  try {
    const ta = document.querySelector('textarea[name="markdown"], textarea.markdown-body, textarea') as HTMLTextAreaElement | null;
    if (ta) return ta.value;
  } catch {}

  return null;
}

    const cmHost = document.querySelector('.CodeMirror') as any;
    if (cmHost && cmHost.CodeMirror) {
      const cm = cmHost.CodeMirror as any;
      const h = () => { try { scheduleRender(cm.getValue()); } catch (e) { console.warn('[VIVLIO_DEV] cm change error', e); } };
      try {
        cm.on('change', h);
        disposers.push(() => { try { cm.off('change', h); } catch {} });
        scheduleRender(cm.getValue());
      } catch (e) {
        // If instance API not usable, fall back to polling
        const p = window.setInterval(() => { try { scheduleRender(cm.getValue()); } catch {} }, 500);
        disposers.push(() => clearInterval(p));
      }
    }
      cm.on('change',h); disposers.push(()=>{ try{ cm.off('change',h);}catch{} });
      scheduleRender(cm.getValue());
    }
    const EditorView = (window as any).EditorView || (window as any).CodeMirror?.EditorView;
    const cm6root = document.querySelector('.cm-editor') as HTMLElement | null;
    if (EditorView && cm6root && typeof EditorView.findFromDOM === 'function') {
      const view = EditorView.findFromDOM(cm6root);
      if (view && view.state) {
        const read = () => { try {
          const txt = view.state.doc && typeof view.state.doc.toString === 'function' ? view.state.doc.toString() : (typeof view.state.sliceDoc === 'function' ? view.state.sliceDoc() : '');
          scheduleRender(txt);
        } catch (e) { /* ignore */ } };
        read();
        try {
          if (EditorView.updateListener && typeof EditorView.updateListener.of === 'function') {
            const listener = EditorView.updateListener.of((u: any) => { if (u.docChanged) read(); });
            try { view.dispatch?.({ effects: (window as any).StateEffect?.appendConfig?.of(listener) }); }
            catch { /* append failed: fallback to poll */ }
            // best-effort no-op cleanup
            disposers.push(() => { /* noop */ });
          } else {
            const p = window.setInterval(read, 500);
            disposers.push(() => clearInterval(p));
          }
        } catch (e) {
          const p = window.setInterval(read, 500);
          disposers.push(() => clearInterval(p));
        }
      }
    } else {
      // previous DOM-based fallback: contenteditable element
      const cm6 = document.querySelector('.cm-content[contenteditable="true"]');
      if (cm6) {
        const handler = () => { scheduleRender(cm6.textContent || ''); };
        cm6.addEventListener('input', handler);
        disposers.push(() => cm6.removeEventListener('input', handler));
        scheduleRender(cm6.textContent || '');
      }
    }
      scheduleRender(cm6.textContent||'');
    }
  }catch{}
  try {
    const ta=document.querySelector('textarea[name="markdown"], textarea.markdown-body, textarea');
    if(ta){ const handler=()=>{ scheduleRender((ta as HTMLTextAreaElement).value); }; ta.addEventListener('input',handler); disposers.push(()=>ta.removeEventListener('input',handler)); scheduleRender((ta as HTMLTextAreaElement).value); }
  }catch{}
  if(disposers.length){ detachFns.push(...disposers); console.info('[VIVLIO_DEV] editor listeners attached'); return true; }
  return false;
}

let domObserver: MutationObserver | null = null;

let initRetry = 0;
const MAX_INIT_RETRY = 8; // 最大リトライ回数
let stopAutoInit = false;

function activate(){
  if((window as any).__VIVLIO_PREVIEW_ACTIVE__) { console.info('[VIVLIO_DEV] already active'); return; }
  (window as any).__VIVLIO_PREVIEW_ACTIVE__=true;
  (window as any).__VIVLIO_PREVIEW__={ scheduleRender };
  console.info('[VIVLIO_DEV] activate', { build: RUNTIME_BUILD_ID });
  window.addEventListener('message',e=>{ if(e.data?.type==='VIVLIO_READY'){ vivlioReady=true; console.info('[VIVLIO_DEV] iframe ready'); if(lastSrc){ const {html,css}=parseWithCss(md, lastSrc); post(html,css);} }});
  // Initial attempt
  initTabsIfPossible();
  attachEditorListeners();
  // Poll fallback (some DOM arrives later)
  attachPollId=window.setInterval(()=>{
    if (stopAutoInit) { if (attachPollId) { clearInterval(attachPollId); attachPollId = null; } return; }
    if(!tabsInitialized) initTabsIfPossible();
    if(!detachFns.length && attachEditorListeners()){ /* attached */ }
    if(tabsInitialized && detachFns.length){ if(attachPollId) clearInterval(attachPollId); attachPollId = null; }
  },1000);
  // MutationObserver for dynamic re-render / preview container replacement
  try {
    domObserver = new MutationObserver(()=>{ if(!tabsInitialized) initTabsIfPossible(); });
    domObserver.observe(document.body, { childList:true, subtree:true });
    detachFns.push(()=>{ try{ domObserver && domObserver.disconnect(); }catch{} });
  }catch{}
}

function deactivate(){ console.info('[VIVLIO_DEV] deactivate'); if(iframe){ iframe.remove(); iframe=null;} if(attachPollId) clearInterval(attachPollId); detachFns.forEach(f=>f()); detachFns.length=0; try{ domObserver && domObserver.disconnect(); }catch{} domObserver=null; delete (window as any).__VIVLIO_PREVIEW__; delete (window as any).__VIVLIO_PREVIEW_ACTIVE__; }

if(!(window as any).pluginActivators) (window as any).pluginActivators={};
(window as any).pluginActivators['growi-plugin-vivliostyle-preview-dev']={ activate, deactivate };
console.info('[VIVLIO_DEV] registered activator');

// Global runtime error capture to aid debugging in production/minified builds.
try {
  (window as any).__vivlio_lastError = null;
  window.addEventListener('error', (e) => {
    try { (window as any).__vivlio_lastError = { type: 'error', message: e.message, filename: (e.filename || null), lineno: (e.lineno || null), colno: (e.colno || null), error: (e.error && e.error.stack) ? e.error.stack : e.error } } catch (err) { /* ignore */ }
  });
  window.addEventListener('unhandledrejection', (e) => {
    try { (window as any).__vivlio_lastError = { type: 'unhandledrejection', reason: e.reason, stack: e.reason && e.reason.stack ? e.reason.stack : null } } catch (err) { /* ignore */ }
  });
} catch (e) { /* ignore */ }
