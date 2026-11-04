export interface MonthSeasonalColor {
  monthIndex: number;
  season: 'winter' | 'spring' | 'summer' | 'autumn';
  cellBg: string; // Subtle seasonal wash for calendar grid cells
  cellHoverBg: string; // Subtle hover wash for calendar grid cells
  notesBg: string; // Subtle background for month notes container
  notesHoverBg: string; // Hover background for month notes container
  notesBorder: string; // Subtle border color for month notes
  gutterBg: string; // Vertical month name gutter wash
  accentTag: string; // Contrast accent for badges / labels
  name: string;
}

/**
 * 12-Month Subtle Seasonal Gradient Palette:
 * - Winter (Dec, Jan, Feb): Soft frosted slate / crisp ice blue
 * - Spring (Mar, Apr, May): Delicate sprout / matcha / young leaf green
 * - Summer (Jun, Jul, Aug): Warm morning sunbeam / golden sand / amber wheat yellow
 * - Autumn (Sep, Oct, Nov): Soft apricot / persimmon / warm terracotta / cinnamon russet
 *
 * Each month in every year shares the same deterministic, ultra-subtle stationery wash.
 */
export const MONTH_SEASONAL_COLORS: MonthSeasonalColor[] = [
  // 0: January (Winter - crisp icy blue)
  {
    monthIndex: 0,
    name: 'January',
    season: 'winter',
    cellBg: '#EFF4F8',
    cellHoverBg: '#E3EDF4',
    notesBg: '#F3F7FA',
    notesHoverBg: '#EAF0F6',
    notesBorder: '#D5E2EC',
    gutterBg: '#ECF2F7',
    accentTag: '#5C82A6',
  },
  // 1: February (Winter - pale winter mist)
  {
    monthIndex: 1,
    name: 'February',
    season: 'winter',
    cellBg: '#EEF5F6',
    cellHoverBg: '#E2EFF0',
    notesBg: '#F3F8F8',
    notesHoverBg: '#EAF2F3',
    notesBorder: '#D2E4E6',
    gutterBg: '#EBF3F4',
    accentTag: '#5B8A8F',
  },
  // 2: March (Spring - early spring sprout)
  {
    monthIndex: 2,
    name: 'March',
    season: 'spring',
    cellBg: '#EEF6F1',
    cellHoverBg: '#E1F0E6',
    notesBg: '#F3F8F5',
    notesHoverBg: '#EAF3ED',
    notesBorder: '#D1E5D8',
    gutterBg: '#EBF4EF',
    accentTag: '#528A68',
  },
  // 3: April (Spring - fresh matcha / tea green)
  {
    monthIndex: 3,
    name: 'April',
    season: 'spring',
    cellBg: '#F0F7EE',
    cellHoverBg: '#E3F1DF',
    notesBg: '#F4F9F2',
    notesHoverBg: '#EBF4E9',
    notesBorder: '#D4E7CF',
    gutterBg: '#EDF5EB',
    accentTag: '#5D8B55',
  },
  // 4: May (Spring - young leaf yellow-green)
  {
    monthIndex: 4,
    name: 'May',
    season: 'spring',
    cellBg: '#F4F8EC',
    cellHoverBg: '#ECF2DF',
    notesBg: '#F7FAEF',
    notesHoverBg: '#EEF4E5',
    notesBorder: '#DDE7CB',
    gutterBg: '#F1F6E8',
    accentTag: '#769248',
  },
  // 5: June (Summer - morning sunbeam yellow)
  {
    monthIndex: 5,
    name: 'June',
    season: 'summer',
    cellBg: '#FAF7E8',
    cellHoverBg: '#F5EFD7',
    notesBg: '#FCF9EE',
    notesHoverBg: '#F8F3DF',
    notesBorder: '#E8DEC0',
    gutterBg: '#F7F3E2',
    accentTag: '#9E8437',
  },
  // 6: July (Summer - warm golden sand)
  {
    monthIndex: 6,
    name: 'July',
    season: 'summer',
    cellBg: '#FAF5E4',
    cellHoverBg: '#F5ECCF',
    notesBg: '#FCF8EB',
    notesHoverBg: '#F8F1DC',
    notesBorder: '#E9DDBB',
    gutterBg: '#F7F1DC',
    accentTag: '#A47E30',
  },
  // 7: August (Summer - warm amber wheat)
  {
    monthIndex: 7,
    name: 'August',
    season: 'summer',
    cellBg: '#FAF3E3',
    cellHoverBg: '#F6E8CE',
    notesBg: '#FCF6EA',
    notesHoverBg: '#F8EEDB',
    notesBorder: '#E9D6B5',
    gutterBg: '#F7EED9',
    accentTag: '#A47335',
  },
  // 8: September (Autumn - early autumn apricot)
  {
    monthIndex: 8,
    name: 'September',
    season: 'autumn',
    cellBg: '#FAF1E8',
    cellHoverBg: '#F6E5D7',
    notesBg: '#FCF4ED',
    notesHoverBg: '#F8EAE0',
    notesBorder: '#EBD4C3',
    gutterBg: '#F8EBE0',
    accentTag: '#A66542',
  },
  // 9: October (Autumn - warm terracotta / persimmon)
  {
    monthIndex: 9,
    name: 'October',
    season: 'autumn',
    cellBg: '#FAF0EC',
    cellHoverBg: '#F6E3DC',
    notesBg: '#FCF3F0',
    notesHoverBg: '#F8E9E4',
    notesBorder: '#EBD1C8',
    gutterBg: '#F8EAE4',
    accentTag: '#A85542',
  },
  // 10: November (Autumn - late autumn cinnamon / russet)
  {
    monthIndex: 10,
    name: 'November',
    season: 'autumn',
    cellBg: '#F7EFF1',
    cellHoverBg: '#EFE2E5',
    notesBg: '#FAF2F4',
    notesHoverBg: '#F4E7EB',
    notesBorder: '#E5CFD4',
    gutterBg: '#F4EAEB',
    accentTag: '#965868',
  },
  // 11: December (Winter - pale frosted slate)
  {
    monthIndex: 11,
    name: 'December',
    season: 'winter',
    cellBg: '#F1F3F7',
    cellHoverBg: '#E7ECF3',
    notesBg: '#F5F6FA',
    notesHoverBg: '#ECEEF6',
    notesBorder: '#D9DFEB',
    gutterBg: '#EEF1F6',
    accentTag: '#6B7A99',
  },
];

/**
 * 12-Month Lupine Nordic Botanical Spectrum:
 * High-key crisp light mode with cobalt, floral violet, heather lavender, and cyan telemetry.
 */
export const LUPINE_SEASONAL_COLORS: MonthSeasonalColor[] = [
  // 0: January (Winter - crisp Nordic ice blue)
  {
    monthIndex: 0,
    name: 'January',
    season: 'winter',
    cellBg: '#F0F6FF',
    cellHoverBg: '#E0EEFE',
    notesBg: '#F8FAFF',
    notesHoverBg: '#EDF4FE',
    notesBorder: '#D0E1FD',
    gutterBg: '#EBF3FE',
    accentTag: '#3264EB',
  },
  // 1: February (Winter - frosted lupine lavender)
  {
    monthIndex: 1,
    name: 'February',
    season: 'winter',
    cellBg: '#F5F3FF',
    cellHoverBg: '#ECE7FE',
    notesBg: '#FAF8FF',
    notesHoverBg: '#F3EFFF',
    notesBorder: '#DDD6FE',
    gutterBg: '#F1ECFE',
    accentTag: '#7C3AED',
  },
  // 2: March (Spring - alpine gentian blue)
  {
    monthIndex: 2,
    name: 'March',
    season: 'spring',
    cellBg: '#EFF6FF',
    cellHoverBg: '#DBEAFE',
    notesBg: '#F6F9FF',
    notesHoverBg: '#E9F2FE',
    notesBorder: '#BFDBFE',
    gutterBg: '#E8F1FD',
    accentTag: '#2563EB',
  },
  // 3: April (Spring - wild lupine floral violet)
  {
    monthIndex: 3,
    name: 'April',
    season: 'spring',
    cellBg: '#F3E8FF',
    cellHoverBg: '#E9D5FF',
    notesBg: '#FAF5FF',
    notesHoverBg: '#F3E8FF',
    notesBorder: '#E9D5FF',
    gutterBg: '#EFE0FE',
    accentTag: '#5E49B0',
  },
  // 4: May (Spring - heather orchid blossom)
  {
    monthIndex: 4,
    name: 'May',
    season: 'spring',
    cellBg: '#FDF2F8',
    cellHoverBg: '#FCE7F3',
    notesBg: '#FDF4F9',
    notesHoverBg: '#FAE8F4',
    notesBorder: '#FBCFE8',
    gutterBg: '#FBE4F2',
    accentTag: '#B378B1',
  },
  // 5: June (Summer - high-noon cyan telemetry)
  {
    monthIndex: 5,
    name: 'June',
    season: 'summer',
    cellBg: '#ECFEFF',
    cellHoverBg: '#CFFAFE',
    notesBg: '#F4FEFF',
    notesHoverBg: '#E0F9FD',
    notesBorder: '#A5F3FC',
    gutterBg: '#DDF7FA',
    accentTag: '#0891B2',
  },
  // 6: July (Summer - royal lupine cobalt)
  {
    monthIndex: 6,
    name: 'July',
    season: 'summer',
    cellBg: '#EFF6FF',
    cellHoverBg: '#DBEAFE',
    notesBg: '#F6F9FF',
    notesHoverBg: '#E9F2FE',
    notesBorder: '#BFDBFE',
    gutterBg: '#E8F1FD',
    accentTag: '#1D4ED8',
  },
  // 7: August (Summer - heather rose dusk)
  {
    monthIndex: 7,
    name: 'August',
    season: 'summer',
    cellBg: '#FDF2F8',
    cellHoverBg: '#FCE7F3',
    notesBg: '#FDF4F9',
    notesHoverBg: '#FAE8F4',
    notesBorder: '#FBCFE8',
    gutterBg: '#FBE4F2',
    accentTag: '#9D4EDD',
  },
  // 8: September (Autumn - rich wild lupine violet)
  {
    monthIndex: 8,
    name: 'September',
    season: 'autumn',
    cellBg: '#F5F3FF',
    cellHoverBg: '#ECE7FE',
    notesBg: '#FAF8FF',
    notesHoverBg: '#F3EFFF',
    notesBorder: '#DDD6FE',
    gutterBg: '#F1ECFE',
    accentTag: '#5E49B0',
  },
  // 9: October (Autumn - deep montane cobalt)
  {
    monthIndex: 9,
    name: 'October',
    season: 'autumn',
    cellBg: '#EFF6FF',
    cellHoverBg: '#DBEAFE',
    notesBg: '#F6F9FF',
    notesHoverBg: '#E9F2FE',
    notesBorder: '#BFDBFE',
    gutterBg: '#E8F1FD',
    accentTag: '#3264EB',
  },
  // 10: November (Autumn - obsidian violet night)
  {
    monthIndex: 10,
    name: 'November',
    season: 'autumn',
    cellBg: '#FAF5FF',
    cellHoverBg: '#F3E8FF',
    notesBg: '#FAF7FF',
    notesHoverBg: '#F4EBFF',
    notesBorder: '#E9D5FF',
    gutterBg: '#EFE4FE',
    accentTag: '#4A2FD0',
  },
  // 11: December (Winter - frosted iris slate)
  {
    monthIndex: 11,
    name: 'December',
    season: 'winter',
    cellBg: '#F1F5F9',
    cellHoverBg: '#E2E8F0',
    notesBg: '#F8FAFC',
    notesHoverBg: '#F1F5F9',
    notesBorder: '#CBD5E1',
    gutterBg: '#EAEFF5',
    accentTag: '#3B82F6',
  },
];

/**
 * Returns the seasonal color configuration for a given month index (0-11).
 * Safely handles any integer using modulo 12, adapting automatically to the active theme.
 */
export function getSeasonalColor(monthIndex: number, themeMode?: string): MonthSeasonalColor {
  const normalized = ((monthIndex % 12) + 12) % 12;
  const isLupine =
    themeMode === 'lupine' ||
    (themeMode !== 'paper' &&
      typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-theme') !== 'paper');

  return isLupine ? LUPINE_SEASONAL_COLORS[normalized] : MONTH_SEASONAL_COLORS[normalized];
}
