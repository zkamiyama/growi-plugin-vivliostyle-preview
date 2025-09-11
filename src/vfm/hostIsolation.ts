// hostIsolation.ts
// hostIsolation.ts
// Intentionally do not inject any CSS into the host page. Provide a safe
// no-op so callers can request host isolation helpers without mutating
// the global document styles.

export function ensureHostIsolationCss(): void {
  // no-op: do not create or append any <style> to document.head
  return;
}

export default ensureHostIsolationCss;
  // the style element here. Other non-invasive diagnostics and temporary inline
