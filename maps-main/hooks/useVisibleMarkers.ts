import { useMemo } from 'react';

interface Marker {
  id: string;
  svg: {
    x: number;
    y: number;
  };
  [key: string]: any;
}

interface ViewBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * PERFORMANCE OPTIMIZATION: Filter markers to only those visible in viewport
 *
 * Reduces DOM nodes from ~1000-2000 to ~50-100 by only rendering markers
 * that are currently visible in the viewport (plus a small margin).
 *
 * @param markers - All markers with SVG coordinates
 * @param viewBounds - Current viewport boundaries in SVG coordinate space
 * @param margin - Extra margin around viewport (pixels) to render markers slightly outside view
 * @returns Filtered array of only visible markers
 *
 * @example
 * const visibleMarkers = useVisibleMarkers(allMarkers, viewBounds, 100);
 * // Returns only markers within viewport + 100px margin
 */
export function useVisibleMarkers<T extends Marker>(
  markers: T[],
  viewBounds: ViewBounds | null,
  margin: number = 100
): T[] {
  return useMemo(() => {
    // If no view bounds yet, render all markers (initial load)
    if (!viewBounds) {
      return markers;
    }

    // Filter markers within viewport + margin
    const visible = markers.filter((marker) => {
      const { x, y } = marker.svg;

      return (
        x >= viewBounds.minX - margin &&
        x <= viewBounds.maxX + margin &&
        y >= viewBounds.minY - margin &&
        y <= viewBounds.maxY + margin
      );
    });

    // PERFORMANCE: Log when filtering dramatically reduces markers (development only)
    if (process.env.NODE_ENV === 'development' && markers.length > 0) {
      const reductionPct = ((markers.length - visible.length) / markers.length * 100).toFixed(0);
      if (visible.length < markers.length * 0.5) {
        console.log(`🎯 Viewport filtering: ${markers.length} → ${visible.length} markers (${reductionPct}% reduction)`);
      }
    }

    return visible;
  }, [markers, viewBounds, margin]);
}
