import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import rough from 'roughjs';
import type { DrawingElement, DrawingTool, ArrowEndpointAnchor } from '../types/calendar';
import {
  pointsToPath,
  getCurvedArrowPath,
  isFreehandHit,
  isArrowHit,
} from '../utils/drawingUtils';

interface DrawingOverlayProps {
  tool: DrawingTool;
  inkColor: string;
  drawings: DrawingElement[];
  onAddDrawing: (drawing: Omit<DrawingElement, 'id' | 'createdAt'>) => void;
  onRemoveDrawing: (id: string) => void;
  onRemoveDrawings?: (ids: string[]) => void;
  containerHeight: number;
  getDateAtY: (y: number) => { dateString: string; dateY: number; rowHeight: number } | null;
  getYForDate: (dateString: string) => number | null;
  visibleDateRange?: { minDate: string; maxDate: string } | null;
}

interface CalendarHitResult {
  dateString: string;
  noteId?: string;
  xRatio: number;
  yRatio: number;
}

/**
 * Hit-tests the underlying DOM beneath (clientX, clientY) through the SVG overlay.
 * Identifies if a specific note card or day row was targeted, and calculates
 * the relative horizontal ratio across the notes column.
 */
function hitTestCalendar(clientX: number, clientY: number): CalendarHitResult | null {
  if (typeof document === 'undefined' || !document.elementsFromPoint) return null;

  const elements = document.elementsFromPoint(clientX, clientY);
  let noteEl: HTMLElement | null = null;
  let dayEl: HTMLElement | null = null;
  let notesColEl: HTMLElement | null = null;

  for (const el of elements) {
    if (!noteEl && el instanceof HTMLElement && el.closest('[data-note-id]')) {
      noteEl = el.closest('[data-note-id]') as HTMLElement;
    }
    if (!dayEl && el instanceof HTMLElement) {
      if (el.closest('[data-day-row]')) {
        dayEl = el.closest('[data-day-row]') as HTMLElement;
      } else if (el.closest('[data-week-panel]')) {
        dayEl = el.closest('[data-week-panel]') as HTMLElement;
      }
    }
    if (!notesColEl && el instanceof HTMLElement && el.closest('[data-notes-column]')) {
      notesColEl = el.closest('[data-notes-column]') as HTMLElement;
    }
  }

  if (noteEl && !dayEl) {
    dayEl = (noteEl.closest('[data-day-row]') || noteEl.closest('[data-week-panel]')) as HTMLElement | null;
  }
  if (dayEl && !notesColEl) {
    notesColEl = (dayEl.querySelector('[data-notes-column]') || (dayEl.hasAttribute('data-week-panel') ? dayEl : null)) as HTMLElement | null;
  }

  const dateString = dayEl?.getAttribute('data-date-string');
  if (!dateString) return null;

  const noteId = noteEl?.getAttribute('data-note-id') || undefined;

  let xRatio = 0.5;
  const colRect = notesColEl?.getBoundingClientRect();
  const dayRect = dayEl?.getBoundingClientRect();

  if (colRect && colRect.width > 0) {
    xRatio = Math.max(0, Math.min(1, (clientX - colRect.left) / colRect.width));
  } else if (dayRect && dayRect.width > 0) {
    xRatio = Math.max(0, Math.min(1, (clientX - dayRect.left) / dayRect.width));
  }

  let yRatio = 0.5;
  if (dayRect && dayRect.height > 0) {
    yRatio = Math.max(0, Math.min(1, (clientY - dayRect.top) / dayRect.height));
  }

  return {
    dateString,
    noteId,
    xRatio,
    yRatio,
  };
}

/**
 * Resolves an arrow endpoint into pixel coordinates relative to the SVG canvas.
 * If anchored to a Note and the note exists in the DOM, centers vertically on the note and sets hasDot = true.
 * If anchored to a Day or if the note was deleted, falls back to the day row and sets hasDot = false.
 */
function resolveEndpoint(
  anchor: ArrowEndpointAnchor | undefined,
  dateString: string,
  fallbackOffset: { x: number; y: number },
  svgRect: DOMRect | null,
  getYForDate: (dateString: string) => number | null
): { x: number; y: number; hasDot: boolean } | null {
  const anchorY = getYForDate(dateString);

  if (!svgRect || !anchor) {
    if (anchorY === null) return null;
    return {
      x: fallbackOffset.x,
      y: anchorY + fallbackOffset.y,
      hasDot: false,
    };
  }

  let noteEl: HTMLElement | null = null;
  if (anchor.noteId) {
    // Look up note element, ensuring it resides within the active vertical timeline canvas
    // (inside a daily row or weekly scratchpad). If the note was moved to the monthly
    // reflection column in the sidebar, candidate.closest() is null, triggering non-destructive
    // arrow suspension without DOM coordinate distortion.
    const candidate = document.querySelector(`[data-note-id="${anchor.noteId}"]`) as HTMLElement | null;
    if (candidate && (candidate.closest('[data-day-row]') || candidate.closest('[data-week-panel]'))) {
      noteEl = candidate;
    }
  }

  // Anchor container: points to either the note's parent row/panel or the original date row
  const dayEl: HTMLElement | null =
    (noteEl?.closest('[data-day-row]') || noteEl?.closest('[data-week-panel]')) as HTMLElement | null ||
    document.querySelector(`[data-date-string="${dateString}"]`);

  const notesColEl: HTMLElement | null =
    dayEl?.querySelector('[data-notes-column]') ||
    noteEl?.closest('[data-notes-column]') ||
    (dayEl?.hasAttribute('data-week-panel') ? dayEl : null);

  let x: number;
  let y: number;
  let hasDot = false;

  // Resolve X: scale proportionally across the notes column (or day/week element width)
  if (notesColEl) {
    const colRect = notesColEl.getBoundingClientRect();
    x = (colRect.left - svgRect.left) + anchor.xRatio * colRect.width;
  } else if (dayEl) {
    const dayRect = dayEl.getBoundingClientRect();
    x = (dayRect.left - svgRect.left) + anchor.xRatio * dayRect.width;
  } else {
    x = fallbackOffset.x;
  }

  // Resolve Y: center directly on note card if present; otherwise fall back to day row
  if (noteEl) {
    const noteRect = noteEl.getBoundingClientRect();
    y = (noteRect.top - svgRect.top) + noteRect.height * 0.5;
    hasDot = true; // Connected to existing note: draw solid anchor dot!
  } else if (dayEl) {
    const dayRect = dayEl.getBoundingClientRect();
    const yRatio = anchor.yRatio ?? 0.5;
    y = (dayRect.top - svgRect.top) + yRatio * dayRect.height;
    hasDot = false; // Connected to day row or note moved outside canvas: no dot
  } else if (anchorY !== null) {
    y = anchorY + fallbackOffset.y; // Fallback to virtualized Y offset
  } else {
    return null;
  }

  return { x, y, hasDot };
}

const generator = rough.generator();
const ERASER_RADIUS = 18;

export const DrawingOverlay: React.FC<DrawingOverlayProps> = ({
  tool,
  inkColor,
  drawings,
  onAddDrawing,
  onRemoveDrawing,
  onRemoveDrawings,
  containerHeight,
  getDateAtY,
  getYForDate,
  visibleDateRange,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [, setRenderTrigger] = useState(0);
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [eraserTrail, setEraserTrail] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    dateString: string;
    noteId?: string;
    xRatio?: number;
    yRatio?: number;
  } | null>(null);
  const [hoverEndHit, setHoverEndHit] = useState<CalendarHitResult | null>(null);
  const [currentPointer, setCurrentPointer] = useState<{ x: number; y: number } | null>(null);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);

  const isInteractive = tool !== 'select';

  // Listen to window resize, container resize, and scroll to re-render responsive arrows
  useEffect(() => {
    const handleUpdate = () => setRenderTrigger((n) => n + 1);
    window.addEventListener('resize', handleUpdate);

    const scrollParent = svgRef.current?.closest('.overflow-y-auto') || window;
    scrollParent.addEventListener('scroll', handleUpdate, { passive: true });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && svgRef.current?.parentElement) {
      observer = new ResizeObserver(handleUpdate);
      observer.observe(svgRef.current.parentElement);
    }

    return () => {
      window.removeEventListener('resize', handleUpdate);
      scrollParent.removeEventListener('scroll', handleUpdate);
      observer?.disconnect();
    };
  }, []);

  // Helper to erase any drawing elements intersecting with (px, py)
  const eraseDrawingsNear = (px: number, py: number) => {
    const hitIds: string[] = [];
    const svgRect = svgRef.current?.getBoundingClientRect() || null;

    for (const d of drawings) {
      if (d.anchorStartDate?.startsWith('radar:')) continue;
      const anchorY = getYForDate(d.anchorStartDate);
      if (anchorY === null) continue;

      if (d.type === 'freehand') {
        if (isFreehandHit(d.points, anchorY, px, py, ERASER_RADIUS)) {
          hitIds.push(d.id);
        }
      } else if (d.type === 'arrow' && d.anchorEndDate) {
        const startResolved = resolveEndpoint(
          d.startAnchor,
          d.anchorStartDate,
          d.startOffset,
          svgRect,
          getYForDate
        );
        const endResolved = resolveEndpoint(
          d.endAnchor,
          d.anchorEndDate,
          d.endOffset || d.startOffset,
          svgRect,
          getYForDate
        );

        if (!startResolved || !endResolved) continue;

        if (isArrowHit(startResolved.x, startResolved.y, endResolved.x, endResolved.y, px, py, ERASER_RADIUS)) {
          hitIds.push(d.id);
        }
      }
    }

    if (hitIds.length > 0) {
      if (onRemoveDrawings) {
        onRemoveDrawings(hitIds);
      } else {
        hitIds.forEach((id) => onRemoveDrawing(id));
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isInteractive) return;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore in environments without pointer capture
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = hitTestCalendar(e.clientX, e.clientY);
    const dateMatch = getDateAtY(y);
    const dateString = hit?.dateString || (dateMatch ? dateMatch.dateString : '');

    setIsDrawing(true);
    setDragStart({
      x,
      y,
      dateString,
      noteId: hit?.noteId,
      xRatio: hit?.xRatio,
      yRatio: hit?.yRatio,
    });
    setHoverEndHit(null);
    setCurrentPoints([[x, y]]);
    setCurrentPointer({ x, y });
    setLastPointer({ x, y });

    if (tool === 'eraser') {
      setEraserTrail([[x, y]]);
      eraseDrawingsNear(x, y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentPointer({ x, y });

    if (!isDrawing) return;

    if (tool === 'arrow') {
      const hit = hitTestCalendar(e.clientX, e.clientY);
      setHoverEndHit(hit);
    } else if (tool === 'pencil') {
      setCurrentPoints((prev) => [...prev, [x, y]]);
    } else if (tool === 'eraser') {
      setEraserTrail((prev) => [...prev, [x, y]]);

      // Interpolate between lastPointer and currentPointer so fast brush strokes don't skip
      if (lastPointer) {
        const dist = Math.hypot(x - lastPointer.x, y - lastPointer.y);
        const steps = Math.max(Math.ceil(dist / 6), 1);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const interpX = lastPointer.x + t * (x - lastPointer.x);
          const interpY = lastPointer.y + t * (y - lastPointer.y);
          eraseDrawingsNear(interpX, interpY);
        }
      } else {
        eraseDrawingsNear(x, y);
      }
      setLastPointer({ x, y });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    if (tool === 'pencil' && currentPoints.length > 2 && dragStart) {
      // Find date anchor
      const anchorMatch = getDateAtY(dragStart.y);
      const anchorDate = anchorMatch ? anchorMatch.dateString : '';
      const anchorY = anchorMatch ? anchorMatch.dateY : 0;

      // Normalize points relative to anchor date row
      const relativePoints: [number, number][] = currentPoints.map(([px, py]) => [px, py - anchorY]);

      onAddDrawing({
        type: 'freehand',
        color: inkColor,
        strokeWidth: 2.5,
        anchorStartDate: anchorDate,
        startOffset: { x: dragStart.x, y: dragStart.y - anchorY },
        points: relativePoints,
      });
    } else if (tool === 'arrow' && dragStart && currentPointer) {
      const endHit = hitTestCalendar(e.clientX, e.clientY);
      const startMatch = getDateAtY(dragStart.y);
      const endMatch = getDateAtY(currentPointer.y);

      const startDate = dragStart.dateString || startMatch?.dateString || '';
      const endDate = endHit?.dateString || endMatch?.dateString || '';

      if (startDate && endDate) {
        const startAnchorY = startMatch ? startMatch.dateY : dragStart.y;
        const endAnchorY = endMatch ? endMatch.dateY : currentPointer.y;

        onAddDrawing({
          type: 'arrow',
          color: inkColor,
          strokeWidth: 2,
          anchorStartDate: startDate,
          anchorEndDate: endDate,
          startAnchor: {
            dateString: startDate,
            noteId: dragStart.noteId,
            xRatio: dragStart.xRatio ?? 0.5,
            yRatio: dragStart.yRatio ?? 0.5,
          },
          endAnchor: {
            dateString: endDate,
            noteId: endHit?.noteId,
            xRatio: endHit?.xRatio ?? 0.5,
            yRatio: endHit?.yRatio ?? 0.5,
          },
          startOffset: { x: dragStart.x, y: dragStart.y - startAnchorY },
          endOffset: { x: currentPointer.x, y: currentPointer.y - endAnchorY },
          points: [
            [dragStart.x, dragStart.y - startAnchorY],
            [currentPointer.x, currentPointer.y - endAnchorY],
          ],
        });
      }
    }

    setCurrentPoints([]);
    setEraserTrail([]);
    setDragStart(null);
    setHoverEndHit(null);
    setLastPointer(null);
  };

  // Render individual drawings anchored to dates with Viewport Frustum Culling
  const renderDrawings = () => {
    const svgRect = svgRef.current?.getBoundingClientRect() || null;

    return drawings.map((d) => {
      if (d.anchorStartDate?.startsWith('radar:')) return null;

      // Viewport Frustum Culling: skip offscreen drawings outside the visible viewport buffer
      if (visibleDateRange && visibleDateRange.minDate && visibleDateRange.maxDate) {
        if (d.type === 'freehand') {
          if (d.anchorStartDate < visibleDateRange.minDate || d.anchorStartDate > visibleDateRange.maxDate) {
            return null;
          }
        } else if (d.type === 'arrow') {
          const startIn = d.anchorStartDate >= visibleDateRange.minDate && d.anchorStartDate <= visibleDateRange.maxDate;
          const endIn = d.anchorEndDate
            ? d.anchorEndDate >= visibleDateRange.minDate && d.anchorEndDate <= visibleDateRange.maxDate
            : startIn;
          if (!startIn && !endIn) {
            return null;
          }
        }
      }

      const anchorY = getYForDate(d.anchorStartDate);
      if (anchorY === null) return null;

      if (d.type === 'arrow' && d.anchorEndDate) {
        // Responsively resolve endpoints
        const startResolved = resolveEndpoint(
          d.startAnchor,
          d.anchorStartDate,
          d.startOffset,
          svgRect,
          getYForDate
        );
        const endResolved = resolveEndpoint(
          d.endAnchor,
          d.anchorEndDate,
          d.endOffset || d.startOffset,
          svgRect,
          getYForDate
        );

        if (!startResolved || !endResolved) return null;

        const startX = startResolved.x;
        const startY = startResolved.y;
        const endX = endResolved.x;
        const endY = endResolved.y;
        const hasStartDot = startResolved.hasDot;
        const hasEndDot = endResolved.hasDot;

        const { path, headPoints } = getCurvedArrowPath(startX, startY, endX, endY);

        const arrowStem = generator.path(path, {
          stroke: d.color,
          strokeWidth: d.strokeWidth,
          roughness: 1.2,
        });
        const stemPaths = generator.toPaths(arrowStem);

        const headLine1 = generator.line(headPoints[0][0], headPoints[0][1], headPoints[1][0], headPoints[1][1], {
          stroke: d.color,
          strokeWidth: d.strokeWidth + 0.5,
          roughness: 1.2,
        });
        const headLine2 = generator.line(headPoints[2][0], headPoints[2][1], headPoints[1][0], headPoints[1][1], {
          stroke: d.color,
          strokeWidth: d.strokeWidth + 0.5,
          roughness: 1.2,
        });

        const head1Paths = generator.toPaths(headLine1);
        const head2Paths = generator.toPaths(headLine2);

        return (
          <g
            key={d.id}
            className={tool === 'eraser' ? 'cursor-pointer hover:opacity-40' : ''}
            onClick={() => tool === 'eraser' && onRemoveDrawing(d.id)}
          >
            {stemPaths.map((p, idx) => (
              <path key={idx} d={p.d} stroke={d.color} strokeWidth={p.strokeWidth} fill="none" />
            ))}
            {head1Paths.map((p, idx) => (
              <path key={`h1-${idx}`} d={p.d} stroke={d.color} strokeWidth={p.strokeWidth} fill="none" />
            ))}
            {head2Paths.map((p, idx) => (
              <path key={`h2-${idx}`} d={p.d} stroke={d.color} strokeWidth={p.strokeWidth} fill="none" />
            ))}

            {/* Start Dot: rendered only when anchored to an existing note */}
            {hasStartDot && (
              <circle
                cx={startX}
                cy={startY}
                r={3.5}
                fill={d.color}
              />
            )}

            {/* End Dot: rendered only when anchored to an existing note */}
            {hasEndDot && (
              <circle
                cx={endX}
                cy={endY}
                r={3.5}
                fill={d.color}
              />
            )}
          </g>
        );
      }

      if (d.type === 'freehand') {
        const absolutePoints: [number, number][] = d.points.map(([px, py]) => [px, py + anchorY]);
        const pathData = pointsToPath(absolutePoints, d.strokeWidth);

        return (
          <path
            key={d.id}
            d={pathData}
            fill={d.color}
            className={tool === 'eraser' ? 'cursor-pointer hover:opacity-40' : ''}
            onClick={() => tool === 'eraser' && onRemoveDrawing(d.id)}
          />
        );
      }

      return null;
    });
  };

  return (
    <svg
      ref={svgRef}
      className={`absolute inset-0 w-full z-20 ${
        isInteractive ? 'cursor-crosshair pointer-events-auto' : 'pointer-events-none'
      }`}
      style={{ height: `${containerHeight}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Persisted saved drawings */}
      {renderDrawings()}

      {/* Live drawing preview */}
      {isDrawing && tool === 'pencil' && currentPoints.length > 1 && (
        <path d={pointsToPath(currentPoints, 2.5)} fill={inkColor} opacity={0.85} />
      )}

      {isDrawing && tool === 'arrow' && dragStart && currentPointer && (
        <g opacity={0.85}>
          <path
            d={getCurvedArrowPath(dragStart.x, dragStart.y, currentPointer.x, currentPointer.y).path}
            stroke={inkColor}
            strokeWidth="2"
            strokeDasharray="4 2"
            fill="none"
          />
          {/* Live Start Dot preview if anchored to a note */}
          {dragStart.noteId && (
            <circle
              cx={dragStart.x}
              cy={dragStart.y}
              r={3.5}
              fill={inkColor}
            />
          )}
          {/* Live End Dot preview if hovering over a note */}
          {hoverEndHit?.noteId && (
            <circle
              cx={currentPointer.x}
              cy={currentPointer.y}
              r={3.5}
              fill={inkColor}
            />
          )}
        </g>
      )}

      {/* Painting Eraser Trail */}
      {isDrawing && tool === 'eraser' && eraserTrail.length > 1 && (
        <path
          d={pointsToPath(eraserTrail, ERASER_RADIUS * 1.8)}
          fill="rgba(210, 59, 56, 0.18)"
          className="pointer-events-none"
        />
      )}

      {/* Painting Eraser Brush Head Cursor */}
      {tool === 'eraser' && currentPointer && (
        <g className="pointer-events-none">
          <circle
            cx={currentPointer.x}
            cy={currentPointer.y}
            r={ERASER_RADIUS}
            fill={isDrawing ? 'rgba(210, 59, 56, 0.28)' : 'rgba(210, 59, 56, 0.12)'}
            stroke="#D23B38"
            strokeWidth="1.5"
            strokeDasharray={isDrawing ? undefined : '3 2'}
          />
          <circle cx={currentPointer.x} cy={currentPointer.y} r={1.5} fill="#D23B38" />
        </g>
      )}
    </svg>
  );
};
