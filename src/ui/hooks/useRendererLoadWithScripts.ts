import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { VivlioPayload } from './useVivlioBuild';

interface Params {
  payload: VivlioPayload | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onRendererLoad: (state: unknown) => void;
}

export function useRendererLoadWithScripts({ payload, iframeRef, onRendererLoad }: Params) {
  return useCallback((state: unknown) => {
    onRendererLoad(state);

    const scripts = payload?.inlineScripts;
    if (!scripts || scripts.length === 0) {
      console.debug('[VivlioDBG] No inline scripts in payload');
      return;
    }

    const shellIframe = iframeRef.current;
    if (!shellIframe?.contentWindow) {
      console.warn('[VivlioDBG] Cannot execute scripts: no iframe contentWindow');
      return;
    }

    const iframeDocument = shellIframe.contentDocument || shellIframe.contentWindow.document;
    if (!iframeDocument) {
      console.warn('[VivlioDBG] Cannot execute scripts: no iframe document');
      return;
    }

    scripts.forEach((scriptCode: string, idx: number) => {
      try {
        const scriptElement = iframeDocument.createElement('script');
        scriptElement.type = 'module';

        const iframeWindow = iframeDocument.defaultView || shellIframe.contentWindow;
        const tempVarName = `__vivlio_script_ctx_${Date.now()}_${idx}`;
        (window as any)[tempVarName] = { doc: iframeDocument, win: iframeWindow };

        console.debug(`[VivlioDBG] Executing inline script ${idx + 1}/${scripts.length}`, {
          tempVar: tempVarName,
          iframeTitle: iframeDocument.title,
          parentTitle: window.document.title,
        });

        const wrappedCode = `
(function() {
  console.debug('[VivlioDBG][wrapper] Script starting, self.parent exists:', !!self.parent, 'tempVar:', '${tempVarName}');
  const ctx = self.parent['${tempVarName}'];
  if (!ctx) {
    console.error('[VivlioDBG] Script context not found, tempVar=${tempVarName}');
    return;
  }
  console.debug('[VivlioDBG][wrapper] Context retrieved, doc.title:', ctx.doc.title);
  delete self.parent['${tempVarName}'];
  const document = ctx.doc;
  const window = ctx.win;
  console.debug('[VivlioDBG][wrapper] Variables bound, document.title:', document.title, 'window === ctx.win:', window === ctx.win);
  try {
${scriptCode}
  } catch (err) {
    console.error('[VivlioDBG] User script error:', err);
  }
})();
`;
        scriptElement.textContent = wrappedCode;
        (iframeDocument.body || iframeDocument.documentElement).appendChild(scriptElement);

        console.debug('[VivlioDBG] Script injected into iframe', {
          index: idx,
          total: scripts.length,
          length: scriptCode.length,
        });
      } catch (err) {
        console.warn(`[VivlioDBG] Script ${idx + 1} injection error:`, err);
      }
    });
  }, [onRendererLoad, payload?.inlineScripts, iframeRef]);
}
