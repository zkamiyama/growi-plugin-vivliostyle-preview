import { stringify } from '@vivliostyle/vfm';

self.addEventListener('message', (ev: MessageEvent) => {
  try {
    // Accept either object or JSON-string payloads. For robustness we prefer JSON string.
    let data: any = ev.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* leave as string */ }
    }
    const seq = data && (data.seq ?? null);
    let md: string = data && data.markdown ? data.markdown : '';
    // Ensure fenced code blocks without language get a safe default to avoid
    // highlighter errors like "The language \"undefined\" has no grammar.".
    // Handle several cases:
    //  - lines that are exactly ``` or ~~~ -> ```text / ~~~text
    //  - lines like ``` undefined or ``` null -> ```text
    //  - any fence with empty/blank info string -> default to text
    try {
      // exact empty fence
      md = md.replace(/^(```|~~~)\s*$/gm, '$1 text');
      // explicit 'undefined' or 'null' after fence
      md = md.replace(/^(```|~~~)\s*(?:undefined|null)\s*$/gmi, '$1 text');
      // fence with whitespace only
      md = md.replace(/^(```|~~~)\s+$/gm, '$1 text');
    } catch (e) {
      // ignore and proceed with original md
    }
    const html = stringify(md);
    // respond with JSON string to avoid any library expecting string messages
    (self as any).postMessage(JSON.stringify({ seq, ok: true, html }));
  } catch (e) {
    (self as any).postMessage(JSON.stringify({ seq: null, ok: false, error: String(e) }));
  }
});
