// Minimal stable Vivliostyle preview integration (scaffold)
// Goal: use GROWI markdownRenderer, avoid double React, provide hook points.
// NOTE: Vivliostyle viewer full pagination not yet wired; this produces a placeholder.

interface PluginActivator { activate: () => void; deactivate: () => void }
// Rename to avoid clobbering main activator defined in client-entry.tsx
const PLUGIN_NAME = 'growi-plugin-vivliostyle-preview:mini';
let cleanup: (()=>void)|null = null;
let debTimer: number|null = null;
const DEBOUNCE_MS = 400;

function debounce(fn: ()=>void){ if(debTimer) clearTimeout(debTimer); debTimer = window.setTimeout(fn, DEBOUNCE_MS); }

async function renderMarkdown(md: string): Promise<string> {
  const anyWin: any = window as any;
  const facade = anyWin.growiFacade;
  if (facade?.markdownRenderer?.render) {
    try { return await facade.markdownRenderer.render(md); } catch { /* fallback */ }
  }
  return md.replace(/</g,'&lt;');
}

function ensureContainer(): { host: HTMLElement; viewer: HTMLElement } {
  let host = document.getElementById('vivlio-preview-container');
  if(!host){
    host = document.createElement('div');
    host.id = 'vivlio-preview-container';
    host.style.borderLeft = '1px solid #ccc';
    host.style.padding = '8px';
    host.style.background = '#fff';
    const target = document.querySelector('#revision-body') || document.body;
    target?.prepend(host);
  }
  let viewer = host.querySelector('.vivlio-viewer-root') as HTMLElement | null;
  if(!viewer){
    viewer = document.createElement('div');
    viewer.className = 'vivlio-viewer-root';
    viewer.style.minHeight = '200px';
    viewer.style.font = '14px/1.5 system-ui, sans-serif';
    host.appendChild(viewer);
  }
  return { host, viewer };
}

async function updateFromEditor(){
  const editor = document.querySelector('textarea, .cm-content[contenteditable="true"]');
  let md = '';
  if(editor instanceof HTMLTextAreaElement) md = editor.value;
  else if(editor) md = (editor as HTMLElement).textContent || '';
  else {
    const rev = document.querySelector('#revision-body-content') as HTMLElement | null;
    md = rev?.innerText || '';
  }
  const html = await renderMarkdown(md);
  const { viewer } = ensureContainer();
  viewer.innerHTML = `<div class="vivlio-placeholder">(Pagination not active yet)</div>` + html;
}

const activate = () => {
  if(cleanup) return;
  const editor = document.querySelector('textarea, .cm-content[contenteditable="true"]');
  const handler = () => debounce(()=>{ updateFromEditor(); });
  editor?.addEventListener('input', handler);
  updateFromEditor();
  cleanup = () => { editor?.removeEventListener('input', handler); const c=document.getElementById('vivlio-preview-container'); c?.remove(); if(debTimer) clearTimeout(debTimer); debTimer=null; };
};

const deactivate = () => { try { cleanup?.(); cleanup=null; } catch(e){ console.error('[vivlio] deactivate error', e); } };

const anyWin: any = window as any;
if(!anyWin.pluginActivators) anyWin.pluginActivators = {};
anyWin.pluginActivators[PLUGIN_NAME] = { activate, deactivate } as PluginActivator;
console.info('[vivlio] minimal plugin registered (aux)');
