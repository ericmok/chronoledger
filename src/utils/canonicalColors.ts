/**
 * Canonical Primary Color System
 *
 * Provides the authoritative palette of primary colors used across the application:
 * - Annotations / semantic tags
 * - Bullet resting and anchor points
 * - Date gutter and radar summary dots
 * - Note color tag pickers
 *
 * Each canonical color defines:
 * - `solid`: Primary saturated hue for solid chip badges (light/contrasting text on darker bg),
 *            resting bullets, and gutter dots.
 * - `wash`:  Soft pastel tint for tinted paper wash badges (dark charcoal ink on light bg).
 */

export type CanonicalColorName =
  | 'purple'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'gray'
  | 'lightGray'
  | 'mutedRed';

export interface CanonicalColorDefinition {
  id: CanonicalColorName;
  label: string;
  solid: string; // Badges with light text on darker bgcolor (Solid theme)
  wash: string;  // Dark text on light bgcolor (Wash theme)
  description: string;
}

export const CANONICAL_COLORS: Record<CanonicalColorName, CanonicalColorDefinition> = {
  purple: {
    id: 'purple',
    label: 'Purple',
    solid: '#D097F7',
    wash: '#DBB3F6',
    description: 'Explore / Idea / Brainstorming',
  },
  red: {
    id: 'red',
    label: 'Red',
    solid: '#F47290',
    wash: '#F79EAA',
    description: 'Important / Urgent / Critical task',
  },
  orange: {
    id: 'orange',
    label: 'Orange',
    solid: '#F5AC6C',
    wash: '#FFB06B',
    description: 'Waiting / Blocked / Pending event',
  },
  yellow: {
    id: 'yellow',
    label: 'Yellow',
    solid: '#EADA25',
    wash: '#FFE3B2',
    description: 'Happy Event / Celebrate / Milestone',
  },
  green: {
    id: 'green',
    label: 'Green',
    solid: '#51C391',
    wash: '#90E6AE',
    description: 'To-Do / Action items',
  },
  teal: {
    id: 'teal',
    label: 'Teal',
    solid: '#81DACE',
    wash: '#81DACE',
    description: 'Scheduled / Time-of-day appointments',
  },
  blue: {
    id: 'blue',
    label: 'Blue',
    solid: '#4FA3F2',
    wash: '#98C8F4',
    description: 'Thought / Reflection / Journal insight',
  },
  gray: {
    id: 'gray',
    label: 'Gray',
    solid: '#6F7880',
    wash: '#A5B4C2',
    description: 'Scheduled / Custom ad-hoc tags',
  },
  lightGray: {
    id: 'lightGray',
    label: 'Light Gray',
    solid: '#9FB1C1',
    wash: '#D7C9C9',
    description: 'Skipped / Postponed tasks',
  },
  mutedRed: {
    id: 'mutedRed',
    label: 'Muted Red',
    solid: '#D86B6B',
    wash: '#E5C8C8',
    description: 'Failed / Rejected / Unsuccessful',
  },
};

/**
 * Ordered list of canonical color definitions for UI color pickers and palettes
 */
export const CANONICAL_COLOR_LIST: CanonicalColorDefinition[] = [
  CANONICAL_COLORS.red,
  CANONICAL_COLORS.orange,
  CANONICAL_COLORS.yellow,
  CANONICAL_COLORS.green,
  CANONICAL_COLORS.teal,
  CANONICAL_COLORS.blue,
  CANONICAL_COLORS.purple,
  CANONICAL_COLORS.mutedRed,
  CANONICAL_COLORS.gray,
  CANONICAL_COLORS.lightGray,
];

/**
 * Array of all 10 solid hex colors for note bullet color swatches
 */
export const CANONICAL_SOLID_HEXES = CANONICAL_COLOR_LIST.map((c) => c.solid);

/**
 * Array of all 10 wash hex colors for tinted paper badges
 */
export const CANONICAL_WASH_HEXES = CANONICAL_COLOR_LIST.map((c) => c.wash);
