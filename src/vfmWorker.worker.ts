import './vfmWorker.setup';
import { stringify } from '@vivliostyle/vfm';
import MarkdownIt from 'markdown-it';

self.addEventListener('message', async (ev: MessageEvent) => {
  try {
    // Accept either object or JSON-string payloads. For robustness we prefer JSON string.
    let data: any = ev.data;
    // log raw incoming type for diagnosis
    try { console.debug('[vfmWorker][recv] rawType', typeof ev.data, ev.data && Object.keys(ev.data || {})); } catch (e) { /* ignore */ }
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* leave as string */ }
    }
    const seq = data && (data.seq ?? null);
    let md: string = data && data.markdown ? data.markdown : '';
    const originalMd = md;
    // Extract fenced code block language/info tokens from the original markdown
    // so we can see what vfm actually receives before normalization.
    try {
      const fenceRe = /(^|\r?\n)(```|~~~)([^\r\n]*)\r?\n/g;
      const fenceLangs: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = fenceRe.exec(originalMd)) !== null) {
        const rawInfo = (m[3] || '').trim();
        let lang = rawInfo;
        if (!rawInfo || /^(?:undefined|null)$/i.test(rawInfo) || !/[A-Za-z0-9_-]/.test(rawInfo)) {
          lang = 'text';
        }
        fenceLangs.push(lang);
      }
      try { console.debug('[vfmWorker][fenceLangs]', { seq, fenceLangs }); } catch (e) { /* ignore */ }
    } catch (e) {
      /* ignore fence extraction errors */
    }
    // Ensure fenced code blocks without language get a safe default to avoid
    // highlighter errors like "The language \"undefined\" has no grammar.".
    // Handle several cases:
    //  - lines that are exactly ``` or ~~~ -> ```text / ~~~text
    //  - lines like ``` undefined or ``` null -> ```text
    //  - any fence with empty/blank info string -> default to text
    try {
      // Normalize fence info by scanning fence openings robustly (handles CRLF).
      md = md.replace(/(^|\r?\n)(```|~~~)([^\r\n]*)\r?\n/g, (match, pre, fence, info) => {
        const infoTrim = (info || '').trim();
        // if info is empty, 'undefined', 'null', or otherwise non-wordy, default to 'text'
        if (!infoTrim || /^(?:undefined|null)$/i.test(infoTrim)) {
          return `${pre}${fence} text\n`;
        }
        // if info contains only punctuation/quotes, treat as empty
        if (!/[A-Za-z0-9_-]/.test(infoTrim)) {
          return `${pre}${fence} text\n`;
        }
        return `${pre}${fence} ${infoTrim}\n`;
      });
    } catch (e) {
      // ignore and proceed with original md
    }
    // Debug: emit normalized markdown preview so we can see what vfm receives
    try { console.debug('[vfmWorker][normalizedMd]', { seq, preview: md.slice(0, 200) }); } catch (e) { /* ignore */ }

    // Install defensive handlers and wrappers to capture any highlighter calls
    // that may throw (e.g. highlight.js / Prism). This helps us log the
    // language argument and avoid uncaught exceptions during vfm.stringify.
    try {
      // Log unhandled promise rejections inside the worker
      (self as any).onunhandledrejection = (ev: any) => {
        try { console.error('[vfmWorker][unhandledrejection]', ev && ev.reason); } catch (e) { /* ignore */ }
        // prevent default propagation
        return true;
      };

      const escapeHtml = (s: string) => s.replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as any)[c]);

      const makeWrapper = (name: string) => {
        const globalObj = (globalThis as any);
        const orig = globalObj[name];
        if (orig && typeof orig === 'object' && typeof orig.highlight === 'function') {
          const originalFn = orig.highlight.bind(orig);
          orig.highlight = function(a: any, b: any) {
            try {
              const preview = (a && a.toString && a.toString().slice ? a.toString().slice(0,80) : String(a)).slice(0,80);
              const stack = (new Error()).stack;
              console.debug('[vfmWorker][' + name + '.highlight] called', { lang: b, preview, stack });
            } catch (e) { /* ignore */ }
            // Defensive: if no language provided, avoid calling original highlight
            // which may throw when grammar is missing. Return escaped HTML instead.
            if (!b) {
              return { value: escapeHtml(String(a)) };
            }
            try { return originalFn(a, b); } catch (e) {
              try { console.debug('[vfmWorker][' + name + '.highlight] error', e, (new Error()).stack); } catch (e2) { /* ignore */ }
              return { value: escapeHtml(String(a)) };
            }
          };
          globalObj[name] = orig;
        } else if (!globalObj[name]) {
          // Provide a minimal shim that logs and returns escaped code
          globalObj[name] = {
            highlight: function(a: any, b: any) {
              try { console.debug('[vfmWorker][' + name + '.highlight shim] called', { lang: b, preview: (a && a.toString && a.toString().slice ? a.toString().slice(0,80) : String(a)).slice(0,80), stack: (new Error()).stack }); } catch (e) { /* ignore */ }
              if (!b) return { value: escapeHtml(String(a)) };
              return { value: escapeHtml(String(a)) };
            },
          };
        }
      };

      try { makeWrapper('hljs'); } catch (e) { /* ignore */ }
      try { makeWrapper('Prism'); } catch (e) { /* ignore */ }
      try { if (!(globalThis as any).highlight) { (globalThis as any).highlight = (a: any, b: any) => { try { console.debug('[vfmWorker][highlight shim] called', { lang: b }); } catch (e) {} return { value: escapeHtml(String(a)) }; }; } } catch (e) { /* ignore */ }
    } catch (e) {
      /* defensive: if wrappers fail, continue without them */
    }
    let html: string;
    // Suppress uncaught error logging during stringify; capture errors and fallback.
    const prevOnError = (self as any).onerror;
    (self as any).onerror = () => true;
    try {
      try {
        html = stringify(md);
      } catch (e) {
      // vfm may throw when highlighter receives an invalid language; fall back to markdown-it
        try { console.error('[vfmWorker] vfm.stringify failed, falling back to markdown-it', e); } catch (e2) { /* ignore */ }
        try {
          const mdIt = new MarkdownIt();
          html = mdIt.render(md);
          try { console.debug('[vfmWorker] fallback markdown-it rendered', { seq, htmlLen: html.length }); } catch (e2) { /* ignore */ }
        } catch (e3) {
          // last resort: empty html with error message
          html = '<pre><code>Preview generation failed</code></pre>';
        }
      }
    } finally {
      // restore previous handler
      (self as any).onerror = prevOnError;
    }
    // respond with JSON string to avoid any library expecting string messages
    (self as any).postMessage(JSON.stringify({ seq, ok: true, html }));
  } catch (e) {
    (self as any).postMessage(JSON.stringify({ seq: null, ok: false, error: String(e) }));
  }
});
