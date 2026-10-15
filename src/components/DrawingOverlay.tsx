import { useState } from 'react';
import type React from 'react';
import rough from 'roughjs';
import type { DrawingElement, DrawingTool } from '../types/calendar';
import {
  pointsToPath,
  getCurvedArrowPath,
  isFreehandHit,
  isCircleHit,
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
}) => {
  const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
  const [eraserTrail, setEraserTrail] = useState<[number, number][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; dateString: string } | null>(null);
  const [currentPointer, setCurrentPointer] = useState<{ x: number; y: number } | null>(null);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);

  const isInteractive = tool !== 'select';

  // Helper to erase any drawing elements intersecting with (px, py)
  const eraseDrawingsNear = (px: number, py: number) => {
    const hitIds: string[] = [];

    for (const d of drawings) {
      if (d.anchorStartDate?.startsWith('radar:')) continue;
      const anchorY = getYForDate(d.anchorStartDate);
      if (anchorY === null) continue;

      if (d.type === 'freehand') {
        if (isFreehandHit(d.points, anchorY, px, py, ERASER_RADIUS)) {
          hitIds.push(d.id);
        }
      } else if (d.type === 'circle') {
        const cx = d.startOffset.x;
        const cy = anchorY + d.startOffset.y;
        const radius = d.points[0]?.[0] || 22;
        if (isCircleHit(cx, cy, radius, px, py, ERASER_RADIUS)) {
          hitIds.push(d.id);
        }
      } else if (d.type === 'arrow' && d.anchorEndDate) {
        const endAnchorY = getYForDate(d.anchorEndDate);
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
      // ignore in environments without pointer capture
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const dateMatch = getDateAtY(y);
    const dateString = dateMatch ? dateMatch.dateString : '';

    setIsDrawing(true);
    setDragStart({ x, y, dateString });
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

    if (tool === 'pencil') {
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
    } else if (tool === 'circle' && dragStart && currentPointer) {
      const anchorMatch = getDateAtY(dragStart.y);
      if (anchorMatch) {
        const radius = Math.max(
          Math.hypot(currentPointer.x - dragStart.x, currentPointer.y - dragStart.y),
          22
        );
        onAddDrawing({
          type: 'circle',
          color: inkColor,
          strokeWidth: 2,
          anchorStartDate: anchorMatch.dateString,
          startOffset: { x: dragStart.x, y: dragStart.y - anchorMatch.dateY },
          points: [[radius, radius]],
        });
      }
    } else if (tool === 'arrow' && dragStart && currentPointer) {
      const startMatch = getDateAtY(dragStart.y);
      const endMatch = getDateAtY(currentPointer.y);

      if (startMatch && endMatch) {
        onAddDrawing({
          type: 'arrow',
          color: inkColor,
          strokeWidth: 2,
          anchorStartDate: startMatch.dateString,
          anchorEndDate: endMatch.dateString,
          startOffset: { x: dragStart.x, y: dragStart.y - startMatch.dateY },
          endOffset: { x: currentPointer.x, y: currentPointer.y - endMatch.dateY },
          points: [
            [dragStart.x, dragStart.y - startMatch.dateY],
            [currentPointer.x, currentPointer.y - endMatch.dateY],
          ],
        });
      }
    }

    setCurrentPoints([]);
    setEraserTrail([]);
    setDragStart(null);
    setLastPointer(null);
  };

  // Render individual drawings anchored to dates
  const renderDrawings = () => {
    return drawings.map((d) => {
      if (d.anchorStartDate?.startsWith('radar:')) return null;
      const anchorY = getYForDate(d.anchorStartDate);
      if (anchorY === null) return null;

      if (d.type === 'circle') {
        const cx = d.startOffset.x;
        const cy = anchorY + d.startOffset.y;
        const radius = d.points[0]?.[0] || 22;
        const circleShape = generator.circle(cx, cy, radius * 2, {
          stroke: d.color,
          strokeWidth: d.strokeWidth,
          roughness: 1.8,
          bowing: 1.5,
        });
        const paths = generator.toPaths(circleShape);

        return (
          <g
            key={d.id}
            className={tool === 'eraser' ? 'cursor-pointer hover:opacity-40' : ''}
            onClick={() => tool === 'eraser' && onRemoveDrawing(d.id)}
          >
            {paths.map((p, idx) => (
              <path key={idx} d={p.d} stroke={d.color} strokeWidth={p.strokeWidth} fill="none" />
            ))}
          </g>
        );
      }

      if (d.type === 'arrow' && d.anchorEndDate) {
        const endAnchorY = getYForDate(d.anchorEndDate);
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

      {isDrawing && tool === 'circle' && dragStart && currentPointer && (
        <circle
          cx={dragStart.x}
          cy={dragStart.y}
          r={Math.max(Math.hypot(currentPointer.x - dragStart.x, currentPointer.y - dragStart.y), 20)}
          stroke={inkColor}
          strokeWidth="2"
          strokeDasharray="4 3"
          fill="none"
          opacity={0.8}
        />
      )}

      {isDrawing && tool === 'arrow' && dragStart && currentPointer && (
        <g opacity={0.8}>
          <path
            d={getCurvedArrowPath(dragStart.x, dragStart.y, currentPointer.x, currentPointer.y).path}
            stroke={inkColor}
            strokeWidth="2"
            strokeDasharray="4 2"
            fill="none"
          />
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
