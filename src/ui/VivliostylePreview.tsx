import React, { useEffect, useState } from 'react';
import { Renderer } from '@vivliostyle/react';
import { buildVfmPayload } from '../vfm/buildVfmHtml';

interface VivliostylePreviewProps {
  markdown: string;
}

export const VivliostylePreview: React.FC<VivliostylePreviewProps> = ({ markdown }) => {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [showMargins, setShowMargins] = useState(false);
  // keep clipboard/copy helper state (item 7)
  const copyTimerRef = React.useRef<number | null>(null);
  // info/raw view states
  const [showInfo, setShowInfo] = useState(false);
  const [showRawInline, setShowRawInline] = useState<boolean>(false);
  const [vivlioPayload, setVivlioPayload] = useState<any>(null);

  
  // collapsible Section helper (kept minimal to support copy UI if needed)
  const Section: React.FC<{ title: string; copy?: () => void; active?: boolean; children?: React.ReactNode }> = ({ title, copy, active, children }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13 }}>{title}</div>
        {copy && (
          <button onClick={(e) => { e.stopPropagation(); copy(); }} style={{ padding: '4px 8px', fontSize: 12 }}>{active ? 'Copied' : 'Copy'}</button>
        )}
      </div>
      <div>{children}</div>
    </div>
  );

  // local scrollbar styles kept minimal (could be removed)
  const localScrollStyles = ` .vivlio-simple-viewer .vivlio-section-scroll { scrollbar-width: thin; } `;

  // lastCopied and copy timer (item 7)
  const [lastCopiedLocal, setLastCopiedLocal] = useState<string | null>(null);
  const doCopy = (key: string, text?: string) => {
    if (!text) return;
    try { navigator.clipboard?.writeText(text); } catch (e) { /* ignore */ }
    setLastCopiedLocal(key);
    if (copyTimerRef.current) { window.clearTimeout(copyTimerRef.current); }
    copyTimerRef.current = window.setTimeout(() => setLastCopiedLocal(null), 1500);
  };

  // unified button base style
  const btnBase: React.CSSProperties = {
  padding: '6px 12px',
  background: 'rgba(40,40,40,0.55)',
  color: 'rgba(255,255,255,0.95)',
  border: '1px solid rgba(255,255,255,0.06)',
  backdropFilter: 'blur(6px)',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 12,
  boxShadow: '0 4px 10px rgba(0,0,0,0.18)'
  };

  // NOTE: debug collection and page heuristics removed to keep preview minimal.

  // Page navigation and viewer API removed to keep preview minimal.

  const openRawHtml = () => { /* retained as a no-op placeholder if needed */ };

  // info panel/debug collection removed for minimal display

  useEffect(() => {
    if (!markdown) {
      setSourceUrl(null);
      return;
    }

    try {
      const payload = buildVfmPayload(markdown, {
        inlineCss: showMargins ? `
          html, body { margin: 0 !important; padding: 0 !important; }
          @page { size: 148mm 210mm; margin: 12mm; }
        ` : undefined,
        inlineScript: `window.addEventListener('load', () => {});`
      });
  setVivlioPayload(payload);
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`;
  setSourceUrl(dataUrl);
    } catch (error) {
      console.error('[VivlioDBG] Error building HTML:', error);
      setSourceUrl(null);
    }
  }, [markdown, showMargins]);

  // Diagnostic CSS injection removed for minimal preview
  if (!sourceUrl) return <div>Loading...</div>;

  return (
    <div className="vivlio-simple-viewer" style={{ height: '100%', width: '100%', position: 'relative' }}>
  {/* Info button */}
  <button
    onClick={() => setShowInfo((s) => !s)}
    title="Toggle info"
    aria-label="Toggle info"
    style={{ position: 'absolute', top: 10, right: 24, zIndex: 1000, ...btnBase, padding: '6px' }}
  >
    ℹ️
  </button>

  {/* Raw HTML toggle button */}
  <button
    onClick={() => setShowRawInline((s) => !s)}
    title="Open raw HTML"
    aria-label="Open raw HTML"
    style={{ position: 'absolute', top: 10, right: 104, zIndex: 1000, ...btnBase, padding: '6px' }}
  >
    🧾
  </button>

  {/* Margin visualization toggle button (item 8) */}
  <button onClick={() => setShowMargins(!showMargins)} title={showMargins ? 'Disable margins' : 'Enable margins'} aria-label="Toggle margins" style={{ position: 'absolute', top: 10, right: 64, zIndex: 1000, ...btnBase, padding: '6px', background: showMargins ? 'rgba(255,165,0,0.9)' : btnBase.background }}>📐</button>

      {/* Renderer with margin visualization */}
  <div style={{ height: '100%', width: '100%', position: 'relative' }}>
        {sourceUrl && (
          showRawInline ? (
            <iframe
              key={sourceUrl + (showMargins ? '_m' : '_n') + '_raw'}
              src={sourceUrl}
              title="Vivliostyle Raw HTML"
              style={{ width: '100%', height: '100%', border: 0 }}
            />
          ) : (
            <Renderer
              key={sourceUrl + (showMargins ? '_m' : '_n')}
              source={sourceUrl}
              onLoad={() => { /* minimal onLoad: no debug or page heuristics */ }}
            >
              {({ container }: any) => container}
            </Renderer>
          )
        )}
      </div>

      {/* Information panel (minimal) */}
      {showInfo && (
        <div style={{ position: 'absolute', top: 40, right: 20, width: 560, height: '60vh', background: 'rgba(28,28,30,0.95)', color: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: 12, zIndex: 1000, overflow: 'auto', fontSize: 12, backdropFilter: 'blur(6px)' }}>
          <style>{localScrollStyles}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>Vivliostyle Info</strong>
            <span style={{ fontSize: 12, opacity: 0.9 }}>{showMargins ? 'Margins ON' : 'Margins OFF'}</span>
          </div>
          <Section title="Raw Markdown" copy={() => doCopy('md', vivlioPayload?.rawMarkdown || '')} active={lastCopiedLocal === 'md'}>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto', background: 'rgba(0,0,0,0.06)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.rawMarkdown || '(empty)') : '(not built yet)'}</pre>
          </Section>
          <Section title="Final HTML" copy={() => doCopy('html', vivlioPayload?.html || '')} active={lastCopiedLocal === 'html'}>
            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 320, overflow: 'auto', background: 'rgba(0,0,0,0.04)', padding: 8, borderRadius: 6, fontSize: 11 }}>{vivlioPayload ? (vivlioPayload.html || '(none)') : '(not built yet)'}</pre>
          </Section>
        </div>
      )}
    </div>
  );
};

/**
 * If any ancestor (up to document.body) has a computed transform other than
 * 'none', temporarily set inline style transform='none' for diagnosis and
 * layout. The function registers window.__vivlio_restoreTransform() that
 * restores original transforms.
 */
// Ancillary diagnostics removed to keep preview minimal.
