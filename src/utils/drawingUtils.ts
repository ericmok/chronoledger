import getStroke from 'perfect-freehand';

/**
 * Converts stroke polygon coordinates produced by perfect-freehand into an SVG path data string
 */
export function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return '';

  const d: (string | number)[] = ['M', stroke[0][0], stroke[0][1], 'Q'];

  for (let i = 0; i < stroke.length; i++) {
    const [x0, y0] = stroke[i];
    const [x1, y1] = stroke[(i + 1) % stroke.length];
    d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }

  d.push('Z');
  return d.join(' ');
}

/**
 * Generates smooth SVG path from raw touch/mouse points
 */
export function pointsToPath(points: [number, number][], size: number = 3): string {
  if (points.length < 2) return '';
  const stroke = getStroke(points, {
    size,
    thinning: 0.4,
    smoothing: 0.6,
    streamline: 0.55,
  });
  return getSvgPathFromStroke(stroke);
}

/**
 * Calculates a curved bezier SVG path for an arrow between two points
 */
export function getCurvedArrowPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): { path: string; headPoints: [number, number][] } {
  const dx = endX - startX;
  const dy = endY - startY;
  const avgX = (startX + endX) / 2;
  const avgY = (startY + endY) / 2;

  // Determine arc direction:
  // If drawn on the left side of the calendar (avgX < 200px) or dragging to the left (dx < -12),
  // arc outward to the left so it hugs the margin instead of covering up calendar numbers.
  // Otherwise, arc outward to the right.
  let arcDirection = 1; // 1 = right, -1 = left
  if (dx < -12) {
    arcDirection = -1;
  } else if (dx > 12) {
    arcDirection = 1;
  } else {
    // Mostly vertical line: check column location
    arcDirection = avgX < 200 ? -1 : 1;
  }

  // Curve magnitude scales with vertical distance, between 24px and 55px
  const curveIntensity = Math.min(Math.max(Math.abs(dy) * 0.15, 24), 55);
  const midX = avgX + arcDirection * curveIntensity;
  const midY = avgY;

  const path = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;

  // Calculate arrow head angle at endpoint
  const angle = Math.atan2(endY - midY, endX - midX);
  const headLength = 11;

  const p1: [number, number] = [
    endX - headLength * Math.cos(angle - Math.PI / 6),
    endY - headLength * Math.sin(angle - Math.PI / 6),
  ];
  const p2: [number, number] = [
    endX - headLength * Math.cos(angle + Math.PI / 6),
    endY - headLength * Math.sin(angle + Math.PI / 6),
  ];

  return { path, headPoints: [p1, [endX, endY], p2] };
}

/**
 * Calculates perpendicular distance from point (px, py) to line segment (x1, y1)-(x2, y2)
 */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Checks if a freehand stroke intersects with an eraser brush at (ex, ey) with given radius
 */
export function isFreehandHit(
  points: [number, number][],
  anchorY: number,
  ex: number,
  ey: number,
  radius: number = 18
): boolean {
  if (points.length === 0) return false;
  if (points.length === 1) {
    return Math.hypot(ex - points[0][0], ey - (points[0][1] + anchorY)) <= radius;
  }

  for (let i = 0; i < points.length - 1; i++) {
    const x1 = points[i][0];
    const y1 = points[i][1] + anchorY;
    const x2 = points[i + 1][0];
    const y2 = points[i + 1][1] + anchorY;
    if (distanceToSegment(ex, ey, x1, y1, x2, y2) <= radius) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a circle drawing intersects with an eraser brush at (ex, ey)
 */
export function isCircleHit(
  cx: number,
  cy: number,
  r: number,
  ex: number,
  ey: number,
  radius: number = 18
): boolean {
  const dist = Math.hypot(ex - cx, ey - cy);
  return Math.abs(dist - r) <= radius || (r <= radius && dist <= r);
}

/**
 * Checks if an arrow drawing intersects with an eraser brush at (ex, ey)
 */
export function isArrowHit(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  ex: number,
  ey: number,
  radius: number = 18
): boolean {
  const dx = endX - startX;
  const dy = endY - startY;
  const avgX = (startX + endX) / 2;
  const avgY = (startY + endY) / 2;

  let arcDirection = 1;
  if (dx < -12) {
    arcDirection = -1;
  } else if (dx > 12) {
    arcDirection = 1;
  } else {
    arcDirection = avgX < 200 ? -1 : 1;
  }

  const curveIntensity = Math.min(Math.max(Math.abs(dy) * 0.15, 24), 55);
  const midX = avgX + arcDirection * curveIntensity;
  const midY = avgY;

  // Test quadratic curve by sampling 14 segments
  const steps = 14;
  let prevX = startX;
  let prevY = startY;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const invT = 1 - t;
    const curX = invT * invT * startX + 2 * invT * t * midX + t * t * endX;
    const curY = invT * invT * startY + 2 * invT * t * midY + t * t * endY;

    if (distanceToSegment(ex, ey, prevX, prevY, curX, curY) <= radius) {
      return true;
    }
    prevX = curX;
    prevY = curY;
  }

  // Also test endpoint area (arrowhead)
  if (Math.hypot(ex - endX, ey - endY) <= radius + 10) {
    return true;
  }

  return false;
}


