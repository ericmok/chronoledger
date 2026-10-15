import { useState } from 'react';
import type React from 'react';
import rough from 'roughjs';
import type { DrawingElement, DrawingTool } from '../../types/calendar';
import type { JigsawCell } from './ContinuousRadarGrid';
import {
  pointsToPath,
  getCurvedArrowPath,
  isFreehandHit,
  isArrowHit,
} from '../../utils/drawingUtils';

export interface RadarDrawingOverlayProps {
  tool: DrawingTool;
  inkColor: string;
  drawings: DrawingElement[];
  onAddDrawing: (drawing: Omit<DrawingElement, 'id' | 'createdAt'>) => void;
  onRemoveDrawing: (id: string) => void;
  onRemoveDrawings?: (ids: string[]) => void;
  totalWeeksHeight: number;
  cellHeight: number;
  weeks: JigsawCell[][];
}

const generator = rough.generator();
const ERASER_RADIUS = 18;

export const RadarDrawingOverlay: React.FC<RadarDrawingOverlayProps> = ({
  tool,
  inkColor,
  drawings,
  onAddDrawing,
  onRemoveDrawing,
  onRemoveDrawings,
  totalWeeksHeight,
  cellHeight,
  weeks,
}) => {
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [eraserTrail, setEraserTrail] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; dateString: string } | null>(null);
  const [currentPointer, setCurrentPointer] = useState<{ x: number; y: number } | null>(null);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);

  const isInteractive = tool === 'pencil' || tool === 'arrow' || tool === 'eraser';

  // Helper to find date anchor for a given Y coordinate
  const getDateAnchorAtY = (y: number): { dateKey: string; anchorY: number } => {
    const rowIndex = Math.floor(y / cellHeight);
    const boundedRow = Math.max(0, Math.min(weeks.length - 1, rowIndex));
    const week = weeks[boundedRow];
    const anchorDate = week?.find((c) => !c.isOutsideTargetRange)?.dateKey || week?.[0]?.dateKey || 'unknown';
    return {
      dateKey: anchorDate,
      anchorY: boundedRow * cellHeight,
    };
  };

  // Helper to get anchor Y for an anchor date string
  const getYForAnchorDate = (dateKey: string): number | null => {
    const cleanDateKey = dateKey.replace(/^radar:/, '');
    const rowIndex = weeks.findIndex((row) => row.some((c) => c.dateKey === cleanDateKey));
    if (rowIndex === -1) return null;
    return rowIndex * cellHeight;
  };

  // Erase radar drawings intersecting with (px, py)
  const eraseRadarDrawingsNear = (px: number, py: number) => {
    const hitIds: string[] = [];

    for (const d of drawings) {
      if (!d.anchorStartDate?.startsWith('radar:')) continue;
      const anchorY = getYForAnchorDate(d.anchorStartDate);
      if (anchorY === null) continue;

      if (d.type === 'freehand') {
        if (isFreehandHit(d.points, anchorY, px, py, ERASER_RADIUS)) {
          hitIds.push(d.id);
        }
      } else if (d.type === 'arrow' && d.anchorEndDate) {
        const endAnchorY = getYForAnchorDate(d.anchorEndDate);
        if (endAnchorY === null) continue;
        const startX = d.startOffset.x;
        const startY = anchorY + d.startOffset.y;
        const endX = d.endOffset ? d.endOffset.x : startX;
        const endY = endAnchorY + (d.endOffset ? d.endOffset.y : 0);
        if (isArrowHit(startX, startY, endX, endY, px, py, ERASER_RADIUS)) {
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
      // ignore
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const anchor = getDateAnchorAtY(y);

    setIsDrawing(true);
    setDragStart({ x, y, dateString: anchor.dateKey });
    setCurrentPoints([[x, y]]);
    setCurrentPointer({ x, y });
    setLastPointer({ x, y });

    if (tool === 'eraser') {
      setEraserTrail([[x, y]]);
      eraseRadarDrawingsNear(x, y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setCurrentPointer({ x, y });

    if (!isDrawing) return;

    if (tool === 'pencil') {
      setCurrentPoints((prev) => [...prev, [x, y]]);
    } else if (tool === 'eraser') {
      setEraserTrail((prev) => [...prev, [x, y]]);

      // Continuous brush interpolation
      if (lastPointer) {
        const dist = Math.hypot(x - lastPointer.x, y - lastPointer.y);
        const steps = Math.max(Math.ceil(dist / 6), 1);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const interpX = lastPointer.x + t * (x - lastPointer.x);
          const interpY = lastPointer.y + t * (y - lastPointer.y);
          eraseRadarDrawingsNear(interpX, interpY);
        }
      } else {
        eraseRadarDrawingsNear(x, y);
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
      const anchor = getDateAnchorAtY(dragStart.y);
      const relativePoints: [number, number][] = currentPoints.map(([px, py]) => [
        px,
        py - anchor.anchorY,
      ]);

      onAddDrawing({
        type: 'freehand',
        color: inkColor,
        strokeWidth: 2.2,
        anchorStartDate: `radar:${anchor.dateKey}`,
        startOffset: { x: dragStart.x, y: dragStart.y - anchor.anchorY },
        points: relativePoints,
      });
    } else if (tool === 'arrow' && dragStart && currentPointer) {
      const startAnchor = getDateAnchorAtY(dragStart.y);
      const endAnchor = getDateAnchorAtY(currentPointer.y);

      onAddDrawing({
        type: 'arrow',
        color: inkColor,
        strokeWidth: 2,
        anchorStartDate: `radar:${startAnchor.dateKey}`,
        anchorEndDate: `radar:${endAnchor.dateKey}`,
        startOffset: { x: dragStart.x, y: dragStart.y - startAnchor.anchorY },
        endOffset: { x: currentPointer.x, y: currentPointer.y - endAnchor.anchorY },
        points: [],
      });
    }

    setCurrentPoints([]);
    setEraserTrail([]);
    setDragStart(null);
    setLastPointer(null);
  };

  // Render existing radar drawings
  const renderRadarDrawings = () => {
    return drawings.map((d) => {
      if (!d.anchorStartDate?.startsWith('radar:')) return null;
      const anchorY = getYForAnchorDate(d.anchorStartDate);
      if (anchorY === null) return null;

      if (d.type === 'freehand') {
        const absolutePoints: [number, number][] = d.points.map(([px, py]) => [px, py + anchorY]);
        const pathData = pointsToPath(absolutePoints, d.strokeWidth);

        return (
          <path
            key={d.id}
            d={pathData}
            fill={d.color}
            className={tool === 'eraser' ? 'cursor-pointer hover:opacity-40 transition-opacity' : ''}
            onClick={() => tool === 'eraser' && onRemoveDrawing(d.id)}
          />
        );
      }

      if (d.type === 'arrow' && d.anchorEndDate) {
        const endAnchorY = getYForAnchorDate(d.anchorEndDate);
        if (endAnchorY === null) return null;

        const startX = d.startOffset.x;
        const startY = anchorY + d.startOffset.y;
        const endX = d.endOffset ? d.endOffset.x : startX;
        const endY = endAnchorY + (d.endOffset ? d.endOffset.y : 0);

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
            className={tool === 'eraser' ? 'cursor-pointer hover:opacity-40 transition-opacity' : ''}
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
          </g>
        );
      }

      return null;
    });
  };

  return (
    <svg
      className={`absolute inset-0 w-full z-20 overflow-visible ${
        isInteractive ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'
      }`}
      style={{ height: `${totalWeeksHeight}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Existing Radar Drawings */}
      {renderRadarDrawings()}

      {/* Live Pencil Stroke Preview */}
      {isDrawing && tool === 'pencil' && currentPoints.length > 1 && (
        <path d={pointsToPath(currentPoints, 2.5)} fill={inkColor} opacity={0.88} />
      )}

      {/* Live Arrow Preview */}
      {isDrawing && tool === 'arrow' && dragStart && currentPointer && (
        <g opacity={0.85}>
          {(() => {
            const { path, headPoints } = getCurvedArrowPath(
              dragStart.x,
              dragStart.y,
              currentPointer.x,
              currentPointer.y
            );
            const previewStem = generator.path(path, {
              stroke: inkColor,
              strokeWidth: 2,
              roughness: 1.2,
            });
            const paths = generator.toPaths(previewStem);

            return (
              <>
                {paths.map((p, idx) => (
                  <path key={idx} d={p.d} stroke={inkColor} strokeWidth={p.strokeWidth} fill="none" />
                ))}
                <polygon
                  points={`${headPoints[0][0]},${headPoints[0][1]} ${headPoints[1][0]},${headPoints[1][1]} ${headPoints[2][0]},${headPoints[2][1]}`}
                  fill={inkColor}
                />
              </>
            );
          })()}
        </g>
      )}

      {/* Live Eraser Ring Cursor */}
      {tool === 'eraser' && currentPointer && (
        <circle
          cx={currentPointer.x}
          cy={currentPointer.y}
          r={ERASER_RADIUS}
          fill="rgba(210, 59, 56, 0.08)"
          stroke="#D23B38"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          className="pointer-events-none animate-pulse"
        />
      )}

      {/* Live Eraser Trail Brush Effect */}
      {isDrawing && tool === 'eraser' && eraserTrail.length > 1 && (
        <path
          d={pointsToPath(eraserTrail, ERASER_RADIUS * 1.6)}
          fill="rgba(210, 59, 56, 0.15)"
          className="pointer-events-none transition-opacity"
        />
      )}
    </svg>
  );
};
