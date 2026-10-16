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
      // ViewBox: 0 0 48 42
      const shape = generator.path(
        'M 9 3 L 39 3 Q 45 3 45 9 L 45 33 Q 45 39 39 39 L 9 39 Q 3 39 3 33 L 3 9 Q 3 3 9 3 Z',
        {
          roughness: 1.3,
          bowing: 1.2,
          strokeWidth: 2.1,
          seed,
        }
      );
      return {
        viewBox: '0 0 48 42',
        paths: generator.toPaths(shape),
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
      };
    }

    if (variant === 'radar') {
      // Hand-drawn sketchy oval tailored for continuous radar cells (~36x42)
      const shape = generator.ellipse(18, 21, 31, 36, {
        roughness: 1.5,
        bowing: 1.3,
        strokeWidth: 2.2,
        seed,
      });
      return {
        viewBox: '0 0 36 42',
        paths: generator.toPaths(shape),
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.12))',
      };
    }

    // Default: 'day' - regular day number in VerticalCalendar DayRow (~32x30)
    const shape = generator.ellipse(16, 15, 27, 24, {
      roughness: 1.5,
      bowing: 1.3,
      strokeWidth: 2.0,
      seed,
    });
    return {
      viewBox: '0 0 32 30',
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
