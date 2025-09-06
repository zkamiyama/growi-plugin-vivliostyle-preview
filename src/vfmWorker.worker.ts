import { stringify } from '@vivliostyle/vfm';
import MarkdownIt from 'markdown-it';

self.addEventListener('message', (ev: MessageEvent) => {
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
