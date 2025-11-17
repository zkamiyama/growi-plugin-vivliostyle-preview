// Install defensive highlighter shims and handlers before vfm initializes.
// This module is imported by the worker entry before importing vfm so that
// any internal references to Prism/hljs will resolve to our shims.
(function installShims() {
  try {
    // Global handlers: log details but prevent propagation to host console as uncaught
    (self as any).onunhandledrejection = (ev: any) => {
      try { console.error('[vfmWorker][unhandledrejection]', ev && ev.reason); } catch (e) { /* ignore */ }
      return true;
    };
    (self as any).onerror = (msg: any, src?: any, line?: any, col?: any, err?: any) => {
      try { console.error('[vfmWorker][onerror]', { msg, src, line, col, err }); } catch (e) { /* ignore */ }
      return true; // suppress default handling
    };

    const escapeHtml = (s: string) => s.replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as any)[c]);

    const makeWrapper = (name: string) => {
      const globalObj = (globalThis as any);
      const orig = globalObj[name];
      if (orig && typeof orig === 'object' && typeof orig.highlight === 'function') {
        const originalFn = orig.highlight.bind(orig);
        orig.highlight = function(a: any, b: any) {
          // compute safe preview
          let preview = '';
          try { preview = (a && a.toString && a.toString().slice ? a.toString().slice(0,80) : String(a)).slice(0,80); } catch (e) { preview = String(a); }
          // coerce falsy/invalid lang to 'text'
          const lang = (b && typeof b === 'string' && b.trim()) ? b : 'text';
          // lightweight debug - avoid heavy stack capture in hot path
          try { console.debug && console.debug('[vfmWorker][' + name + '.highlight] called', { lang, preview }); } catch (e) { /* ignore */ }
          try {
            return originalFn(a, lang);
          } catch (e) {
            // avoid noisy error logs from highlighter internals; return escaped text
            try { return { value: escapeHtml(String(a)) }; } catch (ee) { return { value: String(a) }; }
          }
        };
        globalObj[name] = orig;
      } else if (!globalObj[name]) {
        globalObj[name] = {
          highlight: function(a: any, b: any) {
            try { console.debug && console.debug('[vfmWorker][' + name + '.highlight shim] called', { lang: b }); } catch (e) { /* ignore */ }
            // return escaped content
            return { value: escapeHtml(String(a)) };
          },
        };
      }
    };

    try { makeWrapper('hljs'); } catch (e) { /* ignore */ }
    try { makeWrapper('Prism'); } catch (e) { /* ignore */ }
    try { if (!(globalThis as any).highlight) { (globalThis as any).highlight = (a: any, b: any) => { try { console.debug('[vfmWorker][highlight shim] called', { lang: b }); } catch (e) {} return { value: escapeHtml(String(a)) }; }; } } catch (e) { /* ignore */ }
  } catch (e) {
    /* ignore installation errors */
  }
})();
