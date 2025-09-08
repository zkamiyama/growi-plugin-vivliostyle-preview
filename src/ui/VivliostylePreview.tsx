// ui/VivliostylePreview.tsx
// Vivliostyle React Renderer を使って Markdown を即時プレビュー表示する最終版コンポーネント
import React, { useState, useEffect } from 'react';
import { Renderer } from '@vivliostyle/react';
import { createVfmClient } from '../vfmWorkerClient';

interface VivliostylePreviewProps {
  markdown: string;
  isVisible: boolean;
}

export const VivliostylePreview: React.FC<VivliostylePreviewProps> = ({ markdown, isVisible }) => {
  const [dataUrl, setDataUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [htmlLen, setHtmlLen] = useState(0);
  const [encodedLen, setEncodedLen] = useState(0);
  const [fullHtml, setFullHtml] = useState('');
  const blobUrlRef = React.useRef<string | null>(null);
  const [editorMd, setEditorMd] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [pageInfo, setPageInfo] = useState<{ rules?: Array<{ selector?: string; declarations: string[] }>; size?: string|null; margins?: string[]; pageRuleFound: boolean }>({ pageRuleFound: false });
  const [vivlioDebug, setVivlioDebug] = useState<any>(null);
  const infoRef = React.useRef<HTMLDivElement | null>(null);
  const handleRef = React.useRef<HTMLDivElement | null>(null);
  const draggingRef = React.useRef(false);
  const dragStartRef = React.useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const resizingRef = React.useRef(false);
  const resizeStartRef = React.useRef<{ x: number; y: number; width: number; height: number; edge: string } | null>(null);
  const [lastSentMarkdown, setLastSentMarkdown] = useState<string | null>(null);
  const [lastSentUserCss, setLastSentUserCss] = useState<string>('');
  const [lastSentFinalCss, setLastSentFinalCss] = useState<string>('');
  const currentControllerRef = React.useRef<AbortController | null>(null);
  const vfmClient = React.useMemo(() => createVfmClient(), []);
  const [sheetSizePx, setSheetSizePx] = useState<{width:number, height:number}>({width:0, height:0});

  useEffect(() => {
    if (!isVisible) return;
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][Preview] effect start', { mdLen: markdown.length, time: Date.now() });
    if (!markdown) {
      setDataUrl('');
      setErrorMsg(null);
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][Preview] empty markdown');
      return;
    }
    // Cancel previous generation
    if (currentControllerRef.current) {
      currentControllerRef.current.abort();
    }
    const controller = new AbortController();
    currentControllerRef.current = controller;
    const signal = controller.signal;

    // Async generation to allow cancellation
      const generate = async () => {
      if (signal.aborted) return;
      try {
  // record what markdown/css we are about to send
  try { setLastSentMarkdown(markdown); setLastSentUserCss(extractUserCss(markdown || '')); } catch {}
          const sanitized = removeVivlioCssBlocks(markdown || '');
          const generated = await vfmClient.stringify(sanitized);
        if (signal.aborted) return;
        setFullHtml(generated);
        setHtmlLen(generated.length);
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][Preview] html generated', { htmlLen: generated.length, sample: generated.slice(0, 120) });
        // 素朴な @page 解析 (size / margin キー抽出)
        try {
          const pageRuleMatch = generated.match(/@page[^}]*{[^}]*}/g);
          if (pageRuleMatch && pageRuleMatch.length) {
            const rules = pageRuleMatch.map((r) => {
              const raw = r.trim();
              const headerMatch = raw.match(/^@page\s*([^\{]*)\{/i);
              const selector = headerMatch ? headerMatch[1].trim() || '@page' : '@page';
              const insideMatch = raw.match(/\{([\s\S]*)\}/);
              const inside = insideMatch ? insideMatch[1] : '';
              const decls = inside.split(';').map(d => d.trim()).filter(Boolean).map(s => s.replace(/;$/, ''));
              return { selector, declarations: decls };
            });
            const first = pageRuleMatch[0];
            const sizeMatch = first.match(/size:\s*([^;]+);?/);
            const marginMatches = Array.from(first.matchAll(/margin[a-z-]*:\s*[^;]+;?/g)).map(m => m[0]);
            setPageInfo({
              pageRuleFound: true,
              rules,
              size: sizeMatch ? sizeMatch[1].trim() : null,
              margins: marginMatches,
            });
          } else {
            setPageInfo({ pageRuleFound: false, rules: [] });
          }
        } catch (e) {
          setPageInfo({ pageRuleFound: false, rules: [] });
        }
        // Use Blob URL instead of base64 data URL to avoid heavy base64 encoding on large HTML
        try {
          const blob = new Blob([generated], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          if (signal.aborted) return;
          // revoke previous blob URL if any
          if (blobUrlRef.current) {
            try { URL.revokeObjectURL(blobUrlRef.current); } catch (e) { /* ignore */ }
          }
          blobUrlRef.current = url;
          setEncodedLen(generated.length);
          setDataUrl(url);
        } catch (e) {
          // fallback to data URL if Blob/URL.createObjectURL not available
          const base64 = btoa(unescape(encodeURIComponent(generated)));
          const url = `data:text/html;base64,${base64}`;
          if (signal.aborted) return;
          setEncodedLen(url.length);
          setDataUrl(url);
        }
        setErrorMsg(null);
  // eslint-disable-next-line no-console
  console.debug('[VivlioDBG][Preview] dataUrl ready', { encodedLen: generated.length });
      } catch (e) {
        if (signal.aborted) return;
        // eslint-disable-next-line no-console
        console.error('[VivlioDBG][Preview] stringify failed', e);
        setErrorMsg((e as Error).message);
        setDataUrl('');
      }
    };

    // Use scheduler.yield if available for better INP
    const runGenerate = async () => {
      await generate();
      if (typeof (window as any).scheduler?.yield === 'function') {
        await (window as any).scheduler.yield();
      }
    };
    setTimeout(runGenerate, 0);
  }, [markdown, isVisible]);

  useEffect(() => {
    if (!isVisible) return;
    // 初回レンダー/アンマウントログ
    // eslint-disable-next-line no-console
    console.debug('[VivlioDBG][Preview] mount', { time: Date.now() });
    return () => {
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][Preview] unmount', { time: Date.now() });
    };
  }, [isVisible]);

  if (!isVisible) return null;

  // Try to read raw markdown from CodeMirror 6 EditorView (state.doc) if available
  React.useEffect(() => {
    let pollId: number | null = null;
    try {
      const EditorView = (window as any).EditorView || (window as any).CodeMirror?.EditorView;
      if (!EditorView || typeof EditorView.findFromDOM !== 'function') return;
      const cmRoot = document.querySelector('.cm-editor');
      if (!cmRoot) return;
      const view = EditorView.findFromDOM(cmRoot as HTMLElement);
      if (!view) return;
      const read = () => {
        try {
          // Prefer view.state.doc.toString() (more robust across CM6 builds).
          // Fall back to sliceDoc() if doc.toString is not available.
          let txt = '';
          if (view.state && view.state.doc && typeof view.state.doc.toString === 'function') {
            txt = view.state.doc.toString();
          } else if (view.state && typeof view.state.sliceDoc === 'function') {
            txt = view.state.sliceDoc();
          }
          if (txt && txt !== editorMd) setEditorMd(txt);
        } catch (e) { /* ignore */ }
      };
      read();
      // Try to attach an updateListener if available, else fallback to light polling
      try {
        if (EditorView.updateListener && typeof EditorView.updateListener.of === 'function') {
          const listener = EditorView.updateListener.of((u: any) => { if (u.docChanged) read(); });
          // best-effort appendConfig
          try { view.dispatch?.({ effects: (window as any).StateEffect?.appendConfig?.of(listener) }); } catch (e) { /* ignore */ }
        } else {
          pollId = window.setInterval(read, 500);
        }
      } catch (e) {
        pollId = window.setInterval(read, 500);
      }
    } catch (e) {
      // ignore
    }
    return () => { if (pollId) clearInterval(pollId); };
  }, []);

  // If editorMd is present, regenerate fullHtml from it so renderer gets correct content.
  React.useEffect(() => {
    if (!editorMd) return;
    // Cancel previous generation
    if (currentControllerRef.current) {
      currentControllerRef.current.abort();
    }
    const controller = new AbortController();
    currentControllerRef.current = controller;
    const signal = controller.signal;

    let to: number | null = null;
  const doGenerate = async () => {
      if (signal.aborted) return;
      try {
    const sanitizedEditor = removeVivlioCssBlocks(editorMd || '');
    const generated = await vfmClient.stringify(sanitizedEditor);
        if (signal.aborted) return;
        // quick validation: must contain <html and <body
        const looksLikeHtml = /<\s*!doctype|<html[\s>]/i.test(generated) && /<body[\s>]/i.test(generated);
        if (!looksLikeHtml) {
          // log full sample for diagnostics
          // eslint-disable-next-line no-console
          console.error('[VivlioDBG][Preview] stringify produced invalid HTML sample', { sample: generated.slice(0, 200) });
          setErrorMsg('Vivliostyle produced invalid HTML. Check input.');
          // don't update dataUrl/fullHtml to avoid feeding broken content to Renderer
          return;
        }
        setFullHtml(generated);
        setHtmlLen(generated.length);
        try {
          // Extract @page rules for info panel
          try {
            const pageRuleMatch = generated.match(/@page[^}]*{[^}]*}/g);
            if (pageRuleMatch && pageRuleMatch.length) {
              const rules = pageRuleMatch.map((r) => {
                const raw = r.trim();
                const insideMatch = raw.match(/\{([\s\S]*)\}/);
                const inside = insideMatch ? insideMatch[1] : '';
                const decls = inside.split(';').map(d => d.trim()).filter(Boolean).map(s => s.replace(/;$/, ''));
                return { raw, declarations: decls };
              });
              const first = pageRuleMatch[0];
              const sizeMatch = first.match(/size:\s*([^;]+);?/);
              const marginMatches = Array.from(first.matchAll(/margin[a-z-]*:\s*[^;]+;?/g)).map(m => m[0]);
              setPageInfo({ pageRuleFound: true, rules, size: sizeMatch ? sizeMatch[1].trim() : null, margins: marginMatches });
            } else {
              setPageInfo({ pageRuleFound: false, rules: [] });
            }
          } catch (e) { setPageInfo({ pageRuleFound: false, rules: [] }); }

          const blob = new Blob([generated], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          if (signal.aborted) return;
          if (blobUrlRef.current) {
            try { URL.revokeObjectURL(blobUrlRef.current); } catch (e) { /* ignore */ }
          }
          blobUrlRef.current = url;
          setEncodedLen(generated.length);
          setDataUrl(url);
        } catch (e) {
          const base64 = btoa(unescape(encodeURIComponent(generated)));
          const url = `data:text/html;base64,${base64}`;
          if (signal.aborted) return;
          setEncodedLen(url.length);
          setDataUrl(url);
        }
        setErrorMsg(null);
        // debug log
        // eslint-disable-next-line no-console
        console.debug('[VivlioDBG][Preview] stringify(editorMd) ok', { htmlLen: generated.length, sample: generated.slice(0, 120) });
      } catch (e) {
        if (signal.aborted) return;
        // eslint-disable-next-line no-console
        console.error('[VivlioDBG][Preview] stringify failed (editorMd)', e);
        setErrorMsg((e as Error).message);
        setDataUrl('');
      }
    };
    // debounce to avoid partial intermediate state
    to = window.setTimeout(doGenerate, 120);
    return () => { if (to) clearTimeout(to); };
  }, [editorMd]);

  // Use data URL as the Renderer source so the viewer loads inline HTML and
  // does not attempt to fetch the string as a remote URL (which causes CORS/fetch errors).
  // rendererSource must be a URL string (prefer Blob/data URL stored in state). Do not recreate base64 inline here.
  const rendererSource = dataUrl || null;
  // Extract user CSS from markdown code block labeled ```vivliocss
  // Also support cases where the editor folds code and produces
  // <pre class="language-vivliocss…"> truncated forms in the generated HTML.
  const extractUserCss = (md: string) => {
    // 1) Prefer explicit markdown fenced block
    const m = md.match(/```vivliocss\s*([\s\S]*?)```/i);
    if (m) return m[1].trim();

    // 2) Fallback: try to extract from generated fullHtml <pre class="language-vivliocss..."> blocks
    if (fullHtml) {
      const preMatch = fullHtml.match(/<pre[^>]*class=(?:"|')([^"']*language-vivliocss[^"']*)(?:"|')[^>]*>([\s\S]*?)<\/pre>/i);
      if (preMatch) {
        let content = preMatch[2] || '';
        // If wrapped in <code>..</code>, strip tags
        content = content.replace(/^\s*<code[^>]*>/i, '').replace(/<\/code>\s*$/i, '');
        // Unescape basic HTML entities
        content = content.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
        // Remove trailing ellipsis characters that editors insert when folding (e.g. '…' or '...')
        content = content.replace(/[\u2026]+$|\.\.\.+$/m, '').trim();
        return content;
      }
    }
    return '';
  };

  // Remove all ```vivliocss ... ``` blocks from markdown so they are not
  // rendered into the HTML by vfm. We keep extractUserCss to pull the CSS
  // for insertion into the Renderer, but the markdown passed to vfm must
  // have those fences removed.
  const removeVivlioCssBlocks = (md: string) => {
    if (!md) return md;
    return md.replace(/```vivliocss\b[\s\S]*?```/ig, '').trim();
  };

  const userCss = extractUserCss(markdown || '');

  // Determine page size: prefer @page in userCss, else fallback to A4 portrait no-margin
  const detectPageSizeFromCss = (css: string) => {
    // match @page{...size: <w> <h>;...}
    const pageMatch = css.match(/@page[^{]*{([\s\S]*?)}/i);
    if (pageMatch) {
      const inside = pageMatch[1];
      const sizeMatch = inside.match(/size:\s*([^;]+);?/i);
      if (sizeMatch) {
        const parts = sizeMatch[1].trim().split(/\s+/);
        if (parts.length >= 2) return { width: parts[0], height: parts[1], margin: null };
        return { width: parts[0], height: null, margin: null };
      }
      const marginMatch = inside.match(/margin:\s*([^;]+);?/i);
      return { width: null, height: null, margin: marginMatch ? marginMatch[1].trim() : null };
    }
    return { width: null, height: null, margin: null };
  };

  const pageSpec = detectPageSizeFromCss(userCss);
  const pageWidth = pageSpec.width || '210mm';
  const pageHeight = pageSpec.height || '297mm';
  const pageMargin = pageSpec.margin || '0mm';

  // Pass user CSS if present. Do not inject a default stylesheet as a fallback.
  const finalUserStyleSheet = userCss || '';

  // Injected helper CSS applied inside the Vivliostyle-rendered document.
  // - style the bleed/page-area/page-box per recommendation
  // - ensure the bleed-box (paper) is centered inside the renderer document
  const injectedRendererCss = `
/* Plugin-injected: center bleed-box and visual helpers */
html, body { height: 100%; margin: 0; padding: 0; }
body { display: flex; align-items: center; justify-content: center; }

[data-vivliostyle-bleed-box] {
  background: #fff;
  box-shadow: 0 8px 24px rgba(0,0,0,.25);
  border: 1px solid #ddd;
}

[data-vivliostyle-page-area] {
  background: rgba(144, 238, 144, .25);
  background-clip: border-box;
}

[data-vivliostyle-page-box] {
  background: rgba(100, 149, 237, .25);
}
@page { size: 148mm 210mm; margin: 20mm; }
`;

  // Combine user's extracted CSS with our injected helpers so they both apply inside the Renderer.
  const rendererUserStyleSheet = `${finalUserStyleSheet}\n${injectedRendererCss}`;

  // Keep a record of final stylesheet passed to Renderer for display
  React.useEffect(() => {
  try { setLastSentFinalCss(finalUserStyleSheet || ''); } catch {}
  }, [finalUserStyleSheet]);

  // Refs for measuring and scaling
  const viewerRef = React.useRef<HTMLDivElement | null>(null);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const rendererWrapRef = React.useRef<HTMLDivElement | null>(null);
  const scaleInnerRef = React.useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = React.useState<number>(1);

  // Collect debug information from the Vivliostyle-rendered iframe when available
  const collectVivlioDebug = async () => {
    try {
      const wrap = rendererWrapRef.current;
      if (!wrap) {
        setVivlioDebug({ error: 'no-wrap', collectedAt: Date.now() });
        return;
      }
      const iframe = wrap.querySelector('iframe') as HTMLIFrameElement | null;

      // Support two rendering modes:
      // 1) Renderer renders into an iframe (old path) -> inspect iframe.document
      // 2) Renderer renders directly into DOM under rendererWrap (no iframe) -> inspect wrap
      let rootIsDocument = false;
      let rootDoc: Document | Element = wrap;
      let getCS: ((el: Element) => CSSStyleDeclaration | null) | null = null;

      if (iframe) {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          rootIsDocument = true;
          rootDoc = doc as Document;
          getCS = (el: Element) => (iframe.contentWindow ? iframe.contentWindow.getComputedStyle(el as Element) : null);
        }
      }

      if (!rootIsDocument) {
        // fallback to inspecting the rendererWrap DOM directly
        rootDoc = wrap as Element;
        getCS = (el: Element) => window.getComputedStyle(el as Element);
      }

      // find candidate page containers using Vivliostyle data attributes or common page markers
      const q = '[data-vivliostyle-page-side], [data-vivliostyle-auto-page-width], [data-vivliostyle-auto-page-height]';
      const candidates: Element[] = Array.from((rootDoc as any).querySelectorAll ? Array.from((rootDoc as any).querySelectorAll(q) as NodeListOf<Element>) : []);
      if (candidates.length === 0) {
        // fallback: common page container heuristics
        const fallbacks = Array.from((rootDoc as any).querySelectorAll ? Array.from((rootDoc as any).querySelectorAll('.vivliostyle-page, .page, [role="document"], article') as NodeListOf<Element>) : []);
        candidates.push(...(fallbacks as Element[]));
      }

      const entries = candidates.slice(0, 6).map((el) => {
        const inline = el.getAttribute('style') || '';
        const ds: any = {};
        try { Object.keys((el as HTMLElement).dataset || {}).forEach((k) => { ds[k] = (el as HTMLElement).dataset[k as any]; }); } catch (e) { /* ignore */ }
        const cs = getCS ? getCS(el) : null;
        const comp = cs ? { width: cs.width, height: cs.height, left: cs.left, top: cs.top, padding: cs.padding } : null;
        // try to find bleed/crop related child
        const bleed = (el as Element).querySelector ? (el as Element).querySelector('[data-bleed], .bleed, .vivliostyle-bleed, [data-vivliostyle-bleed]') as Element | null : null;
        const bleedInline = bleed ? (bleed.getAttribute('style') || '') : null;
        return {
          tag: el.tagName.toLowerCase(),
          id: (el as HTMLElement).id || null,
          className: (el as HTMLElement).className || null,
          dataset: ds,
          inlineStyle: inline,
          computed: comp,
          bleedInline,
        };
      });

      // also try to surface top-level container sizes (sheet width/height) from inline styles
      let pageSheetWidth: string | null = null;
      let pageSheetHeight: string | null = null;
      try {
        const anyContainer = (rootDoc as any).querySelector ? (rootDoc as any).querySelector('[data-vivliostyle-page-side], .vivliostyle-page, .page') as HTMLElement | null : null;
        if (anyContainer) {
          pageSheetWidth = anyContainer.getAttribute('style') ? (anyContainer.style.width || null) : null;
          pageSheetHeight = anyContainer.getAttribute('style') ? (anyContainer.style.height || null) : null;
        }
      } catch (e) { /* ignore */ }

      setVivlioDebug({ entries, pageSheetWidth, pageSheetHeight, rootIsDocument, collectedAt: Date.now() });
    } catch (e) {
  // capture error for display
  setVivlioDebug({ error: (e as Error).message, collectedAt: Date.now() });
    }
  };

  // Compute fit-to-container scale so the entire sheet is visible (never upscale beyond 1)
  React.useLayoutEffect(() => {
    function recompute() {
      const viewer = viewerRef.current;
      const sheet = sheetRef.current;
      if (!viewer || !sheet) return;
      const vRect = viewer.getBoundingClientRect();
      // Prefer iframe content size when renderer uses an iframe
      let sheetRect = sheet.getBoundingClientRect();
      try {
        const wrap = rendererWrapRef.current;
        if (wrap) {
          const iframe = wrap.querySelector('iframe') as HTMLIFrameElement | null;
          if (iframe && iframe.contentDocument) {
            const doc = iframe.contentDocument;
            const inner = doc.documentElement || doc.body;
            if (inner) {
              const ir = inner.getBoundingClientRect();
              if (ir.width > 0 && ir.height > 0) sheetRect = ir;
            }
          }
        }
      } catch (e) { /* ignore cross-origin or timing errors */ }

      // available space inside viewer
      const availW = vRect.width;
      const availH = vRect.height;
      if (sheetRect.width <= 0 || sheetRect.height <= 0) return;
      const fit = Math.min(availW / sheetRect.width, availH / sheetRect.height, 1);
      setScale(Number(fit.toFixed(4)));

      // Keep rendererWrap as the layout container (flex centering). Apply CSS transform
      // to an inner element so the transform does not change the layout flow (avoids left/top anchoring).
      if (rendererWrapRef.current) {
        rendererWrapRef.current.style.display = 'flex';
        rendererWrapRef.current.style.alignItems = 'center';
        rendererWrapRef.current.style.justifyContent = 'center';
      }
      if (scaleInnerRef.current) {
        scaleInnerRef.current.style.transformOrigin = 'center center';
        scaleInnerRef.current.style.transform = `translate(-0px, -0px) scale(${fit})`;
      }

  // update diagnostic with the sheetRect we actually used
  setSheetSizePx({ width: Math.round(sheetRect.width), height: Math.round(sheetRect.height) });
    }

    recompute();
    window.addEventListener('resize', recompute);
    const ro = new ResizeObserver(recompute);
    if (viewerRef.current) ro.observe(viewerRef.current);
    if (sheetRef.current) ro.observe(sheetRef.current);
    return () => { window.removeEventListener('resize', recompute); ro.disconnect(); };
  }, [fullHtml, dataUrl, userCss, pageWidth, pageHeight]);

  // run debug collection when dataUrl changes and when info panel is open
  React.useEffect(() => {
    if (!dataUrl) return;
    // collect shortly after iframe loads; blob-based iframe should be same-origin
    const t = window.setTimeout(() => { try { collectVivlioDebug(); } catch (e) { /* ignore */ } }, 300);
    return () => { clearTimeout(t); };
  }, [dataUrl]);

  React.useEffect(() => {
    if (showInfo) {
      // immediate attempt when panel is opened
      collectVivlioDebug();
    }
  }, [showInfo]);

  // cleanup blob URL on unmount
  React.useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        try { URL.revokeObjectURL(blobUrlRef.current); } catch (e) { /* ignore */ }
        blobUrlRef.current = null;
      }
      if (currentControllerRef.current) {
        currentControllerRef.current.abort();
        currentControllerRef.current = null;
      }
      vfmClient.terminate();
    };
  }, [vfmClient]);

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      position: 'relative',
      zIndex: 10,
      background: '#2b2b2b',
      overflow: 'hidden', // prevent outer scroll; viewer controls scrolling
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box'
    }}>
        <div ref={viewerRef} style={{ padding: 24, overflow: 'auto', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', boxSizing: 'border-box' }}>
          {/* Fixed-size preview sheet. Page size comes from user CSS @page if provided, else A4 fallback. */}
          <div ref={sheetRef} style={{ width: pageWidth, height: pageHeight, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {errorMsg && (
            <div style={{ position: 'absolute', top: 8, right: 8, left: 8, padding: '8px 10px', background: '#ffeeee', border: '1px solid #e99', color: '#a00', fontSize: 12, borderRadius: 4 }}>
              VFM Error: {errorMsg}
            </div>
          )}
          {rendererSource ? (
              <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                {/* rendererWrapRef centers content; scaleInnerRef receives transform so layout remains centered */}
                <div ref={rendererWrapRef} style={{ width: '100%', height: '100%', overflow: 'hidden', willChange: 'transform' }}>
                  <div ref={scaleInnerRef} style={{ width: '100%', height: '100%' }}>
                    <Renderer
                      /* keep stable mounting */
                      source={rendererSource as string}
                      bookMode={false}
                      userStyleSheet={rendererUserStyleSheet}
                      renderAllPages={false}
                    />
                  </div>
                </div>
              </div>
          ) : !errorMsg ? (
            <div style={{ padding: '2em', textAlign: 'center', color: '#666' }}>Markdownを入力してください...</div>
          ) : null}
        </div>
      </div>
      {/* Info button */}
          {!showInfo && (
            <button
              type="button"
              aria-label="show vivliostyle preview info"
              onClick={() => setShowInfo(true)}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 26,
                height: 26,
                borderRadius: '50%',
                border: '1px solid #999',
                background: '#fff',
                color: '#333',
                fontSize: 14,
                cursor: 'pointer',
                lineHeight: '24px',
                textAlign: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,.15)'
              }}
              title="Preview info"
            >i</button>
          )}
      {showInfo && (
        <>
          <div
            ref={infoRef}
            onPointerDown={(ev) => {
              const el = infoRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              const offsetX = ev.clientX - rect.left;
              const offsetY = ev.clientY - rect.top;
              const edgeThreshold = 8;
              const nearRight = rect.width - offsetX <= edgeThreshold;
              const nearBottom = rect.height - offsetY <= edgeThreshold;
              const nearLeft = offsetX <= edgeThreshold;
              const nearTop = offsetY <= edgeThreshold;

              // If pointer is on header handle, start dragging the panel
              const t = ev.target as HTMLElement | null;
              const header = handleRef.current;
              if (header && t && header.contains(t) && !(t.closest && t.closest('button,a,input,textarea,select'))) {
                ev.preventDefault();
                const parent = el.offsetParent as HTMLElement | null;
                const pRect = parent ? parent.getBoundingClientRect() : ({ left: 0, top: 0 } as DOMRect);
                const left = rect.left - pRect.left;
                const top = rect.top - pRect.top;
                el.style.left = `${left}px`;
                el.style.right = 'auto';
                el.style.top = `${top}px`;
                draggingRef.current = true;
                dragStartRef.current = { x: ev.clientX, y: ev.clientY, left, top };
                const onMove = (e: PointerEvent) => {
                  if (!draggingRef.current || !dragStartRef.current || !el) return;
                  const dx = e.clientX - dragStartRef.current.x;
                  const dy = e.clientY - dragStartRef.current.y;
                  const newLeft = Math.max(0, dragStartRef.current.left + dx);
                  const newTop = Math.max(0, dragStartRef.current.top + dy);
                  el.style.left = `${newLeft}px`;
                  el.style.top = `${newTop}px`;
                };
                const onUp = () => {
                  draggingRef.current = false;
                  dragStartRef.current = null;
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
                return;
              }

              // If pointer is near an edge, start resizing
              if (nearRight || nearBottom || nearLeft || nearTop) {
                ev.preventDefault();
                resizingRef.current = true;
                resizeStartRef.current = { x: ev.clientX, y: ev.clientY, width: rect.width, height: rect.height, edge: nearRight ? 'right' : nearLeft ? 'left' : nearBottom ? 'bottom' : 'top' };
                const onResizeMove = (e: PointerEvent) => {
                  if (!resizingRef.current || !resizeStartRef.current || !el) return;
                  const dx = e.clientX - resizeStartRef.current.x;
                  const dy = e.clientY - resizeStartRef.current.y;
                  let newW = resizeStartRef.current.width;
                  let newH = resizeStartRef.current.height;
                  if (resizeStartRef.current.edge === 'right') newW = Math.max(220, resizeStartRef.current.width + dx);
                  if (resizeStartRef.current.edge === 'left') newW = Math.max(220, resizeStartRef.current.width - dx);
                  if (resizeStartRef.current.edge === 'bottom') newH = Math.max(120, resizeStartRef.current.height + dy);
                  if (resizeStartRef.current.edge === 'top') newH = Math.max(120, resizeStartRef.current.height - dy);
                  el.style.width = `${newW}px`;
                  el.style.height = `${newH}px`;
                };
                const onResizeUp = () => {
                  resizingRef.current = false;
                  resizeStartRef.current = null;
                  window.removeEventListener('pointermove', onResizeMove);
                  window.removeEventListener('pointerup', onResizeUp);
                };
                window.addEventListener('pointermove', onResizeMove);
                window.addEventListener('pointerup', onResizeUp);
                return;
              }

              // otherwise ignore to allow text selection
            }}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 320,
              maxHeight: '80%',
              overflow: 'auto',
              // use custom resizer at bottom-left instead of native resize
              minWidth: 220,
              minHeight: 120,
              // darker frosted glass / Aero-like
              background: 'rgba(18,20,22,0.56)',
              backdropFilter: 'blur(8px) saturate(120%)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              lineHeight: 1.4,
              color: '#e6e6e6',
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              zIndex: 20
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div ref={handleRef} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab' }}>
                <strong style={{ fontSize: 13, color: '#f3f4f6' }}>Vivliostyle Preview Info</strong>
              </div>
              <span style={{ marginLeft: 'auto' }}>
                <button
                  type="button"
                  onClick={() => setShowInfo(false)}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0,
                    color: '#d0d4d8'
                  }}
                  aria-label="close info"
                >×</button>
              </span>
            </div>
            <ul style={{ listStyle: 'disc', paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <li>Characters (Markdown): {markdown.length}</li>
              <li>Lines: {markdown.split(/\r?\n/).length}</li>
              <li>Words (approx): {markdown.trim() ? markdown.trim().split(/\s+/).length : 0}</li>
              <li>@page rules: {pageInfo.pageRuleFound ? '' : 'none'}</li>
              {pageInfo.pageRuleFound && pageInfo.rules && pageInfo.rules.length > 0 && (
                <ul style={{ marginTop: 4, marginLeft: 12, listStyle: 'circle' }}>
                  {pageInfo.rules.map((r, idx) => (
                    <li key={idx} style={{ marginBottom: 6 }}>
                      <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#d9e2e6' }}>{r.selector}</div>
                      {r.declarations && r.declarations.length > 0 && (
                        <ul style={{ marginTop: 4, marginLeft: 12, listStyle: 'square' }}>
                          {r.declarations.map((d, j) => (
                            <li key={j} style={{ fontFamily: 'monospace', fontSize: 12, color: '#cfd6da' }}>{d}</li>
                          ))}
                        </ul>
                      )}
                      {/* display size and margins as children summary */}
                      {pageInfo.size && <div style={{ marginTop: 6, fontSize: 12, color: '#d9e2e6' }}>Page size: {pageInfo.size}</div>}
                      {pageInfo.margins && pageInfo.margins.map((m, i) => (<div key={i} style={{ fontSize: 12, color: '#d9e2e6' }}>{m}</div>))}
                    </li>
                  ))}
                </ul>
              )}
              {/* page size/margins shown per-rule as children; no duplicate summary here */}
            </ul>
            {/* Details in order: Markdown (raw) -> HTML (VFM) -> CSS */}
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer' }}>User CSS (extracted from Markdown)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'rgba(0,0,0,0.18)', padding: 8, border: '1px solid rgba(255,255,255,0.04)', color: '#e6e6e6', userSelect: 'text' }}>{userCss || ''}</pre>
            </details>
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer' }}>Markdown (raw)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 240, overflow: 'auto', background: 'rgba(0,0,0,0.18)', padding: 8, border: '1px solid rgba(255,255,255,0.04)', color: '#e6e6e6', userSelect: 'text' }}>{lastSentMarkdown || markdown || ''}</pre>
            </details>

            {fullHtml && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer' }}>HTML (VFM)</summary>
                <pre style={{ maxHeight: 480, overflow: 'auto', background: 'rgba(0,0,0,0.28)', padding: 8, border: '1px solid rgba(255,255,255,0.04)', color: '#e6e6e6' }}>{fullHtml}</pre>
              </details>
            )}

            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer' }}>Final CSS (Renderer)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', background: 'rgba(0,0,0,0.18)', padding: 8, border: '1px solid rgba(255,255,255,0.04)', color: '#e6e6e6', userSelect: 'text' }}>{lastSentFinalCss || ''}</pre>
            </details>
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer' }}>Vivliostyle iframe debug (runtime)</summary>
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => { try { collectVivlioDebug(); } catch (e) { /* ignore */ } }}
                    style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }}
                  >Refresh</button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        if (vivlioDebug) navigator.clipboard?.writeText(JSON.stringify(vivlioDebug, null, 2));
                      } catch (e) { /* ignore */ }
                    }}
                    style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 4 }}
                  >Copy JSON</button>
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', background: 'rgba(0,0,0,0.18)', padding: 8, border: '1px solid rgba(255,255,255,0.04)', color: '#e6e6e6', fontSize: 12 }}>
                  {vivlioDebug ? JSON.stringify(vivlioDebug, null, 2) : 'No debug information collected. Open the panel, wait a moment and click Refresh.'}
                </pre>
              </div>
            </details>
          </div>
          {/* custom resize handle (bottom-left) */}
          {infoRef.current && (
            <div
              onPointerDown={(ev) => {
                const el = infoRef.current;
                if (!el) return;
                ev.preventDefault();
                const startX = ev.clientX;
                const startY = ev.clientY;
                const startRect = el.getBoundingClientRect();
                const startWidth = startRect.width;
                const startHeight = startRect.height;
                const onMove = (e: PointerEvent) => {
                  const dx = startX - e.clientX; // left handle: moving right reduces width
                  const dy = e.clientY - startY; // moving down increases height
                  const newWidth = Math.max(220, startWidth + dx);
                  const newHeight = Math.max(120, startHeight + dy);
                  el.style.width = `${newWidth}px`;
                  el.style.height = `${newHeight}px`;
                };
                const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
              }}
              style={{ position: 'absolute', left: 8, bottom: 8, width: 14, height: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 2, cursor: 'nwse-resize', zIndex: 30 }}
              aria-hidden
            />
          )}
        </>
      )}
    </div>
  );
};

export default VivliostylePreview;
