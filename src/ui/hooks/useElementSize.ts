import { MutableRefObject, useEffect, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

const DEFAULT_SIZE: ElementSize = { width: 0, height: 0 };

export function useElementSize<T extends HTMLElement>(
  ref: MutableRefObject<T | null>,
  enabled = true
): ElementSize {
  const [size, setSize] = useState<ElementSize>(DEFAULT_SIZE);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const target = ref.current;
    if (!target) {
      return;
    }

    let frameId: number | null = null;

    const update = () => {
      try {
        const rect = target.getBoundingClientRect();
        setSize((prev) => {
          const nextWidth = Math.max(0, Math.round(rect.width));
          const nextHeight = Math.max(0, Math.round(rect.height));
          if (prev.width === nextWidth && prev.height === nextHeight) {
            return prev;
          }
          return { width: nextWidth, height: nextHeight };
        });
      } catch (e) {
        /* ignore */
      }
    };

    update();

    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        if (frameId !== null) {
          cancelAnimationFrame(frameId);
        }
        frameId = requestAnimationFrame(update);
      });
      try {
        observer.observe(target);
      } catch (e) {
        observer.disconnect();
        observer = null;
      }
    } else {
      const handler = () => update();
      window.addEventListener("resize", handler);
      return () => {
        window.removeEventListener("resize", handler);
      };
    }

    return () => {
      if (observer) {
        try {
          observer.disconnect();
        } catch (e) {
          /* ignore */
        }
      }
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };
  }, [ref, enabled]);

  return size;
}
