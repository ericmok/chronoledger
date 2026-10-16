export type WeekStartDay = 0 | 1; // 0 = Sunday, 1 = Monday

export interface DateItem {
  dateString: string; // "YYYY-MM-DD"
  year: number;
  monthIndex: number; // 0-11
  monthName: string; // "Jan", "Feb", ... "Oct"
  dayOfMonth: number; // 1-31
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  dayOfWeekLetter: string; // "S", "M", "T", "W", "Th", "F", "Sa"
  isWeekEnd: boolean; // True if this day ends the week (triggers dashed line)
  isFirstDayOfMonth: boolean;
  isToday: boolean;
  epochDay: number; // Integer count of days since Unix epoch
  // First-class semantic date marking
  isCircled?: boolean;
  circleColor?: string;
}

export const CIRCLE_DATE_COLORS = [
  '#D23B38', // Terracotta / Crimson (Default)
  '#83C5BE', // Sage / Aqua
  '#E9C46A', // Warm Ochre
  '#9B5DE5', // Lavender / Purple
  '#457B9D', // Slate / Steel Blue
] as const;

export type CircleDateColor = typeof CIRCLE_DATE_COLORS[number];

export interface CircledDate {
  dateKey: string; // ISO "YYYY-MM-DD"
  color: string;   // Hex color code
  createdAt?: string;
}

export interface NoteItem {
  id: string;
  content: string;
  originalContent?: string; // Baseline content before edits for computing diffs
  updatedAt?: string;
  parentDates: string[]; // List of ISO "YYYY-MM-DD" dates
  isStruck: boolean;
  strikeStyle?: 'single' | 'double' | 'scribble';
  colorTag?: string;
  createdAt: string;
}

export interface MonthNote {
  id: string;
  content: string;
  originalContent?: string;
  updatedAt?: string;
  parentMonths: string[]; // List of "YYYY-MM" strings, e.g. ["2026-10"] or multi-month spans ["2026-10", "2026-11", "2026-12"]
  isStruck: boolean;
  colorTag?: string;
  createdAt: string;
}

export interface WeekNote {
  id: string;
  content: string;
  originalContent?: string;
  updatedAt?: string;
  parentWeeks: string[]; // List of "YYYY-Www" strings, e.g. ["2026-W42"] or multi-week spans ["2026-W42", "2026-W43"]
  isStruck: boolean;
  colorTag?: string;
  createdAt: string;
}

export const NOTE_ACCENT_COLORS = [
  '#E29578', // Terracotta
  '#83C5BE', // Sage / Aqua
  '#E9C46A', // Warm Ochre
  '#9B5DE5', // Lavender / Purple
  '#F15BB5', // Rose / Pink
  '#457B9D', // Slate / Steel Blue
] as const;

export type NoteAccentColor = typeof NOTE_ACCENT_COLORS[number];

export type DrawingTool = 'select' | 'pencil' | 'arrow' | 'highlighter' | 'eraser';

export interface ArrowEndpointAnchor {
  dateString: string;
  noteId?: string;
  xRatio: number; // Ratio across the daily notes column (0..1)
  yRatio?: number; // Vertical ratio within the day row (0..1, fallback if note is absent/deleted)
}

export interface DrawingElement {
  id: string;
  type: 'freehand' | 'arrow' | 'circle';
  color: string;
  strokeWidth: number;
  // Anchors keep drawings aligned with dates across scrolling and dynamic resizing
  anchorStartDate: string;
  anchorEndDate?: string;
  // Semantic anchors for responsive arrows
  startAnchor?: ArrowEndpointAnchor;
  endAnchor?: ArrowEndpointAnchor;
  // Normalized or relative offset (dx, dy) within the anchor day row
  startOffset: { x: number; y: number };
  endOffset?: { x: number; y: number };
  // Raw points for freehand or curve
  points: [number, number][];
  createdAt: string;
}

export interface CalendarSettings {
  weekStartsOn: WeekStartDay;
  showStruckItems: boolean;
  activeTool: DrawingTool;
  inkColor: string;
}
