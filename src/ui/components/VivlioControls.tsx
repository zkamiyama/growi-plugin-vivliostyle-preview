import React from "react";
import { PageViewMode } from "@vivliostyle/core";

export const VIVLIO_HEADER_HEIGHT = 30; // button height (~28px) + margin

interface VivlioControlsProps {
  showInfo: boolean;
  onToggleInfo: () => void;
  showRaw: boolean;
  onToggleRaw: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  viewerReady: boolean;
  page: number;
  pageCount: number | null;
  renderProgress?: { page: number | null; pageCount: number | null };
  readingDirection?: "ltr" | "rtl";
  pageViewMode: PageViewMode;
  onTogglePageView: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

const baseButton: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "6px 14px",
  minHeight: 24,
  background: "rgba(32,32,36,0.9)",
  color: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(255,255,255,0.22)",
  borderRadius: 9,
  boxShadow: "0 4px 14px rgba(0,0,0,0.34)",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1,
  backdropFilter: "blur(6px)",
  transition: "background 0.2s ease, transform 0.2s ease",
};

const navButtonStyle: React.CSSProperties = { ...baseButton, minWidth: 38 };
const tagButtonStyle: React.CSSProperties = { ...baseButton };
const pageIndicatorStyle: React.CSSProperties = { ...baseButton, minWidth: 90, pointerEvents: "none" };

export const VivlioControls: React.FC<VivlioControlsProps> = ({
  showInfo,
  onToggleInfo,
  showRaw,
  onToggleRaw,
  onPrevPage,
  onNextPage,
  viewerReady,
  page,
  pageCount,
  renderProgress,
  readingDirection = "ltr",
  pageViewMode,
  onTogglePageView,
  zoom,
  onZoomIn,
  onZoomOut,
}) => {
  const isRtl = readingDirection === "rtl";
  const handleLeftClick = isRtl ? onNextPage : onPrevPage;
  const handleRightClick = isRtl ? onPrevPage : onNextPage;
  const leftTitle = isRtl ? "Next page" : "Previous page";
  const rightTitle = isRtl ? "Previous page" : "Next page";
  // Always display a single character indicating "2" (two-pages / spread)
  // The button still toggles view but the label should remain a single glyph
  const viewModeLabel = "2";
  const viewModeTitle = pageViewMode === PageViewMode.SPREAD ? "Switch to single-page view" : "Switch to spread view";

  const indicatorLabel = viewerReady
    ? (pageCount ? `${page} / ${pageCount}` : `${page} / ...`)
    : (renderProgress?.page
        ? `~${renderProgress.page}${renderProgress.pageCount ? ` / ${renderProgress.pageCount}` : ' / ...'}`
        : '-- / --');
  const indicatorTitle = viewerReady
    ? 'Current page position'
    : (renderProgress?.page
        ? 'Rendering pages... counts are approximate until the viewer finishes'
        : 'Preparing preview...');

  return (
    <header className="vivlio-header-bar" data-reading-direction={readingDirection}>
      <div className="vivlio-header-left">
        <button onClick={handleLeftClick} title={leftTitle} aria-label={leftTitle} style={navButtonStyle} disabled={!viewerReady}>
          {"<"}
        </button>
        <button onClick={handleRightClick} title={rightTitle} aria-label={rightTitle} style={navButtonStyle} disabled={!viewerReady}>
          {">"}
        </button>
        <span style={{ ...pageIndicatorStyle, opacity: viewerReady ? 1 : 0.7 }} title={indicatorTitle}>
          {indicatorLabel}
        </span>
      </div>
      <div className="vivlio-header-right">
        <button
          onClick={onZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
          style={tagButtonStyle}
          disabled={!viewerReady}
        >
          -
        </button>
        <span style={{ ...pageIndicatorStyle, opacity: viewerReady ? 1 : 0.55, minWidth: 60 }}>
          {viewerReady ? `${Math.round(zoom * 100)}%` : "--%"}
        </span>
        <button
          onClick={onZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
          style={tagButtonStyle}
          disabled={!viewerReady}
        >
          +
        </button>
        <button
          onClick={onTogglePageView}
          title={viewModeTitle}
          aria-label={viewModeTitle}
          aria-pressed={pageViewMode === PageViewMode.SPREAD}
          style={{ ...tagButtonStyle, background: pageViewMode === PageViewMode.SPREAD ? "rgba(58,58,70,0.95)" : tagButtonStyle.background }}
        >
          {viewModeLabel}
        </button>
        <button
          onClick={onToggleRaw}
          title="Toggle raw HTML"
          aria-label="Toggle raw HTML"
          style={{ ...tagButtonStyle, background: showRaw ? "rgba(58,58,70,0.95)" : tagButtonStyle.background }}
        >
          HTML
        </button>
        <button
          onClick={onToggleInfo}
          title="Toggle info"
          aria-label="Toggle info"
          style={{ ...tagButtonStyle, background: showInfo ? "rgba(58,58,70,0.95)" : tagButtonStyle.background }}
        >
          INFO
        </button>
      </div>
    </header>
  );
};

export default VivlioControls;
