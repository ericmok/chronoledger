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
 * Returns the seasonal color configuration for a given month index (0-11).
 * Safely handles any integer using modulo 12.
 */
export function getSeasonalColor(monthIndex: number): MonthSeasonalColor {
  const normalized = ((monthIndex % 12) + 12) % 12;
  return MONTH_SEASONAL_COLORS[normalized];
}
