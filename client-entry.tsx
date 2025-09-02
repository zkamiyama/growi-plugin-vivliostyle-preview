// --- Vivliostyle Preview (recovered & simplified) ---------------------------------
// @ts-nocheck  (最小安定版: 型エラーでビルド阻害しないため一時的に全チェック無効化)
// 目的: 白画面化を解消する最小安定コード。viewer の初期化レースを避けるため iframe 内で
// queue => viewer script 注入 => viewer.viewer 出現ポーリング => render の順序を保証。

// (renamed copy note) 元ファイル内容。build が参照していない可能性が高い。
// TEMP: will refactor; import auxiliary minimal plugin (renders non-paginated HTML via growiFacade when available)
// import './src/plugin.ts';  // Disabled mini scaffold plugin to avoid persistent placeholder
import MarkdownIt from 'markdown-it';
// @ts-ignore
import markdownItRuby from 'markdown-it-ruby';
// @ts-ignore
// viewerRaw / CSS インライン埋め込みは廃止し静的ホスト HTML + CDN ロードへ移行
import config from './package.json';
// @ts-ignore
import viewerRaw from '@vivliostyle/viewer/lib/js/vivliostyle-viewer.js?raw';
// @ts-ignore
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

// build script が置換するパターンを維持
export const BUILD_ID = 'BUILD_2025_0903_1742';
console.log('[vivlio:min] BUILD_ID', BUILD_ID);
// MARKER: simplified-impl test (should appear in dist if this file is used)
console.log('[vivlio:min] __MARKER_ROBUST_IMPL__');
// Second marker
console.log('[vivlio:min] __MARKER_ROBUST_IMPL_2__');
(globalThis as any).__ROBUST_IMPL_ACTIVE__ = true;

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
let extButtonGroup: HTMLElement | null = null; // 追加ボタン用グループ
let lastPageWidthPx: number | null = null; // 推定ページ幅 (px)
let resizeObs: ResizeObserver | null = null;
// (spinner removed)
let keyForceListenerAdded = false;
// spinnerShowTimer removed
let lastPostedSrc: string | null = null;    // 直近 post 済み Markdown ソース (重複 skip)
let resizeWinHandlerAdded = false;          // 既存: ビューワー幅 50% ルール用
let responsivePrevCollapsed = false;        // 直近プレビュー折畳み状態
let responsiveSavedMode: 'markdown'|'vivlio'|null = null; // 折畳み前 vivlio の復元用
let responsiveResizeListenerAdded = false;  // レスポンシブ監視追加済みフラグ

function ensureHostSpinnerKeyframes(){
  try {
    if(document.getElementById('vivlio-host-spinner-style')) return;
    const st=document.createElement('style');
    st.id='vivlio-host-spinner-style';
    st.textContent='@keyframes vivlio-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  } catch{}
}

function renderMarkdownWithEmbeddedCss(src: string){
  if (!src || typeof src !== 'string') {
    console.warn('[vivlio:min] invalid markdown input:', typeof src);
    return { html: '', css: null };
  }
  
  try {
    const tokens = md.parse(src, {});
    if (!Array.isArray(tokens)) {
      console.warn('[vivlio:min] unexpected tokens type:', typeof tokens);
      return { html: md.render(src), css: null };
    }
    
    let css: string | null = null;
    // CSS fenced block 検索とトークン除去 (堅牢化)
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i];
      if (t && t.type === 'fence' && t.info) {
        const lang = String(t.info).trim().split(/\s+/)[0].toLowerCase();
        if (EMBED_CSS_LANGS.includes(lang)) { 
          css = String(t.content || '').trim(); 
          tokens.splice(i, 1); 
          break; 
        }
      }
    }
    
    const html = md.renderer.render(tokens, md.options, {});
    if (typeof html !== 'string') {
      console.warn('[vivlio:min] unexpected html type:', typeof html);
      return { html: String(html || ''), css };
    }
    
    return { html, css };
  } catch(e) { 
    console.warn('[vivlio:min] markdown parse error', e); 
    // フォールバック: 元文字列をそのまま render
    try {
      return { html: md.render(src), css: null };
    } catch(e2) {
      console.error('[vivlio:min] fallback render also failed', e2);
      return { html: `<pre>${src}</pre>`, css: null };
    }
  }
}

function ensureIframe(): HTMLIFrameElement {
  if (iframe && document.body.contains(iframe)) return iframe;
  iframe = document.createElement('iframe');
  Object.assign(iframe.style, { width:'100%',height:'100%',border:'0',background:'#fff'});
  const styleBundle = [cssViewer,cssArrows,cssMenu,cssMsg,cssLoading,cssSelMenu].map(c=>`<style>${c}</style>`).join('\n');
  const toBlob = (txt:string)=>{ try { return URL.createObjectURL(new Blob([txt],{type:'text/javascript'})); } catch { return ''; } };
  const viewerUrl = toBlob(viewerRaw);
  const control = `/* vivlio control (diag enhanced v2) */\n(function(){\n  const log=(m)=>{ try{console.log('[vivlio:host]',m);}catch{} };\n  let lastBlob=null; let pending=null; let booted=false; let firstApplied=false;\n  try{ window.onerror=function(msg,src,line,col,err){ try{ parent.postMessage({type:'VIVLIO_IFRAME_ERROR',msg:String(msg),src,line,col,stack:err&&err.stack},'*'); }catch{} }; window.addEventListener('unhandledrejection',e=>{ try{ parent.postMessage({type:'VIVLIO_IFRAME_UNHANDLED',reason:(e.reason&&e.reason.message)||String(e.reason)},'*'); }catch{} }); }catch{}\n  try { if(!location.hash.includes('src=')){ const empty=URL.createObjectURL(new Blob(['<!DOCTYPE html><html><head><meta charset=\\"utf-8\\"></head><body></body></html>'],{type:'text/html'})); location.hash='#src='+encodeURIComponent(empty)+'&bookMode=true'; log('pre-seeded empty src'); } } catch{}\n  function revoke(){ if(lastBlob) try{ URL.revokeObjectURL(lastBlob); }catch{} }\n  function mk(full){ revoke(); const b=new Blob([full],{type:'text/html'}); lastBlob=URL.createObjectURL(b); return lastBlob; }\n  function build(d){ return d.full||'<!DOCTYPE html><html><head><meta charset=\\"utf-8\\"></head><body>'+(d.html||'')+'</body></html>'; }\n  function showFallback(full){ try{ const m=full.match(/<body[^>]*>([\\s\\S]*?)<\\/body>/i); const body=m?m[1]:full; const fb=document.getElementById('fallbackHtml'); if(fb){ // v2: 常に最新版を反映 (編集中も更新)
      fb.innerHTML=body; fb.style.display='block'; } }catch(e){ log('fallback err '+e); } }\n  function apply(d){ const f=build(d); const u=mk(f); location.hash='#src='+encodeURIComponent(u)+'&bookMode=true'; showFallback(f); firstApplied=true; log('hash set len='+f.length); try{ window.dispatchEvent(new Event('hashchange')); }catch{} }\n  window.addEventListener('message',e=>{ const d=e.data; if(!d||d.type!=='HTML_FULL') return; pending=d; try{ if(d.full) showFallback(d.full); else if(d.html) showFallback(build(d)); }catch{} if(booted){ apply(d); } });\n  function markBooted(){ if(booted) return; booted=true; log('booted'); if(pending) apply(pending); pollPages(); }\n  function pollReady(){ let c=0; const iv=setInterval(()=>{ c++; const g=(window).VivliostyleViewer||(window).vivliostyle; const st=document.body.getAttribute('data-vivliostyle-viewer-status'); if((g||st) && !booted){ markBooted(); } if(c>1000){ clearInterval(iv); if(!booted){ log('viewer global/status not found'); parent.postMessage({type:'VIVLIO_IFRAME_DIAG', note:'noGlobal'},'*'); } } },30); }\n  function pollPages(){ let c=0; const iv=setInterval(()=>{ c++; const pc=document.querySelectorAll('[data-vivliostyle-page-container]').length; const st=document.body.getAttribute('data-vivliostyle-viewer-status'); if(pc>0||st){ clearInterval(iv); log('ready pages='+pc+' status='+st); if(pc>0){ try{ const fb=document.getElementById('fallbackHtml'); if(fb) fb.style.display='none'; }catch{} parent.postMessage({type:'VIVLIO_RENDER_DONE', pages:pc},'*'); } else { parent.postMessage({type:'VIVLIO_RENDER_DONE', note:'noPagesYet status '+st},'*'); } } else if(c>300){ clearInterval(iv); log('timeout pages poll'); parent.postMessage({type:'VIVLIO_RENDER_DONE', error:'timeout'},'*'); } },160); }\n  const s1=document.createElement('script'); s1.type='text/javascript'; s1.src='${viewerUrl}'; s1.onload=()=>{ log('viewer loaded'); try{ parent.postMessage({type:'VIVLIO_IFRAME_DIAG', event:'scriptOnload'},'*'); }catch{}; try{ const keys=Object.keys(window).filter(k=>/vivlio|Vivlio|viewer/i.test(k)).slice(0,50); parent.postMessage({type:'VIVLIO_IFRAME_KEYS', keys},'*'); }catch{} pollReady(); }; s1.onerror=()=>{ log('viewer load error'); try{ parent.postMessage({type:'VIVLIO_IFRAME_ERROR', msg:'load error', src:s1.src},'*'); }catch{} }; document.head.appendChild(s1);\n})();`;
  const escCtrl = control.replace(/<\/script>/gi,'<\\/script>');
  iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset=\"utf-8\"/>${styleBundle}<style>html,body{margin:0;height:100%;}#fallbackHtml{position:absolute;inset:0;overflow:auto;font:14px system-ui;display:none;background:#fff;padding:12px;}#vivliostyle-menu-bar{display:none!important;}#vivliostyle-viewer-viewport{top:0!important;background:#fff;}</style></head><body><div id=\"vivliostyle-viewer\"></div><div id=\"vivliostyle-viewer-viewport\" data-vivliostyle-viewer-viewport></div><div id=\"vivliostyle-menu-bar\"></div><div id=\"vivliostyle-message-dialog\"></div><div id=\"fallbackHtml\"></div><script>${escCtrl}</script></body></html>`;
  if (vivlioPanel) { vivlioPanel.innerHTML=''; vivlioPanel.appendChild(iframe); } else document.body.appendChild(iframe);
  return iframe;
}

function buildFullDoc(html: string, css?: string|null){
  let userCss = css ? css : '';
  // デフォルト組版 CSS (ユーザー未指定時) - @page が存在しないなら基本サイズ付与
  if(!/@page\b/.test(userCss)){
  // A5 デフォルト (ユーザーCSS未指定時) ※ユーザーが上書きできるよう下に連結
  const defaultPage = `@page { size: A5; margin: 15mm; }`;
  const defaultBody = `body { font: 11pt/1.5 serif; widows:2; orphans:2; }`;
  userCss = `${defaultPage}\n${defaultBody}\n` + userCss;
  }
  // (暫定) vivliostyle が連続スクロールになるケース診断用: 強制ページ化ヘルパークラス追加
  // NOTE: 仕様外になる恐れがあるため後で除去予定。
  userCss += `\n/* diag: enforce paged layout */\nhtml, body { overflow: visible !important; }\n`;
  userCss += `\n/* diag: explicit break hints */\nsection, h1, h2, h3, h4, h5, h6 { break-after: avoid-page; }\n`;
  try{ lastPageWidthPx = estimatePageWidthPx(userCss) || lastPageWidthPx; }catch{}
  const full = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>'+userCss+'</style></head><body>'+html+'</body></html>';
  return full;
}

// @page size から幅(px) を推定 (A4 / 210mm など)。96dpi前提。
function estimatePageWidthPx(css: string): number | null {
  // プリセット (横幅 mm)
  const preset: Record<string, number> = { a5:148, a4:210, a3:297, b5:182, b4:257, 'jis-b5':182, 'jis-b4':257, letter:216, legal:216 };
  const m = css.match(/@page[^}]*size\s*:[^;]*;/i);
  if(!m) return null;
  const decl = m[0];
  // 形式1: size: A4;
  const kw = decl.match(/size\s*:\s*([a-z0-9-]+)/i);
  if(kw){ const key = kw[1].toLowerCase(); if(preset[key]) return mmToPx(preset[key]); }
  // 形式2: size: 210mm 297mm; or 210mm,297mm; or 210mm 297mm portrait
  const dims = decl.match(/(\d+(?:\.\d+)?)(mm|cm|in)\s*[ ,]\s*(\d+(?:\.\d+)?)(mm|cm|in)/i);
  if(dims){
    const w = parseFloat(dims[1]); const wu = dims[2].toLowerCase();
    return unitToPx(w, wu);
  }
  return null;
}
function unitToPx(v:number, u:string){ switch(u){ case 'mm': return mmToPx(v); case 'cm': return mmToPx(v*10); case 'in': return v*96; default: return v; } }
function mmToPx(mm:number){ return mm/25.4*96; }

function post(html: string, css?: string | null){
  const f=ensureIframe();
  if(!f.contentWindow) return;
  lastPostedSrc = lastSrc;
  // --- 追加計測: Markdown -> HTML 長さ, CSS 長さ, 全文長さ ---
  try { console.debug('[vivlio:diag] post start',{ mdLen: (lastSrc||'').length, htmlLen: html.length, cssLen: css? css.length: 0 }); } catch {}
  // ページ幅推定があれば iframe 幅固定 + 中央寄せ
  if(lastPageWidthPx){
    try {
      const pageW = Math.round(lastPageWidthPx);
      // 初期実装に近い: パネル中央固定 (横幅不足ならスクロールではなく余白削減を避けるため auto overflow)
      f.style.width = pageW + 'px';
      f.style.minWidth = pageW + 'px';
      f.style.maxWidth = pageW + 'px';
      f.style.boxShadow = '0 0 6px rgba(0,0,0,.3)';
      f.style.background = '#fff';
      f.style.display = 'block';
      f.style.margin = '0 auto';
      if(vivlioPanel){
        vivlioPanel.style.display='flex';
        vivlioPanel.style.background='#5a5a5a';
        vivlioPanel.style.padding='8px 0'; // 水平余白 0 -> 背景を必須幅に含めない
        vivlioPanel.style.justifyContent='center';
        vivlioPanel.style.alignItems='flex-start';
        vivlioPanel.style.overflowX='auto';
        vivlioPanel.style.overflowY='auto';
        // 50% ルール適用
        const halfWin = Math.floor(window.innerWidth * 0.5);
        if(pageW > halfWin){
          vivlioPanel.style.width = halfWin + 'px';
          vivlioPanel.style.maxWidth = halfWin + 'px';
        } else {
          vivlioPanel.style.width=''; vivlioPanel.style.maxWidth='';
        }
  // spinner removed
        if(!resizeWinHandlerAdded){
          const onResize=()=>{
            if(!vivlioPanel) return;
            const hw=Math.floor(window.innerWidth*0.5);
            if(lastPageWidthPx && lastPageWidthPx>hw){
              vivlioPanel.style.width=hw+'px'; vivlioPanel.style.maxWidth=hw+'px';
            } else { vivlioPanel.style.width=''; vivlioPanel.style.maxWidth=''; }
          };
          window.addEventListener('resize', onResize);
          detachFns.push(()=>window.removeEventListener('resize', onResize));
          resizeWinHandlerAdded=true;
        }
      }
    } catch{}
  }
  const full = buildFullDoc(html, css);
  try { (window as any).__VIVLIO_LAST_FULL_LEN__ = full.length; } catch {}
  // 1st phase: まだ viewer Ready でなければ fallbackHtml 埋め込みを命令 (即時表示)
  try { (f as any).contentWindow.__VIV_LAST_FULL_HTML__ = full; } catch {}
  // vivlioReady になるまでは progressive=true で iframe 内 fallback 埋め込みを可視化
  f.contentWindow.postMessage({type:'HTML_FULL', html, css, full, progressive: !vivlioReady}, '*');
}

function immediateRender(){
  if(!lastSrc) return;
  try {
    const {html, css} = renderMarkdownWithEmbeddedCss(lastSrc);
    post(html, css);
  } catch {}
}

function scheduleRender(src: string){
  if(src===lastPostedSrc) return; // 重複不要
  lastSrc = src;
  if (debounceTimer) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(()=>{ const {html, css}=renderMarkdownWithEmbeddedCss(lastSrc); post(html, css); }, 80);
}

function isPreviewActuallyVisible(): boolean {
  try {
    const cont = document.querySelector('.page-editor-preview-container') as HTMLElement | null;
    if(!cont) return false;
    const cs = getComputedStyle(cont);
    if(cs.display==='none' || cs.visibility==='hidden') return false;
    if(cont.offsetWidth===0 || cont.offsetHeight===0) return false;
    return true;
  } catch { return false; }
}

function checkResponsiveLayout(){
  const visible = isPreviewActuallyVisible();
  if(!visible){
    if(!responsivePrevCollapsed){
      responsivePrevCollapsed=true;
      if(currentMode==='vivlio'){
        responsiveSavedMode='vivlio';
        currentMode='markdown';
      }
      if(toggleBtn){ try{ toggleBtn.remove(); }catch{} }
      toggleBtn=null; toggleInitialized=false;
      if(vivlioPanel){ vivlioPanel.style.visibility='hidden'; vivlioPanel.style.pointerEvents='none'; }
    }
  } else {
    if(responsivePrevCollapsed){
      responsivePrevCollapsed=false;
      try { ensurePreviewBodies(); } catch{}
      try { initVivlioToggle(); } catch{}
      if(responsiveSavedMode==='vivlio'){
        responsiveSavedMode=null;
        try { setMode('vivlio'); } catch{ setTimeout(()=>{ try{ setMode('vivlio'); }catch{} },80); }
      } else { updateToggleActive(); }
      const snap = tryReadEditorText(); if(snap) scheduleRender(snap);
    } else {
      if(currentMode==='vivlio' && lastSrc){ try { post(renderMarkdownWithEmbeddedCss(lastSrc).html, null); } catch{} }
    }
  }
}

function attachAllEditorListeners(): boolean {
  let attached=false;
  try { const cmHost=document.querySelector('.CodeMirror'); if(cmHost && (cmHost as any).CodeMirror){ const cm=(cmHost as any).CodeMirror; if(!(cm as any).__vivlioHooked){ const h=()=>{ try{ scheduleRender(cm.getValue()); }catch{} }; cm.on('change',h); detachFns.push(()=>{ try{ cm.off('change',h);}catch{} }); (cm as any).__vivlioHooked=true; attached=true; } } }catch{}
  try { const cm6=document.querySelector('.cm-content[contenteditable="true"]'); if(cm6 && !(cm6 as any).__vivlioHooked){ const h=()=>{ scheduleRender(cm6.textContent||''); }; cm6.addEventListener('input',h); detachFns.push(()=>cm6.removeEventListener('input',h)); (cm6 as any).__vivlioHooked=true; attached=true; } }catch{}
  try { const ta=document.querySelector('textarea[name="markdown"], textarea.markdown-body, textarea'); if(ta && !(ta as any).__vivlioHooked){ const h=()=>{ scheduleRender((ta as HTMLTextAreaElement).value); }; ta.addEventListener('input',h); detachFns.push(()=>ta.removeEventListener('input',h)); (ta as any).__vivlioHooked=true; attached=true; } }catch{}
  if(attached){ const snap=tryReadEditorText(); if(snap) scheduleRender(snap); }
  return attached;
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
    // オーバーレイ方式: レイアウト崩しによるエディタスクロール移動を避ける
    // container or originalPreviewBody の親を position:relative にし、vivlioPanel を absolute で重ねる
    const host = originalPreviewBody.parentElement || container;
    if (host && getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }
    vivlioPanel = document.createElement('div');
    vivlioPanel.className = 'vivlio-panel';
    Object.assign(vivlioPanel.style, {
      position:'absolute',
      inset:'0',
      width:'100%',
      height:'100%',
      overflow:'hidden',
      display:'block',
      visibility:'hidden',
      background:'#fff'
    });
    host.appendChild(vivlioPanel);
  // 旧: A4 幅 minWidth 強制は削除。狭い画面では 50% ルール + パネル内スクロールで対応。
    // original は display を弄らず visibility で切替 (高さ維持)
  }
  return true;
}


// 単純化: View/Edit ボタンを直接探してその直後に挿入
function findViewEditButton(): HTMLButtonElement | null {
  // data-testid 優先 (GROWI 最新 UI)
  const editById = document.querySelector('[data-testid="editor-button"]') as HTMLButtonElement | null;
  const viewById = document.querySelector('[data-testid="view-button"]') as HTMLButtonElement | null;
  let target: HTMLElement | null = editById || viewById;

  const btns = Array.from(document.querySelectorAll('button, a.btn')) as HTMLElement[];
  if (!target) {
    // icon span のテキスト (play_arrow / edit_square 等) が前に付くため末尾一致で判定
    target = btns.find(b => /Edit$/i.test((b.textContent||'').replace(/\s+/g,' ').trim())) ||
             btns.find(b => /View$/i.test((b.textContent||'').replace(/\s+/g,' ').trim())) || null;
  }

  if (findControlAttempts < 30) {
    findControlAttempts++;
    try {
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
  if (!ensurePreviewBodies()) return; // プレビュー未描画なら後で再試行
  
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

  // (A4 擬似トグル削除)
  
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
    
    // 親コンテナのflex調整 (必要な場合のみ)
    const parent = btn.parentElement;
    if (parent) {
      const parentCs = getComputedStyle(parent);
      if (parentCs.flexDirection === 'column') {
        console.debug(LOG_PREFIX, 'converting parent from flex-column to flex-row');
        parent.style.flexDirection = 'row';
        parent.style.flexWrap = 'wrap';
        parent.style.alignItems = 'center';
        parent.style.gap = '6px';
      }
    }
  } catch(e) {
    console.warn(LOG_PREFIX, 'tuneToggleStyle error:', e);
  }
}

// 公開 API: 追加ボタンを extButtonGroup に登録
function registerExtraButton(opts: { id?: string; label: string; onClick: () => void; title?: string; className?: string; }) {
  if (!toggleInitialized) { try { initVivlioToggle(); } catch {} }
  if (!extButtonGroup) return null;
  const id = opts.id || 'vivlio-extra-' + Math.random().toString(36).slice(2,8);
  if (extButtonGroup.querySelector(`#${id}`)) return extButtonGroup.querySelector(`#${id}`);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = id;
  btn.className = opts.className || 'btn btn-sm btn-outline-secondary';
  btn.textContent = opts.label;
  if (opts.title) btn.title = opts.title;
  btn.addEventListener('click', e => { try { opts.onClick(); } catch(err){ console.warn(LOG_PREFIX,'extra button error', err);} });
  extButtonGroup.appendChild(btn);
  // トグルと同じスタイル調整 (参照に既存 toggle か View/Edit のどちらか)
  if (toggleBtn) tuneToggleStyle(btn as HTMLButtonElement, toggleBtn);
  return btn;
}

function updateToggleActive() {
  if (toggleBtn) {
    toggleBtn.classList.toggle('active', currentMode === 'vivlio');
    toggleBtn.classList.toggle('btn-primary', currentMode === 'vivlio');
    toggleBtn.classList.toggle('btn-outline-secondary', currentMode !== 'vivlio');
  }
  if (originalPreviewBody && vivlioPanel) {
    // レイアウト高さを保つため display をいじらず visibility 切替
    if (currentMode === 'markdown') {
      originalPreviewBody.style.visibility = 'visible';
      vivlioPanel.style.visibility = 'hidden';
      vivlioPanel.style.pointerEvents = 'none';
    } else {
      originalPreviewBody.style.visibility = 'hidden';
      vivlioPanel.style.visibility = 'visible';
      vivlioPanel.style.pointerEvents = 'auto';
      try {
        const h = originalPreviewBody.getBoundingClientRect().height;
        if (h) vivlioPanel.style.minHeight = h + 'px';
      } catch {}
    }
  }
}

function setMode(m:'markdown'|'vivlio') {
  if (m === currentMode) return;
  currentMode = m;
  if (m === 'vivlio') {
    ensurePreviewBodies();
    ensureIframe();
    if (!lastSrc) { const t = tryReadEditorText(); if (t) lastSrc = t; }
    // 初回: ソース確定後ただちにCSS解析 -> ページ幅推定 -> 即描画 (debounce待たない)
    try {
      const firstSrc = lastSrc || '# Vivliostyle Preview';
      const parsed = renderMarkdownWithEmbeddedCss(firstSrc);
      const full = buildFullDoc(parsed.html, parsed.css);
      // buildFullDoc 内で lastPageWidthPx 更新済み。その後 post で固定幅適用。
      post(parsed.html, parsed.css);
    } catch { scheduleRender(lastSrc || '# Vivliostyle Preview'); }
    // ResizeObserver で親幅変動時に再適用 (一度だけセット)
    if(!resizeObs && vivlioPanel){
      try {
        resizeObs = new ResizeObserver(()=>{
          if(lastSrc && currentMode==='vivlio'){
            // 幅再適用のみ: CSS再解析不要 (幅は lastPageWidthPx 保持)
            post(renderMarkdownWithEmbeddedCss(lastSrc).html, null);
          }
        });
        resizeObs.observe(vivlioPanel);
      } catch{}
    }
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
  // 既存の scaffold コンテナが残っていたら除去
  try{ const stale=document.getElementById('vivlio-preview-container'); if(stale) stale.remove(); }catch{}
  if((window as any).__VIVLIO_PREVIEW_ACTIVE__) return;
  (window as any).__VIVLIO_PREVIEW_ACTIVE__=true;
  (window as any).__VIVLIO_PREVIEW__={ scheduleRender, registerExtraButton };
  window.addEventListener('message',e=>{ if(e.data?.type==='VIVLIO_READY'){ vivlioReady=true; immediateRender(); } });
  window.addEventListener('message',e=>{ if(e.data?.type==='VIVLIO_RENDER_DONE'){ try{ console.debug('[vivlio:diag] RENDER_DONE pages=', e.data.pages, 'note=', e.data.note, 'err=', e.data.error); }catch{} } });
  // spinner removed: no VIVLIO_RENDER_DONE visual handling needed
  function tryAttach(){ return attachAllEditorListeners(); }
  attachPollId = window.setInterval(()=>{
    try { initVivlioToggle(); } catch {}
    if (tryAttach()) { if (attachPollId) clearInterval(attachPollId); }
  }, 800);
  try { const mo=new MutationObserver(()=>{ if(currentMode==='vivlio') attachAllEditorListeners(); }); mo.observe(document.body,{subtree:true,childList:true}); detachFns.push(()=>{ try{mo.disconnect();}catch{} }); }catch{}
  if(!keyForceListenerAdded){
    const keyHandler=(e:KeyboardEvent)=>{
      if(e.key==='Backspace' || e.key==='Delete'){
        const snap=tryReadEditorText();
        if(snap!=null) scheduleRender(snap);
      }
    };
    window.addEventListener('keyup', keyHandler, true);
    detachFns.push(()=>window.removeEventListener('keyup', keyHandler, true));
    keyForceListenerAdded=true;
  }
  if(!responsiveResizeListenerAdded){
    const rs=()=>checkResponsiveLayout();
    window.addEventListener('resize', rs);
    detachFns.push(()=>window.removeEventListener('resize', rs));
    setTimeout(checkResponsiveLayout, 80);
    responsiveResizeListenerAdded=true;
  }
}

function deactivate(){ if(iframe){ iframe.remove(); iframe=null;} if(attachPollId) clearInterval(attachPollId); detachFns.forEach(f=>f()); detachFns.length=0; delete (window as any).__VIVLIO_PREVIEW__; delete (window as any).__VIVLIO_PREVIEW_ACTIVE__; }

// GROWI plugin activator 登録
if(!(window as any).pluginActivators) (window as any).pluginActivators={};
(window as any).pluginActivators[config.name]={ activate, deactivate };
console.log('[vivlio:min] registered');

export {};
