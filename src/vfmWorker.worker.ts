import './vfmWorker.setup';
import { stringify } from '@vivliostyle/vfm';

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
    const options = data && data.options ? data.options : undefined;
  // originalMd intentionally not captured to reduce noise; we normalize fences below
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

  // Defensive shims and global handlers are installed in `vfmWorker.setup`.
  // Keep this worker focused on normalization and calling vfm.stringify.
    let html: string;
    // Suppress uncaught error logging during stringify; capture errors.
    const prevOnError = (self as any).onerror;
    (self as any).onerror = () => true;
    try {
      try {
        // If caller requested line-breaks -> <br>, perform a lightweight
        // preprocessing to insert Markdown hard-breaks (two spaces + \n)
        // outside of fenced/indented code blocks. This avoids importing
        // remark-breaks inside the worker which caused bundling issues.
        if (options && options.enableBreaks) {
          try {
            md = applyHardBreaks(md);
          } catch (hbErr) {
            console.warn('[vfmWorker] applyHardBreaks failed, continuing without it', hbErr);
          }
        }
        html = typeof options !== 'undefined' ? stringify(md, options) : stringify(md);
      } catch (e) {
        try { console.error('[vfmWorker] vfm.stringify failed', e); } catch (e2) { /* ignore */ }
        // No markdown-it fallback per request — return a simple error placeholder HTML
        html = '<pre><code>Preview generation failed (vfm)</code></pre>';
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

/**
 * Apply simple hard-break preprocessing: convert single newlines between
 * non-empty lines into Markdown hard-breaks (two spaces + \n), skipping
 * fenced code blocks and indented code blocks.
 */
function applyHardBreaks(md: string): string {
  const lines = md.split(/\r?\n/);
  let inFence = false;
  let fenceMarker: string | null = null;
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // detect fence open/close (``` or ~~~)
    const fenceMatch = line.match(/^(\s*)(```|~~~)/);
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
        out.push(line);
        continue;
      }
      // closing if same marker
      if (inFence && fenceMarker === marker) {
        inFence = false;
        fenceMarker = null;
        out.push(line);
        continue;
      }
    }

    // skip processing inside fenced blocks or indented code blocks
    if (inFence || /^\s{4,}|\t/.test(line)) {
      out.push(line);
      continue;
    }

    if (out.length > 0) {
      const prev = out[out.length - 1];
      if (prev.trim() !== '' && trimmed !== '') {
        // add two spaces to previous line to force a hard break in Markdown
        out[out.length - 1] = prev + '  ';
      }
    }
    out.push(line);
  }

  return out.join('\n');
}
