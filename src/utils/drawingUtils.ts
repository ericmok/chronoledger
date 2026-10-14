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

