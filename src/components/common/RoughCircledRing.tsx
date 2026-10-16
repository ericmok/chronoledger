import React, { useMemo } from 'react';
import rough from 'roughjs';

export interface RoughCircledRingProps {
  /** ISO date key (e.g. "2026-10-18") used for deterministic seeding */
  dateKey: string;
  /** Ink stroke color, e.g. '#9CA3AF' (Light Gray), '#D23B38' (Red), etc. */
  color?: string;
  /**
   * Visual variant:
   * - 'day': standard day number in DayRow (~46x40 viewBox, organic ellipse)
   * - 'today': dark today badge in DayRow (~54x48 viewBox, organic rounded rectangle)
   * - 'radar': month continuous radar cell (~36x42 viewBox, organic ellipse)
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
  color = '#9CA3AF',
  variant = 'day',
  className = '',
}) => {
  // Deterministic SVG paths: keyed only on (dateKey, variant).
  // Color changes (e.g. clicking to cycle color) update stroke instantaneously
  // without triggering a path re-generation, maintaining exact line identity.
  const { viewBox, paths, filter } = useMemo(() => {
    const seed = getNumericSeed(dateKey);

    if (variant === 'today') {
      // Rounded rectangle framing the dark "Today" badge (~54x48)
      // ViewBox: 0 0 54 48
      const shape = generator.path(
        'M 10 3 L 44 3 Q 51 3 51 10 L 51 38 Q 51 45 44 45 L 10 45 Q 3 45 3 38 L 3 10 Q 3 3 10 3 Z',
        {
          roughness: 1.3,
          bowing: 1.2,
          strokeWidth: 2.3,
          seed,
        }
      );
      return {
        viewBox: '0 0 54 48',
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

    // Default: 'day' - regular day number in VerticalCalendar DayRow (~46x40)
    // Generous, prominent hand-drawn loop comfortably encircling the date number
    const shape = generator.ellipse(23, 20, 41, 35, {
      roughness: 1.5,
      bowing: 1.3,
      strokeWidth: 2.2,
      seed,
    });
    return {
      viewBox: '0 0 46 40',
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
