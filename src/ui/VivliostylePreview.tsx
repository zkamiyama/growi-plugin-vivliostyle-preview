import { PageViewMode } from '@vivliostyle/core';
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./VivliostylePreview.css";
import { useVivlioBuild } from "./hooks/useVivlioBuild";
import { useVivlioViewerState } from "./hooks/useVivlioViewerState";
import VivlioControls, { VIVLIO_HEADER_HEIGHT } from "./components/VivlioControls";
import VivlioInfoPanel from "./components/VivlioInfoPanel";
import { VivlioViewerFrame } from "./components/VivlioViewerFrame";
import NotificationHud from "./NotificationHud";

interface VivliostylePreviewProps {
  markdown: string;
}

const GUTTER_COLOR = "#aaaaaa";

export const VivliostylePreview: React.FC<VivliostylePreviewProps> = ({ markdown: incomingMarkdown }) => {
  const [previewMarkdown, setPreviewMarkdown] = useState(incomingMarkdown);
  const [isAutoPreviewEnabled, setIsAutoPreviewEnabled] = useState(true);

  // Keep preview markdown in sync with incoming markdown when auto mode is enabled
  useEffect(() => {
    if (isAutoPreviewEnabled) {
      setPreviewMarkdown(incomingMarkdown);
    }
  }, [incomingMarkdown, isAutoPreviewEnabled]);

  // Alias for existing logic that expects `markdown` to be the previewed content
  const markdown = previewMarkdown;
  const { payload, sourceUrl, isBuilding, refreshDependencies, error, retryBuild, buildStage } = useVivlioBuild(markdown);

  const pageProgression = useMemo(() => detectPageProgressionDirection(payload?.finalCss, payload?.html), [payload?.finalCss, payload?.html]);
  const readingDirection = pageProgression ?? "ltr";
  const [pageViewMode, setPageViewMode] = useState(PageViewMode.SINGLE_PAGE);
  const [zoom, setZoom] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const savedPageOnMarkdownChangeRef = useRef<number | null>(null);

  const {
    page,
    pageCount,
    viewerReady,
    nextPage,
    prevPage,
    handleRendererLoad,
    handleRendererNavigation,
    reset,
    renderProgress,
    pageSourceRef,
  } = useVivlioViewerState(pageViewMode, readingDirection, savedPageOnMarkdownChangeRef);

  const [showInfo, setShowInfo] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [isJsEnabled, setIsJsEnabled] = useState(false);
  const [timeSliceInfo, setTimeSliceInfo] = useState<{ count: number; lastTimestamp: number } | null>(null);
  const handleManualRebuild = useCallback(() => {
    setPreviewMarkdown(incomingMarkdown);
    if (previewMarkdown === incomingMarkdown) {
      retryBuild();
    }
  }, [incomingMarkdown, previewMarkdown, retryBuild]);
  const handleToggleAutoPreview = useCallback(() => {
    setIsAutoPreviewEnabled((prev) => !prev);
  }, []);
  const handleToggleJs = useCallback(() => {
    setIsJsEnabled((prev) => !prev);
    handleManualRebuild();
  }, [handleManualRebuild]);
  const handleEnableJsFromInfo = useCallback(() => {
    if (isJsEnabled) return;
    setIsJsEnabled(true);
    handleManualRebuild();
  }, [isJsEnabled, handleManualRebuild]);
  const isPreviewStale = !isAutoPreviewEnabled && previewMarkdown !== incomingMarkdown;

  // Track the last page confirmed by renderer (viewerReady + not building)
  const lastConfirmedPageRef = useRef<number>(1);
  useEffect(() => {
    if (!isBuilding && viewerReady) {
      lastConfirmedPageRef.current = page;
    }
  }, [isBuilding, viewerReady, page]);

  // Save current page (or last confirmed page if build is running) before reset when markdown changes
  const lastMarkdownRef = useRef<string>(markdown);
  useEffect(() => {
    if (markdown !== lastMarkdownRef.current) {
      const currentSource = pageSourceRef.current;
      const pageToSave = isBuilding
        ? lastConfirmedPageRef.current
        : currentSource === 'user'
          ? page
          : (lastConfirmedPageRef.current ?? page);
      savedPageOnMarkdownChangeRef.current = pageToSave;
      // eslint-disable-next-line no-console
      console.debug('[VivlioDBG][preserve][parent] savedPageOnMarkdownChangeRef =', pageToSave, '(page', page, 'viewerReady', viewerReady, 'isBuilding', isBuilding, 'source', currentSource, ')');
      lastMarkdownRef.current = markdown;
      // Now reset (which will use the saved page for restoration after rendering)
      reset();
    }
  }, [markdown, reset, page, isBuilding, viewerReady, pageSourceRef]);

  useEffect(() => {
    if (viewerReady) {
      setTimeSliceInfo(null);
    }
  }, [viewerReady]);

  useEffect(() => {
    if (isBuilding) {
      setTimeSliceInfo(null);
    }
  }, [isBuilding]);

  const handleTimeSlicePulse = useCallback(() => {
    setTimeSliceInfo((prev) => ({
      count: (prev?.count ?? 0) + 1,
      lastTimestamp: Date.now(),
    }));
  }, []);

  useEffect(() => {
    const originalDebug = console.debug;
    if (typeof originalDebug !== 'function') {
      return () => {};
    }
    const patched: typeof console.debug = (...args: any[]) => {
      try {
        const first = args[0];
        if (typeof first === 'string' && first.includes('-- time slice --')) {
          handleTimeSlicePulse();
        }
      } catch (err) {
        // ignore hook errors but still log
      }
      return originalDebug.apply(console, args as any);
    };
    console.debug = patched;
    return () => {
      console.debug = originalDebug;
    };
  }, [handleTimeSlicePulse]);

  const handleTogglePageView = () => {
    setPageViewMode(mode => (mode === PageViewMode.SPREAD ? PageViewMode.SINGLE_PAGE : PageViewMode.SPREAD));
  };

  const handleZoomIn = () => {
    setZoom(z => Math.min(z + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setZoom(z => Math.max(z - 0.25, 0.5));
  };

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
  };

  const stageMessages: Record<string, string> = {
    scheduled: 'Waiting for editor updates…',
    'worker:init': 'Warming up renderer…',
    'worker:normalize:done': 'Normalizing markdown…',
    'worker:hardBreaks:start': 'Applying hard breaks…',
    'worker:hardBreaks:done': 'Finishing layout prep…',
    'worker:stringify:start': 'Typesetting pages…',
    'worker:stringify:done': 'Preparing viewer payload…',
    'worker:payload:ready': 'Injecting preview HTML…',
    'worker:queued': 'Queued build…',
    retry: 'Retrying build…',
    timeout: 'Build timed out',
    error: 'Build failed',
  };

  const buildStageText = buildStage
    ? (stageMessages[buildStage] || buildStage.split(':').slice(-1)[0] || buildStage)
    : null;

  const renderProgressText = (!viewerReady && renderProgress.page)
    ? `Rendering page ${renderProgress.page}${renderProgress.pageCount ? ` / ${renderProgress.pageCount}` : ''}`
    : null;

  const timeSliceText = (!viewerReady && timeSliceInfo)
    ? `Vivliostyle is still typesetting pages (pass ${timeSliceInfo.count})`
    : null;

  const hudVisible = !!(error || isBuilding || !viewerReady);
  const hudStatus = error ? 'error' : 'loading';
  const hudPrimary = error
    ? (error.type === 'timeout' ? 'Preview build timed out' : 'Preview build failed')
    : (renderProgressText || timeSliceText || buildStageText || (isBuilding ? 'Building…' : 'Initializing preview…'));
  const hudDescription = error
    ? (error.autoRetryScheduled && error.nextRetryInMs
        ? `Retrying in ${(error.nextRetryInMs / 1000).toFixed(1)}s (attempt ${error.attempt})`
        : (error.detail || `Attempt ${error.attempt}`))
    : (!error && buildStageText && hudPrimary !== buildStageText ? buildStageText : undefined);
  const hudActionLabel = error ? 'Retry now' : undefined;

  return (
    <div
      ref={containerRef}
      className="vivlio-simple-viewer"
      style={{
        ["--vivlio-gutter" as any]: GUTTER_COLOR,
        ["--vivlio-header-height" as any]: `${VIVLIO_HEADER_HEIGHT}px`,
      }}
    >
      <VivlioControls
        showInfo={showInfo}
        onToggleInfo={() => setShowInfo((state) => !state)}
        showRaw={showRaw}
        onToggleRaw={() => setShowRaw((state) => !state)}
        autoPreviewEnabled={isAutoPreviewEnabled}
        autoPreviewStale={isPreviewStale}
        onToggleAutoPreview={handleToggleAutoPreview}
        jsEnabled={isJsEnabled}
        onToggleJs={handleToggleJs}
        onManualRebuild={handleManualRebuild}
        onPrevPage={prevPage}
        onNextPage={nextPage}
        viewerReady={viewerReady}
        page={page}
        pageCount={pageCount}
        renderProgress={renderProgress}
        readingDirection={readingDirection}
        pageViewMode={pageViewMode}
        onTogglePageView={handleTogglePageView}
        zoom={zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />

      <div className="vivlio-content-area">
        <VivlioViewerFrame
          payload={payload}
          sourceUrl={sourceUrl}
          showRaw={showRaw}
          gutterColor={GUTTER_COLOR}
          page={page}
          onRendererLoad={handleRendererLoad}
          runInlineScripts={isJsEnabled}
          onRendererNavigation={handleRendererNavigation}
          onReset={reset}
          viewerReady={viewerReady}
          isBuilding={isBuilding}
          pageViewMode={pageViewMode}
          readingDirection={readingDirection}
          pageCount={pageCount}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          error={error}
          onRetry={retryBuild}
        />

        {showInfo && (
          <VivlioInfoPanel
            payload={payload}
            readingDirection={readingDirection}
            onRefreshDependencies={refreshDependencies}
            jsEnabled={isJsEnabled}
            onEnableJavaScript={handleEnableJsFromInfo}
          />
        )}
      </div>

      <NotificationHud
        container={containerRef.current}
        visible={hudVisible}
        text={hudPrimary}
        description={hudDescription}
        status={hudStatus}
        actionLabel={hudActionLabel}
        onAction={error ? retryBuild : undefined}
        actionDisabled={isBuilding}
      />
    </div>
  );
};
function detectPageProgressionDirection(css?: string | null, html?: string | null): 'ltr' | 'rtl' | null {
  const sourceCss = css ?? '';
  const sourceHtml = html ?? '';

  const cssMatch = sourceCss.match(/page-progression-direction\s*:\s*(rtl|ltr)/i);
  if (cssMatch) {
    return cssMatch[1].toLowerCase() as 'ltr' | 'rtl';
  }

  const htmlDirMatch = sourceHtml.match(/dir\s*=\s*['"](rtl|ltr)['"]/i);
  if (htmlDirMatch) {
    return htmlDirMatch[1].toLowerCase() as 'ltr' | 'rtl';
  }

  const writingModeMatch = sourceCss.match(/writing-mode\s*:\s*([a-z-]+)/i);
  if (writingModeMatch) {
    const mode = writingModeMatch[1].toLowerCase();
    if (mode.includes('vertical-rl')) {
      return 'rtl';
    }
  }

  const directionMatch = sourceCss.match(/direction\s*:\s*(rtl|ltr)/i);
  if (directionMatch) {
    return directionMatch[1].toLowerCase() as 'ltr' | 'rtl';
  }

  return null;
}

