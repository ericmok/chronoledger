import React, { useMemo } from 'react';
import rough from 'roughjs';

export interface RoughCircledRingProps {
  /** ISO date key (e.g. "2026-10-18") used for deterministic seeding */
  dateKey: string;
  /** Ink stroke color, e.g. '#D23B38' (Terracotta), '#83C5BE' (Sage), etc. */
  color?: string;
  /**
   * Visual variant:
   * - 'day': standard day number in DayRow (~28x28 viewBox, organic ellipse)
   * - 'today': dark today badge in DayRow (~44x38 viewBox, organic rounded rectangle)
   * - 'radar': month continuous radar cell (~32x38 viewBox, organic ellipse)
   */
  variant?: 'day' | 'today' | 'radar';
  /** Optional additional class names for styling or layout */
  className?: string;
}

/**
 * Computes a deterministic integer seed from a date string (e.g. "2026-10-18").
 * This guarantees that each date gets a stable, hand-drawn rough ring that
 * does not jitter or re-randomize on re-renders, theme updates, or window resizes.
 */
export function getNumericSeed(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash << 5) - hash + dateKey.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 42;
}

const generator = rough.generator();

/**
 * RoughCircledRing:
 * Renders an authentic analog hand-drawn ink ring around date numbers using Rough.js.
 * Unlike full-canvas overlays that suffer from coordinate offsets and virtualization shifts,
 * this component renders directly in-DOM local to the date element, guaranteeing
 * rock-solid alignment while preserving the tactile paper-calendar aesthetic.
 */
export const RoughCircledRing: React.FC<RoughCircledRingProps> = ({
  dateKey,
  color = '#D23B38',
  variant = 'day',
  className = '',
}) => {
  // Deterministic SVG paths: keyed only on (dateKey, variant).
  // Color changes (e.g. clicking to cycle color) update stroke instantaneously
  // without triggering a path re-generation, maintaining exact line identity.
  const { viewBox, paths, filter } = useMemo(() => {
    const seed = getNumericSeed(dateKey);

    if (variant === 'today') {
      // Rounded rectangle framing the dark "Today" badge
      // ViewBox: 0 0 44 38
      const shape = generator.path(
        'M 8 3 L 36 3 Q 41 3 41 8 L 41 30 Q 41 35 36 35 L 8 35 Q 3 35 3 30 L 3 8 Q 3 3 8 3 Z',
        {
          roughness: 1.3,
          bowing: 1.2,
          strokeWidth: 2,
          seed,
        }
      );
      return {
        viewBox: '0 0 44 38',
        paths: generator.toPaths(shape),
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
      };
    }

    if (variant === 'radar') {
      // Hand-drawn sketchy oval tailored for 32x38 radar cells
      const shape = generator.ellipse(16, 19, 27, 31, {
        roughness: 1.5,
        bowing: 1.3,
        strokeWidth: 2.1,
        seed,
      });
      return {
        viewBox: '0 0 32 38',
        paths: generator.toPaths(shape),
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))',
      };
    }

    // Default: 'day' - regular day number in VerticalCalendar DayRow (~28x28)
    const shape = generator.ellipse(14, 14, 23, 21, {
      roughness: 1.5,
      bowing: 1.3,
      strokeWidth: 1.9,
      seed,
    });
    return {
      viewBox: '0 0 28 28',
      paths: generator.toPaths(shape),
      filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))',
    };
  }, [dateKey, variant]);

  return (
    <svg
      className={`w-full h-full overflow-visible ${className}`}
      viewBox={viewBox}
      style={{ filter }}
      aria-hidden="true"
    >
      {paths.map((p, idx) => (
        <path
          key={idx}
          d={p.d}
          stroke={color}
          strokeWidth={p.strokeWidth || 1.8}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-colors duration-150"
        />
      ))}
    </svg>
  );
};
