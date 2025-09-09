// hostIsolation.ts
export function ensureHostIsolationCss() {
  const id = 'vivlio-host-isolation';
  if (document.getElementById(id)) return;

  // Two strategies:
  // 1) Create exclusion rules so typical global resets (e.g. `*, *::before, *::after { box-sizing: border-box }`)
  //    won't apply to vivliostyle host containers. This is the preferred, non-invasive approach.
  // 2) Provide a minimal, targeted override to ensure layout calculations assume content-box and correct positioning.
  const css = `
/* Exclude vivliostyle host containers from broad global resets (non-invasive) */
*:where(:not([data-vivliostyle-outer-zoom-box],
             [data-vivliostyle-spread-container],
             [data-vivliostyle-page-container],
             [data-vivliostyle-bleed-box],
             [data-vivliostyle-page-box],
             [data-vivliostyle-page-area]))::before,
*:where(:not([data-vivliostyle-outer-zoom-box],
             [data-vivliostyle-spread-container],
             [data-vivliostyle-page-container],
             [data-vivliostyle-bleed-box],
             [data-vivliostyle-page-box],
             [data-vivliostyle-page-area]))::after,
*:where(:not([data-vivliostyle-outer-zoom-box],
             [data-vivliostyle-spread-container],
             [data-vivliostyle-page-container],
             [data-vivliostyle-bleed-box],
             [data-vivliostyle-page-box],
             [data-vivliostyle-page-area])) {
  /* leave global resets as-is for other elements */
}

/* Fallback: minimal, targeted override to ensure layout calculations assume content-box */
.vivlio-simple-viewer [data-vivliostyle-outer-zoom-box],
.vivlio-simple-viewer [data-vivliostyle-spread-container],
.vivlio-simple-viewer [data-vivliostyle-page-container],
.vivlio-simple-viewer [data-vivliostyle-bleed-box],
.vivlio-simple-viewer [data-vivliostyle-page-box] {
  box-sizing: content-box !important;
  padding: 0 !important;
  border: 0 !important;
}

/* Force correct positioning for Vivliostyle layout layers */
.vivlio-simple-viewer [data-vivliostyle-viewer-viewport] {
  display: flex !important;
  justify-content: center !important;
  align-items: flex-start !important;
  position: relative !important;
  overflow: auto;
}
.vivlio-simple-viewer [data-vivliostyle-spread-container] {
  display: flex !important;
  justify-content: center !important;
  flex: none;
  transform-origin: left top;
}
.vivlio-simple-viewer [data-vivliostyle-page-container] {
  position: relative !important;
  margin: 0 auto;
  overflow: hidden;
  box-sizing: content-box !important;
}
.vivlio-simple-viewer [data-vivliostyle-bleed-box],
.vivlio-simple-viewer [data-vivliostyle-page-box],
.vivlio-simple-viewer [data-vivliostyle-page-area] {
  /* Do not force absolute/full-stretch positioning here — let Vivliostyle
     author the stacking/positioning of these internal boxes. For safety,
     only normalize spacing and box-sizing so global resets don't break layout. */
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
}
`;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  // Safer approach: do NOT force width/height on the page-container. Instead
  // ensure viewer containers are centered and optionally perform a single
  // measurement/log so we can detect mismatches without clobbering the
  // viewer's internal coordinate system (which may use transforms/scale).

  const mmToPx = (mm: number) => (96.0 / 25.4) * mm; // helper for logging only

  const safeAdjust = (pc: Element) => {
    try {
      const el = pc as HTMLElement;
      // DO NOT mutate layout here; centering/positioning should come from
      // viewer-viewport CSS (we already set that above). Only perform a
      // one-time measurement so we can detect mismatches without interfering.

      const bleed = el.querySelector('[data-vivliostyle-bleed-box]') as HTMLElement | null;
      const pageBox = el.querySelector('[data-vivliostyle-page-box]') as HTMLElement | null;
      if (bleed && pageBox) {
        // Use bounding client rect to get rendered size (includes transforms)
          const bRect = bleed.getBoundingClientRect();
          // Choose the best candidate to represent the rendered page width:
          // 1) prefer an explicit spread container if present (covers spreads/double-pages)
          // 2) if multiple page-box elements exist, sum their widths (covers side-by-side pages)
          // 3) fallback to the single page-box rect
          const spread = el.querySelector('[data-vivliostyle-spread-container]') as HTMLElement | null;
          const pageBoxes = el.querySelectorAll('[data-vivliostyle-page-box]');
          let pRect: DOMRect;
          if (spread) {
            pRect = spread.getBoundingClientRect();
          } else if (pageBoxes && pageBoxes.length > 1) {
            // compute combined width and take min/top from first item for bounding-like object
            let totalW = 0;
            let minLeft = Number.POSITIVE_INFINITY;
            let top = 0;
            let height = 0;
            for (let i = 0; i < pageBoxes.length; ++i) {
              const r = (pageBoxes[i] as HTMLElement).getBoundingClientRect();
              totalW += r.width;
              if (r.left < minLeft) minLeft = r.left;
              if (i === 0) { top = r.top; height = r.height; }
            }
            pRect = { x: minLeft, y: top, left: minLeft, top: top, width: totalW, height, right: minLeft + totalW, bottom: top + height } as unknown as DOMRect;
          } else {
            pRect = pageBox.getBoundingClientRect();
          }
  // Instead of assuming 96dpi, measure rendered px for a given mm inside
  // the same page-container so transforms and page-scales are accounted for.
        const measureMmPx = (parent: HTMLElement, mm: number) => {
          try {
            const probe = document.createElement('div');
            probe.style.position = 'absolute';
            probe.style.left = '-9999px';
            probe.style.width = `${mm}mm`;
            probe.style.height = '0px';
            probe.style.visibility = 'hidden';
            parent.appendChild(probe);
            const val = probe.getBoundingClientRect().width;
            parent.removeChild(probe);
            return val;
          } catch (e) {
            return mmToPx(mm); // fallback
          }
        };

        const expectedDiffPx = measureMmPx(el as HTMLElement, 6); // 3mm bleed each side => 6mm total

  // Account for pageBox padding, but only subtract padding when the
  // computed box-sizing is 'content-box'. If box-sizing is 'border-box'
  // the bounding rect width already includes padding and subtracting it
  // would undercount the rendered width (causing large diffs).
  let pWidthForComparison = pRect.width;
  let pagePadding = { left: 0, right: 0, top: 0, bottom: 0 };
  // representative computed box-sizing for page-box(es)
  let representativeBoxSizing: string | null = null;
        try {
          const parsePx = (s: string | null | undefined) => {
            if (!s) return 0;
            const m = s.match(/-?[0-9.]+/);
            return m ? parseFloat(m[0]) : 0;
          };

          if (pageBoxes && pageBoxes.length > 1) {
            // Sum paddings across all pageBoxes
            let totalPadLR = 0;
            let totalPadTop = 0;
            let totalPadBottom = 0;
            for (let i = 0; i < pageBoxes.length; ++i) {
              const pbEl = pageBoxes[i] as HTMLElement;
              // determine computed box-sizing once (representative)
              if (representativeBoxSizing === null) {
                try { representativeBoxSizing = getComputedStyle(pbEl).boxSizing || null; } catch (e) { representativeBoxSizing = null; }
              }
              // prefer inline style if present
              const sl = pbEl.style;
              const plInline = parsePx(sl.paddingLeft || null);
              const prInline = parsePx(sl.paddingRight || null);
              const ptInline = parsePx(sl.paddingTop || null);
              const pbInline = parsePx(sl.paddingBottom || null);
              if (plInline || prInline || ptInline || pbInline) {
                totalPadLR += (plInline + prInline);
                totalPadTop += ptInline;
                totalPadBottom += pbInline;
                continue;
              }
              const cs = getComputedStyle(pbEl);
              totalPadLR += parsePx(cs.paddingLeft) + parsePx(cs.paddingRight);
              totalPadTop += parsePx(cs.paddingTop);
              totalPadBottom += parsePx(cs.paddingBottom);
            }
            pagePadding = { left: totalPadLR / 2, right: totalPadLR / 2, top: totalPadTop / pageBoxes.length, bottom: totalPadBottom / pageBoxes.length };
            // Only subtract aggregated padding when the representative box-sizing
            // indicates content-box. If unknown/default to NOT subtracting to
            // avoid false positives.
            if (representativeBoxSizing === 'content-box' && totalPadLR > 1) {
              pWidthForComparison = Math.max(0, pRect.width - totalPadLR);
            }
          } else {
            const pbEl = pageBox as HTMLElement;
            const sl = pbEl.style;
            const plInline = parsePx(sl.paddingLeft || null);
            const prInline = parsePx(sl.paddingRight || null);
            const ptInline = parsePx(sl.paddingTop || null);
            const pbInline = parsePx(sl.paddingBottom || null);
            if (plInline || prInline || ptInline || pbInline) {
                pagePadding = { left: plInline, right: prInline, top: ptInline, bottom: pbInline };
                // check computed box-sizing before adjusting. However, if the
                // inline style also specifies a width value, the author likely
                // intended that width in content-box terms (width + padding).
                // In that case compute an expected outer width from the inline
                // declarations so we compare against bleed correctly.
                try { representativeBoxSizing = getComputedStyle(pbEl).boxSizing || null; } catch (e) { representativeBoxSizing = null; }
                const inlineWidthPx = parsePx(sl.width || null);
                if (inlineWidthPx && (plInline + prInline) > 0) {
                  // Treat inline width as content-box: outer = width + paddings
                  pWidthForComparison = Math.max(0, inlineWidthPx + plInline + prInline);
                } else if (representativeBoxSizing === 'content-box' && (plInline + prInline) > 1) {
                  pWidthForComparison = Math.max(0, pRect.width - (plInline + prInline));
                }
            } else {
              const pageCSforPad = getComputedStyle(pbEl);
              const pl = parsePx(pageCSforPad.paddingLeft);
              const pr = parsePx(pageCSforPad.paddingRight);
              const pt = parsePx(pageCSforPad.paddingTop);
              const pbv = parsePx(pageCSforPad.paddingBottom);
              pagePadding = { left: pl, right: pr, top: pt, bottom: pbv };
              // only subtract computed padding when computed box-sizing is content-box
              representativeBoxSizing = pageCSforPad.boxSizing || null;
              if (representativeBoxSizing === 'content-box' && (pl + pr) > 1) {
                pWidthForComparison = Math.max(0, pRect.width - (pl + pr));
              }
            }
          }
        } catch (e) {
          // ignore
        }

        const actualDiff = Math.abs((bRect.width - pWidthForComparison) - expectedDiffPx);
  if (actualDiff > 8) { // threshold: 8px (tunable)
          // Collect richer diagnostics to help root-cause analysis without
          // mutating the viewer DOM. This includes computed styles, offset/
          // client sizes and any transforms applied to the elements or their
          // ancestors.
          try {
            const bleedCS = getComputedStyle(bleed);
            const pageCS = getComputedStyle(pageBox);
            const collectSizes = (n: HTMLElement) => ({
              offset: { w: n.offsetWidth, h: n.offsetHeight },
              client: { w: n.clientWidth, h: n.clientHeight },
              scroll: { w: n.scrollWidth, h: n.scrollHeight }
            });

            const findAncestorTransform = (n: HTMLElement) => {
              let cur: HTMLElement | null = n.parentElement;
              while (cur) {
                const cs = getComputedStyle(cur);
                if (cs.transform && cs.transform !== 'none') return { el: cur, transform: cs.transform };
                cur = cur.parentElement;
              }
              return null;
            };

            const bleedSizes = collectSizes(bleed);
            const pageSizes = collectSizes(pageBox);
            const bleedAncestor = findAncestorTransform(bleed as HTMLElement);
            const pageAncestor = findAncestorTransform(pageBox as HTMLElement);

            // eslint-disable-next-line no-console
            // Provide richer diagnostics to ease root-cause analysis in the wild.
            const getElementPath = (node?: Element | null) => {
              try {
                if (!node) return null;
                const parts: string[] = [];
                let cur: Element | null = node;
                while (cur && cur.nodeType === 1) {
                  let part = cur.tagName.toLowerCase();
                  if ((cur as HTMLElement).id) part += `#${(cur as HTMLElement).id}`;
                  else if (cur.classList && cur.classList.length) part += `.${Array.from(cur.classList).slice(0,3).join('.')}`;
                  const parent = cur.parentElement;
                  if (parent) {
                    const idx = Array.prototype.indexOf.call(parent.children, cur) + 1;
                    part += `:nth-child(${idx})`;
                  }
                  parts.unshift(part);
                  cur = cur.parentElement;
                }
                return parts.join(' > ');
              } catch (e) { return null; }
            };
            const truncate = (s: string | null | undefined, n = 200) => {
              if (!s) return s;
              return s.length > n ? s.slice(0, n) + '…' : s;
            };

            const diag = {
              pageContainer: el,
              pageContainerRect: el.getBoundingClientRect(),
              bleedSize: { w: bRect.width, h: bRect.height },
              pageBoxSize: { w: pRect.width, h: pRect.height },
              expectedBleedPx: expectedDiffPx,
              actualDiff,
              bleedBounding: bRect,
              pageBounding: pRect,
              bleedComputed: { width: bleedCS.width, height: bleedCS.height, transform: bleedCS.transform, boxSizing: bleedCS.boxSizing },
              pageComputed: { width: pageCS.width, height: pageCS.height, transform: pageCS.transform, boxSizing: pageCS.boxSizing },
              // reveal padding so we can see if padding explains the size delta
              pagePadding,
              bleedOffsets: bleedSizes,
              pageOffsets: pageSizes,
              bleedAncestorTransform: bleedAncestor,
              pageAncestorTransform: pageAncestor,
              // helpful, human-readable locations
              bleedPath: getElementPath(bleed as Element),
              pageBoxPath: getElementPath(pageBox as Element),
              // avoid dumping huge HTML, but provide a short snippet for context
              bleedOuterSnippet: truncate((bleed as HTMLElement).outerHTML, 300),
              pageBoxOuterSnippet: truncate((pageBox as HTMLElement).outerHTML, 300),
              // counts to show unexpected wrappers/content
              pageContainerChildCounts: { total: el.querySelectorAll('*').length, directChildren: (el as HTMLElement).children.length },
              devicePixelRatio: (typeof window !== 'undefined' && (window as any).devicePixelRatio) || 1
            };
            // log and also save last diagnostics to a global for interactive inspection
            console.warn('[VivlioDBG] page/bleed size mismatch detected', diag);
            try { (window as any).__vivlio_lastDiag = diag; } catch (e) { /* ignore */ }
            // As a fast diagnostic, try temporarily disabling any ancestor transform
            // that might be affecting the rendered scale. Restore after 3000ms.
            try {
              const bleedAncestor = findAncestorTransform(bleed as HTMLElement);
              const pageAncestor = findAncestorTransform(pageBox as HTMLElement);
              let changed = false;
              if (bleedAncestor) changed = overrideAncestorTransform(bleedAncestor) || changed;
              if (pageAncestor) changed = overrideAncestorTransform(pageAncestor) || changed;
              if (changed) {
                // eslint-disable-next-line no-console
                console.info('[VivlioDBG] temporarily disabled ancestor transform(s) for diagnosis; call window.__vivlio_restoreTransform() to restore immediately.');
                setTimeout(() => { try { restoreTransformOverrides(); } catch (e) {} }, 3000);
              }
            } catch (e) {
              // ignore
            }
          } catch (innerErr) {
            // fallback to simple log if diagnostics collection fails
            // eslint-disable-next-line no-console
            console.warn('[VivlioDBG] page/bleed size mismatch detected (partial)', {
              pageContainer: el,
              bleedSize: { w: bRect.width, h: bRect.height },
              pageBoxSize: { w: pRect.width, h: pRect.height },
              expectedBleedPx: expectedDiffPx,
              actualDiff
            });
          }
        }
      }
    } catch (e) {
      // ignore errors; this helper must be non-fatal
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (!(node instanceof Element)) continue;
        if (node.matches && node.matches('[data-vivliostyle-page-container]')) safeAdjust(node);
        if (node.querySelectorAll) {
          const found = node.querySelectorAll('[data-vivliostyle-page-container]');
          for (const f of Array.from(found)) safeAdjust(f);
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Run once immediately in case elements already exist
  document.querySelectorAll('[data-vivliostyle-page-container]').forEach(safeAdjust);

  // Keep track of any temporary transform overrides so we can restore them
  const transformOverrides = new Map<HTMLElement, string | null>();
  const overrideAncestorTransform = (candidate: { el: Element; transform: string } | null) => {
    if (!candidate || !candidate.el) return false;
    const el = candidate.el as HTMLElement;
    if (transformOverrides.has(el)) return false; // already overridden
    try {
      const orig = el.style.transform || null;
      transformOverrides.set(el, orig);
      // Apply a non-destructive override
      el.style.transform = 'none';
      // Also set transform-origin to neutral to avoid shift in some browsers
      el.style.transformOrigin = '0 0';
      return true;
    } catch (e) {
      return false;
    }
  };
  const restoreTransformOverrides = () => {
    for (const [el, orig] of transformOverrides) {
      try {
        if (orig === null) {
          el.style.removeProperty('transform');
        } else {
          el.style.transform = orig;
        }
      } catch (e) {
        // ignore
      }
    }
    transformOverrides.clear();
  };

  // Expose restore hook for manual testing in the console
  try { (window as any).__vivlio_restoreTransform = restoreTransformOverrides; } catch (e) { /* ignore */ }
}
