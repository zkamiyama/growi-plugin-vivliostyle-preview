import React from 'react';
import { VivlioPayload } from '../hooks/useVivlioBuild';

interface VivlioInfoPanelProps {
  payload: VivlioPayload | null;
  readingDirection?: 'ltr' | 'rtl';
  onRefreshDependencies?: () => void;
  jsEnabled?: boolean;
  onEnableJavaScript?: () => void;
}

interface SectionProps {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  onCopy?: () => void;
  copied?: boolean;
  actionLabel?: string;
  children?: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, collapsed, onToggle, onCopy, copied, actionLabel, children }) => (
  <div className="vivlio-section">
    <div className="vivlio-section-header" onClick={onToggle} role="button" tabIndex={0}>
      <div className="vivlio-section-title">
        <span className="vivlio-section-arrow">{collapsed ? '+' : '-'}</span>
        <span className="vivlio-section-title-text">{title}</span>
      </div>
      {onCopy && (
        <button
          onClick={(event) => { event.stopPropagation(); onCopy(); }}
          aria-label={`${actionLabel ?? 'Copy'} ${title}`}
          className={`vivlio-section-copy ${copied ? 'active' : ''}`}
        >
          {copied ? 'Copied' : (actionLabel ?? 'Copy')}
        </button>
      )}
    </div>
    {!collapsed && (
      <div className="vivlio-section-content">
        <div className="vivlio-section-scroll">{children}</div>
      </div>
    )}
  </div>
);

export const VivlioInfoPanel: React.FC<VivlioInfoPanelProps> = ({
  payload,
  readingDirection,
  onRefreshDependencies,
  jsEnabled = false,
  onEnableJavaScript,
}) => {
  const [collapsed, setCollapsed] = React.useState({ md: true, userCss: true, compCss: true, html: true, inlineJs: true, deps: false });
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const localScrollStyles = `
    .vivlio-simple-viewer .vivlio-section-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.14) transparent; }
    .vivlio-simple-viewer .vivlio-section-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
    .vivlio-simple-viewer .vivlio-section-scroll::-webkit-scrollbar-track { background: transparent; }
    .vivlio-simple-viewer .vivlio-section-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 8px; }
    .vivlio-simple-viewer .vivlio-section-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
  `;

  // Use simple labels without arrow symbols: '右左' / '左右'
  const readingDirectionLabel = readingDirection === 'rtl' ? '右左 (rtl)' : '左右 (ltr)';
  const inlineScriptPreview = payload?.inlineScripts?.length
    ? payload.inlineScripts.map((code, idx) => `/* Script ${idx + 1} */\n${code}`).join('\n\n')
    : '';
  const handleCopy = (key: string, value?: string) => {
    if (!value) return;
    try {
      navigator.clipboard?.writeText(value);
      setCopiedKey(key);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopiedKey(null), 1500);
    } catch (e) {
      console.warn('[VivlioDBG] clipboard copy failed', e);
    }
  };

  return (
    <div className={`vivlio-info-panel fullscreen`}>
      <style>{localScrollStyles}</style>
      <div className="vivlio-info-title">
        <span>Vivliostyle Info</span>
      </div>
      <div className="vivlio-info-body">
        <div style={{ fontSize: 12, marginBottom: 8 }}>
          <div><strong>Reading direction:</strong> {readingDirection ? readingDirectionLabel : 'unknown'}</div>
        </div>

        <Section
          title="Dependencies"
          collapsed={collapsed.deps}
          onToggle={() => setCollapsed((state) => ({ ...state, deps: !state.deps }))}
          onCopy={onRefreshDependencies}
          copied={false}
          actionLabel="Reload"
        >
          <div style={{ fontSize: 12, padding: '4px 0' }}>
            {payload && payload.dependencies && payload.dependencies.length > 0 ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  <strong>Inherited from {payload.dependencies.length} page(s):</strong>
                </div>
                <ul style={{ margin: 0, paddingLeft: 20, listStyleType: 'disc' }}>
                  {payload.dependencies.map((dep, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>
                      <code style={{ fontSize: 11, background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: 2 }}>
                        {dep}
                      </code>
                    </li>
                  ))}
                </ul>
                {/* Reload action is now in the section header */}
              </>
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                No dependencies (no parent CSS inherited)
              </div>
            )}
          </div>
        </Section>

        {/* Source URL display removed - use HTML / copy raw HTML instead */}

        {/* Config section removed: Use Build PDF dialog for Config editing */}

        <Section
          title="Raw Markdown"
          collapsed={collapsed.md}
          onToggle={() => setCollapsed((state) => ({ ...state, md: !state.md }))}
          onCopy={() => handleCopy('md', payload?.rawMarkdown || '')}
          copied={copiedKey === 'md'}
        >
          <pre className="vivlio-pre-small">{payload ? (payload.rawMarkdown || '(empty)') : '(not built yet)'}</pre>
        </Section>

        <Section
          title="User CSS"
          collapsed={collapsed.userCss}
          onToggle={() => setCollapsed((state) => ({ ...state, userCss: !state.userCss }))}
          onCopy={() => handleCopy('userCss', payload?.userCss || '')}
          copied={copiedKey === 'userCss'}
        >
          <pre className="vivlio-pre-small">{payload ? (payload.userCss || '(empty)') : '(not built yet)'}</pre>
        </Section>
        {/* Dependencies moved above */}

        <Section
          title="Resolved CSS"
          collapsed={collapsed.compCss}
          onToggle={() => setCollapsed((state) => ({ ...state, compCss: !state.compCss }))}
          onCopy={() => handleCopy('compCss', payload?.finalCss || '')}
          copied={copiedKey === 'compCss'}
        >
          <pre className="vivlio-pre-small">{payload ? (payload.finalCss || '(empty)') : '(not built yet)'}</pre>
        </Section>

        <Section
          title="HTML"
          collapsed={collapsed.html}
          onToggle={() => setCollapsed((state) => ({ ...state, html: !state.html }))}
          onCopy={() => handleCopy('html', payload?.html || '')}
          copied={copiedKey === 'html'}
        >
          <pre className="vivlio-pre">{payload ? (payload.html || '(none)') : '(not built yet)'}</pre>
        </Section>
        {/* Inline Scripts are shown below the enable-button */}
        <div className="vivlio-info-footer" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
            ⚠️ Enable only trusted scripts. Injected JavaScript runs with full access to the GROWI page.
          </div>
          <button
            type="button"
            onClick={onEnableJavaScript}
            disabled={!onEnableJavaScript || jsEnabled}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.3)',
              background: jsEnabled ? 'rgba(80, 150, 100, 0.25)' : 'transparent',
              color: '#fff',
              fontWeight: 600,
              cursor: !onEnableJavaScript || jsEnabled ? 'not-allowed' : 'pointer',
              opacity: !onEnableJavaScript || jsEnabled ? 0.6 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 160,
              alignSelf: 'flex-start',
            }}
          >
            {jsEnabled ? 'JavaScript is active' : 'Enable JavaScript preview'}
          </button>
        </div>
        {/* Inline Scripts: show _after_ the enable button to make the control the primary focus */}
        {payload && payload.inlineScripts && payload.inlineScripts.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Section
              title="Inline Scripts"
              collapsed={collapsed.inlineJs}
              onToggle={() => setCollapsed((state) => ({ ...state, inlineJs: !state.inlineJs }))}
              onCopy={() => handleCopy('inlineJs', inlineScriptPreview)}
              copied={copiedKey === 'inlineJs'}
            >
              <pre className="vivlio-pre-small">
                {inlineScriptPreview || '(empty)'}
              </pre>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
};

export default VivlioInfoPanel;
