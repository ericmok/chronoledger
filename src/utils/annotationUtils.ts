/**
 * Semantic Note Annotations & Tagging Engine
 *
 * Provides tag parsing, micro-badge rendering metadata, time-parsing,
 * dynamic bullet colors, notable dots tracking, universal resolution,
 * and CommonMark-style backslash escaping.
 *
 * ## Annotation Syntax & Behavior
 * - **Active Tag**: `@important`, `@todo`, `@wait`, `@celebrate`, `@explore`, `@thought`, `@time`, `@skipped`
 * - **Resolved Tag**: `~~@tag~~` (renders with muted styling, line-through, and a pencil-slashed indicator)
 * - **Micro-Badge**: The literal `@` symbol is hidden in the rendered badge pill for clean reading,
 *   while preserved in raw text for easy editing.
 *
 * ## Backslash Escaping (CommonMark Specification)
 * - A backslash immediately preceding `@` escapes the tag:
 *   - `\@todo` renders as plain text `@todo` (not a badge; no gutter dots or bullet coloring).
 *   - The escaping backslash is consumed during rendering (read mode) so the ledger page stays clean.
 *   - The raw string `\@todo` is preserved in storage and editor inputs for lossless round-trip editing.
 * - Consecutive backslashes collapse in pairs ($N \to \lfloor N / 2 \rfloor$):
 *   - `\\@todo` (even = 2): renders as literal `\` followed by an active `todo` badge.
 *   - `\\\@todo` (odd = 3): renders as literal `\@todo` as plain text.
 * - Boundaries: Tags must occur at start of string or following whitespace/delimiters (` `, `(`, `[`, etc.).
 *   Email addresses (`user@domain.com`) are unaffected.
 *
 * ## Right-Aligned Leading Badge Anchor (Replaces Resting Dot)
 * - When a note begins with an annotation tag (e.g. `@todo Buy groceries`):
 *   - The badge replaces the resting dot entirely in the left slot.
 *   - The badge is right-aligned against the bullet column and bleeds naturally into the left margin.
 *   - The badge displays its indicator dot on the right side (`[ tag • ]`), perfectly aligning with
 *     the vertical resting dot column of untagged notes.
 *   - The note body text begins directly at the primary text column, so all notes have perfectly
 *     vertically aligned text on the left, with multi-line notes wrapping flush.
 *   - When toggled to resolved (`~~@todo~~`), the badge renders muted with strikethrough and a 45°
 *     pencil slash on its right-side dot.
 *   - Badges located in the middle of a note (e.g. `Call @wait for update`) retain standard inline
 *     micro-badge styling with the indicator dot on the left (`[ • wait ]`).
 *
 * ## Notable Dots (Date Gutter & Radar)
 * - Tracks unique annotation categories per note.
 * - Active annotations render as solid circles in their designated category color.
 * - Resolved annotations render at their date position with an authentic 45° diagonal pencil slash.
 */

import {
  CANONICAL_COLORS,
  type CanonicalColorName,
  type CanonicalColorDefinition,
} from './canonicalColors';

export {
  CANONICAL_COLORS,
  type CanonicalColorName,
  type CanonicalColorDefinition,
};

export type AnnotationCategory =
  | 'important'
  | 'wait'
  | 'celebrate'
  | 'explore'
  | 'thought'
  | 'todo'
  | 'time'
  | 'failed'
  | 'skipped'
  | 'custom';

export type BadgeTheme = 'solid' | 'wash';
export const DEFAULT_BADGE_THEME: BadgeTheme = 'solid';

// --- Color Math & Dynamic Theme Utilities ---

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 0,
      parseInt(clean[1] + clean[1], 16) || 0,
      parseInt(clean[2] + clean[2], 16) || 0,
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h *= 60;
  }

  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  if (s === 0) {
    const val = Math.round(l * 255);
    return [val, val, val];
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h / 360 + 1 / 3);
  const g = hue2rgb(p, q, h / 360);
  const b = hue2rgb(p, q, h / 360 - 1 / 3);

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

// Relative luminance (0..255) for contrast calculation
export function getRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Returns crisp white or deep charcoal ink depending on background brightness
export function getContrastingTextColor(bgColor: string): string {
  return getRelativeLuminance(bgColor) > 165 ? '#2B2C30' : '#FFFFFF';
}

// Derives a softer, warmer, and less saturated tone for resolved annotations
export function getResolvedAccentColor(baseColor: string): string {
  const { h, s, l } = hexToHsl(baseColor);
  // Dial warmer (+4° hue toward warm spectrum), less saturated (-35%), and lighter (+28% toward white)
  const warmHue = (h + 4) % 360;
  const mutedSat = Math.max(0, Math.round(s * 0.65));
  const softLight = Math.min(85, Math.round(l + (100 - l) * 0.28));
  return hslToHex(warmHue, mutedSat, softLight);
}

// Solid Theme: Derives a warm, softened background for resolved solid chips
export function getSolidResolvedBgColor(baseColor: string): string {
  const { h, s, l } = hexToHsl(baseColor);
  const warmHue = (h + 4) % 360;
  const mutedSat = Math.max(0, Math.round(s * 0.52));
  const softLight = Math.min(78, Math.round(l + (100 - l) * 0.26));
  return hslToHex(warmHue, mutedSat, softLight);
}

// Wash Theme: Derives soft watercolor paper wash background
export function getWashBgColor(baseColor: string): string {
  const { h, s } = hexToHsl(baseColor);
  return hslToHex(h, Math.min(s, 45), 95);
}

// Wash Theme: Derives deep readable ink text
export function getWashTextColor(baseColor: string): string {
  const { h, s } = hexToHsl(baseColor);
  return hslToHex(h, Math.min(100, Math.max(s, 55)), 25);
}

// Wash Theme: Derives softer resolved wash background
export function getWashResolvedBgColor(baseColor: string): string {
  const { h, s } = hexToHsl(baseColor);
  return hslToHex((h + 4) % 360, Math.round(s * 0.25), 97);
}

// Wash Theme: Derives muted resolved ink text
export function getWashResolvedTextColor(baseColor: string): string {
  const { h, s } = hexToHsl(baseColor);
  return hslToHex((h + 4) % 360, Math.round(s * 0.38), 45);
}


export interface AnnotationConfig {
  type: AnnotationCategory;
  primaryTag: string; // e.g. "important"
  aliases: string[];  // e.g. ["urgent", "star", "key"]
  label: string;
  description: string;
  colorName?: CanonicalColorName;
  color: string;               // Base category accent color (solid chip, bullet dot, gutter dot)
  washColor?: string;          // Light background color for wash badges
  showInGutter?: boolean;      // Whether to show a summary dot in the date column (defaults to true)
  makesBold?: boolean;         // Changes note text font to bold
  dimsText?: boolean;          // Dims note text
  priority: number;            // Lower number = higher priority
}

export const ANNOTATION_CONFIGS: Record<AnnotationCategory, AnnotationConfig> = {
  important: {
    type: 'important',
    primaryTag: 'important',
    aliases: ['urgent', 'star', 'key'],
    label: 'Important',
    description: 'High priority / critical task (adds red dot to date gutter & bold font)',
    colorName: 'red',
    color: CANONICAL_COLORS.red.solid,
    washColor: CANONICAL_COLORS.red.wash,
    makesBold: true,
    priority: 1,
  },
  wait: {
    type: 'wait',
    primaryTag: 'wait',
    aliases: ['await', 'waiting', 'blocked', 'pending'],
    label: 'Waiting',
    description: 'Waiting on external event, email, or blocker (adds orange dot)',
    colorName: 'orange',
    color: CANONICAL_COLORS.orange.solid,
    washColor: CANONICAL_COLORS.orange.wash,
    priority: 2,
  },
  celebrate: {
    type: 'celebrate',
    primaryTag: 'celebrate',
    aliases: ['happy', 'birthday', 'party', 'fun', 'joy', 'milestone', 'cheers'],
    label: 'Happy Event',
    description: 'Celebration, birthday, milestone, or happy event (adds yellow dot)',
    colorName: 'yellow',
    color: CANONICAL_COLORS.yellow.solid,
    washColor: CANONICAL_COLORS.yellow.wash,
    priority: 3,
  },
  explore: {
    type: 'explore',
    primaryTag: 'explore',
    aliases: ['idea', 'question', 'unknown', 'research', 'brainstorm'],
    label: 'Explore / Idea',
    description: 'Exploratory inquiry, unknown, research, or idea (adds purple dot)',
    colorName: 'purple',
    color: CANONICAL_COLORS.purple.solid,
    washColor: CANONICAL_COLORS.purple.wash,
    priority: 4,
  },
  thought: {
    type: 'thought',
    primaryTag: 'thought',
    aliases: ['revelation', 'insight', 'reflection', 'note'],
    label: 'Thought',
    description: 'Revelation, reflection, journal entry, or insight (adds blue dot)',
    colorName: 'blue',
    color: CANONICAL_COLORS.blue.solid,
    washColor: CANONICAL_COLORS.blue.wash,
    priority: 5,
  },
  todo: {
    type: 'todo',
    primaryTag: 'todo',
    aliases: ['task', 'action'],
    label: 'To-Do',
    description: 'Actionable task item (adds green dot)',
    colorName: 'green',
    color: CANONICAL_COLORS.green.solid,
    washColor: CANONICAL_COLORS.green.wash,
    priority: 6,
  },
  time: {
    type: 'time',
    primaryTag: 'time',
    aliases: ['event', 'sched', 'schedule'],
    label: 'Scheduled Event',
    description: 'Time-of-day scheduled event or appointment (adds teal dot)',
    colorName: 'teal',
    color: CANONICAL_COLORS.teal.solid,
    washColor: CANONICAL_COLORS.teal.wash,
    priority: 7,
  },
  failed: {
    type: 'failed',
    primaryTag: 'failed',
    aliases: ['fail', 'failure', 'rejected', 'unsuccessful'],
    label: 'Failed',
    description: 'Failed, rejected, or unsuccessful task/event (adds muted red dot)',
    colorName: 'mutedRed',
    color: CANONICAL_COLORS.mutedRed.solid,
    washColor: CANONICAL_COLORS.mutedRed.wash,
    priority: 8,
  },
  skipped: {
    type: 'skipped',
    primaryTag: 'skipped',
    aliases: ['missed', 'postponed', 'dropped', 'canceled'],
    label: 'Skipped',
    description: 'Missed or postponed task (dimmed with line-through)',
    colorName: 'lightGray',
    color: CANONICAL_COLORS.lightGray.solid,
    washColor: CANONICAL_COLORS.lightGray.wash,
    dimsText: true,
    showInGutter: false,
    priority: 9,
  },
  custom: {
    type: 'custom',
    primaryTag: 'custom',
    aliases: [],
    label: 'Tag',
    description: 'Custom annotation',
    colorName: 'gray',
    color: CANONICAL_COLORS.gray.solid,
    washColor: CANONICAL_COLORS.gray.wash,
    showInGutter: false,
    priority: 99,
  },
};

// Test if tag string represents a time of day: e.g. 4:00pm, 4pm, 14:30, 9am, 10:15am, 2:00pm-3:30pm
export function isTimeString(tag: string): boolean {
  const clean = tag.trim().toLowerCase();
  return /^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:-\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\d{1,2}:\d{2})$/i.test(clean);
}

export interface ParsedAnnotation {
  raw: string; // e.g. "@important", "~~@wait~~", "@4:00pm"
  tag: string; // e.g. "important", "4:00pm"
  type: AnnotationCategory;
  label: string;
  color: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  bulletColor: string;
  resolvedColor: string;
  resolvedTextColor: string;
  resolvedBgColor: string;
  resolvedBulletColor: string;
  theme: BadgeTheme;
  showInGutter: boolean;
  gutterColor?: string; // Maintained for backwards compatibility
  makesBold?: boolean;
  dimsText?: boolean;
  priority: number;
  isTime?: boolean;
  timeString?: string;
  isResolved?: boolean;
  isLeading?: boolean;
}

export function resolveAnnotation(
  tag: string,
  isResolved = false,
  theme: BadgeTheme = DEFAULT_BADGE_THEME
): ParsedAnnotation {
  const lowerTag = tag.toLowerCase().trim();

  let config: AnnotationConfig | undefined;
  let isTime = false;

  if (isTimeString(lowerTag)) {
    config = ANNOTATION_CONFIGS.time;
    isTime = true;
  } else {
    for (const c of Object.values(ANNOTATION_CONFIGS)) {
      if (c.primaryTag === lowerTag || c.aliases.includes(lowerTag)) {
        config = c;
        break;
      }
    }
  }

  if (!config) {
    config = {
      ...ANNOTATION_CONFIGS.custom,
      primaryTag: lowerTag,
      label: tag,
    };
  }

  const baseColor = config.color;
  const resolvedColor = getResolvedAccentColor(baseColor);
  const showInGutter = config.showInGutter !== false;

  let textColor: string;
  let bgColor: string;
  let bulletColor: string;
  let resolvedTextColor: string;
  let resolvedBgColor: string;
  let resolvedBulletColor: string;

  if (theme === 'wash') {
    // Dark text on light bgcolor version
    bgColor = config.washColor || getWashBgColor(baseColor);
    textColor = '#2B2C30';
    bulletColor = baseColor;
    resolvedBgColor = getWashResolvedBgColor(bgColor);
    resolvedTextColor = getWashResolvedTextColor(baseColor);
    resolvedBulletColor = resolvedColor;
  } else {
    // Solid Theme (Default): Badges with light text on darker bgcolor
    bgColor = baseColor;
    textColor = getContrastingTextColor(baseColor);
    bulletColor = textColor === '#FFFFFF' ? '#FFFFFF' : '#2B2C30';
    resolvedBgColor = getSolidResolvedBgColor(baseColor);
    resolvedTextColor = getContrastingTextColor(resolvedBgColor);
    resolvedBulletColor = resolvedTextColor === '#FFFFFF' ? '#FAF8F5' : '#4A4B50';
  }

  return {
    raw: `@${tag}`,
    tag,
    type: config.type,
    label: isTime ? tag : config.label,
    color: baseColor,
    textColor,
    bgColor,
    borderColor: 'transparent',
    bulletColor,
    resolvedColor,
    resolvedTextColor,
    resolvedBgColor,
    resolvedBulletColor,
    theme,
    showInGutter,
    gutterColor: showInGutter ? baseColor : undefined,
    makesBold: config.makesBold,
    dimsText: config.dimsText,
    priority: config.priority,
    isTime,
    timeString: isTime ? tag : undefined,
    isResolved,
  };
}

export interface NoteSegment {
  type: 'text' | 'badge';
  text: string;
  annotation?: ParsedAnnotation;
  isLeading?: boolean;
}

export interface ParsedNoteResult {
  segments: NoteSegment[];
  annotations: ParsedAnnotation[];
  primaryAnnotation?: ParsedAnnotation;
  leadingAnnotation?: ParsedAnnotation;
  hasLeadingAnnotation: boolean;
  isImportant: boolean;
  isSkipped: boolean;
  isFailed?: boolean;
  hasTime: boolean;
  timeString?: string;
}

// Unified regex capturing active tags (@tag) or resolved tags (~~@tag~~) anywhere in text
export const ANNOTATION_REGEX = /(?:^|(?<=\s))(~~)?@([a-zA-Z0-9]+(?:[:.-][a-zA-Z0-9]+)*(?:[ap]m)?)(~~)?/gi;

/**
 * Parses raw note text into structured segments (plain text and micro-badges),
 * detecting active (@tag) and resolved (~~@tag~~) annotations while honoring
 * CommonMark-style backslash escaping.
 *
 * Escaping rules:
 * - Odd backslashes before '@' (e.g. `\@todo`): The tag is escaped. The escaping backslash
 *   is consumed on render, producing clean plain text `@todo` without a badge.
 * - Even backslashes before '@' (e.g. `\\@todo`): The backslash pair collapses to a single `\`,
 *   and `@todo` is rendered as an active micro-badge.
 *
 * @param content Raw note string stored in state (e.g. "Meeting \@important @todo")
 * @param noteIsStruck When true, cascades resolution to all annotations in this note
 * @returns Parsed segments, active/resolved annotations list, and computed flags
 */
export function parseNoteContent(
  content: string,
  noteIsStruck = false,
  theme: BadgeTheme = DEFAULT_BADGE_THEME
): ParsedNoteResult {
  if (!content) {
    return {
      segments: [{ type: 'text', text: '' }],
      annotations: [],
      hasLeadingAnnotation: false,
      isImportant: false,
      isSkipped: false,
      hasTime: false,
    };
  }

  const segments: NoteSegment[] = [];
  const annotations: ParsedAnnotation[] = [];

  const pushText = (text: string) => {
    if (!text) return;
    if (segments.length > 0 && segments[segments.length - 1].type === 'text') {
      segments[segments.length - 1].text += text;
    } else {
      segments.push({ type: 'text', text });
    }
  };

  const regex = /(~~)?@([a-zA-Z0-9]+(?:[:.-][a-zA-Z0-9]+)*(?:[ap]m)?)(~~)?/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const matchStart = match.index;
    const matchEnd = regex.lastIndex;
    const rawTag = match[0];
    const isTagStruck = Boolean(match[1] && match[3]);
    const tagBody = match[2];

    // Count preceding consecutive backslashes immediately before matchStart
    let backslashCount = 0;
    let checkIdx = matchStart;
    while (checkIdx > 0 && content[checkIdx - 1] === '\\') {
      backslashCount++;
      checkIdx--;
    }

    // Boundary check: must be start of text, whitespace, or opening punctuation
    const isAtStart = checkIdx === 0;
    const isPrecededByBoundary = isAtStart || /[\s([{"'`]/.test(content[checkIdx - 1]);

    if (!isPrecededByBoundary) {
      // Ignored: e.g. email@test.com
      continue;
    }

    // Halve preceding backslashes (\\ -> \, \\\\ -> \\)
    const collapsedBackslashes = '\\'.repeat(Math.floor(backslashCount / 2));
    const textBefore = content.slice(lastIndex, checkIdx) + collapsedBackslashes;

    // Odd number of backslashes means the '@' is escaped (e.g. \@todo, \\\@todo) -> not a badge
    if (backslashCount % 2 === 1) {
      // Consume the escaping backslash: render as plain text @tag without a badge
      pushText(textBefore + rawTag);
      lastIndex = matchEnd;
      continue;
    }

    // Even number of backslashes: valid unescaped badge
    pushText(textBefore);

    // Prefix Dot Elision: Determine if this badge is leading
    // (first badge in note and all preceding segments are whitespace-only)
    const isLeading = segments.every((s) => s.type === 'text' && s.text.trim() === '');

    const isResolved = noteIsStruck || isTagStruck;
    const parsed = resolveAnnotation(tagBody, isResolved, theme);
    parsed.raw = rawTag;
    parsed.isLeading = isLeading;
    annotations.push(parsed);

    segments.push({
      type: 'badge',
      text: rawTag,
      annotation: parsed,
      isLeading,
    });

    lastIndex = matchEnd;
  }

  // Push remaining text
  if (lastIndex < content.length) {
    pushText(content.slice(lastIndex));
  }

  // Sort annotations by priority
  const sortedAnnotations = [...annotations].sort((a, b) => a.priority - b.priority);
  const primaryAnnotation = sortedAnnotations[0];
  const leadingAnnotation = annotations.find((a) => a.isLeading);
  const hasLeadingAnnotation = Boolean(leadingAnnotation);

  // Only highlight bold if there is an active (unresolved) @important annotation
  const isImportant = annotations.some((a) => a.type === 'important' && !a.isResolved);
  const isSkipped = annotations.some((a) => a.type === 'skipped');
  const isFailed = annotations.some((a) => a.type === 'failed');
  const timeAnnotation = annotations.find((a) => a.isTime);

  return {
    segments,
    annotations,
    primaryAnnotation,
    leadingAnnotation,
    hasLeadingAnnotation,
    isImportant,
    isSkipped,
    isFailed,
    hasTime: Boolean(timeAnnotation),
    timeString: timeAnnotation?.timeString,
  };
}

export interface SplitNoteResult {
  anchor: ParsedAnnotation | null;
  bodyText: string;
}

/**
 * Splits a note into its leading Anchor Tag (if present) and the remaining Body Text.
 * The Anchor owns the bullet dot and card identity at x = 0.
 * The Body Text contains the prose and any inline tags, and is what participates in word diffs.
 */
export function splitNoteAnchorAndBody(
  content: string,
  noteIsStruck = false,
  theme: BadgeTheme = DEFAULT_BADGE_THEME
): SplitNoteResult {
  if (!content) {
    return { anchor: null, bodyText: '' };
  }

  const parsed = parseNoteContent(content, noteIsStruck, theme);
  if (!parsed.hasLeadingAnnotation || !parsed.leadingAnnotation) {
    return { anchor: null, bodyText: content };
  }

  const rawTag = parsed.leadingAnnotation.raw;
  const tagIdx = content.indexOf(rawTag);
  if (tagIdx === -1) {
    return { anchor: null, bodyText: content };
  }

  const afterTag = content.slice(tagIdx + rawTag.length);
  // Strip one leading space if present so body text doesn't have awkward leading indent
  const bodyText = afterTag.startsWith(' ') ? afterTag.slice(1) : afterTag;

  return {
    anchor: parsed.leadingAnnotation,
    bodyText,
  };
}

/**
 * Toggles an annotation's markdown strikethrough resolution state (@tag <-> ~~@tag~~)
 * within a note's raw text string.
 *
 * Backslash-safety: Only targets UNESCAPED matches (preceded by an even number of backslashes),
 * ensuring an active `@todo` badge can be toggled without corrupting an escaped `\@todo` in the same note.
 *
 * @param content The current raw note text
 * @param rawTag The annotation tag to toggle (e.g. "@todo" or "~~@todo~~")
 * @returns Updated raw note string with resolution state toggled
 */
export function toggleAnnotationResolution(content: string, rawTag: string): string {
  const isWrapped = rawTag.startsWith('~~') && rawTag.endsWith('~~');
  const targetTag = isWrapped ? rawTag.slice(2, -2) : rawTag;
  const searchPattern = isWrapped ? rawTag : targetTag;
  const replacement = isWrapped ? targetTag : `~~${targetTag}~~`;

  let searchIndex = 0;
  while (true) {
    const matchIdx = content.indexOf(searchPattern, searchIndex);
    if (matchIdx === -1) break;

    // Count preceding backslashes
    let backslashCount = 0;
    let k = matchIdx;
    while (k > 0 && content[k - 1] === '\\') {
      backslashCount++;
      k--;
    }

    const isAtStart = k === 0;
    const isPrecededByBoundary = isAtStart || /[\s([{"'`]/.test(content[k - 1]);

    if (isPrecededByBoundary && backslashCount % 2 === 0) {
      return (
        content.slice(0, matchIdx) +
        replacement +
        content.slice(matchIdx + searchPattern.length)
      );
    }

    searchIndex = matchIdx + searchPattern.length;
  }

  return content;
}

// Determines the color of the note's bullet
export function getNoteBulletColor(content: string, fallbackColor?: string, isStruck?: boolean): string {
  if (!content) return fallbackColor || '#A19D94';
  const { leadingAnnotation, primaryAnnotation } = parseNoteContent(content, isStruck);
  if (leadingAnnotation) {
    return isStruck && leadingAnnotation.resolvedColor ? leadingAnnotation.resolvedColor : leadingAnnotation.color;
  }
  if (primaryAnnotation) {
    return isStruck && primaryAnnotation.resolvedColor ? primaryAnnotation.resolvedColor : primaryAnnotation.color;
  }
  return fallbackColor || '#A19D94';
}

export interface GutterDotItem {
  id: string;
  color: string;
  type: AnnotationCategory | 'custom';
  isStruck: boolean;
  isResolved: boolean;
  label: string;
}

// Calculates the horizontal notable dots for a day's date gutter
// Each note's semantic annotations are tracked. Struck notes or resolved tags produce crossed-out dots.
export function getGutterDotsForNotes(
  dayNotes: Array<{ id: string; content: string; isStruck: boolean; colorTag?: string }>
): { dots: GutterDotItem[]; title: string } {
  const dots: GutterDotItem[] = [];
  const typeCounts: Record<string, { total: number; resolved: number }> = {};

  for (const note of dayNotes) {
    const { annotations } = parseNoteContent(note.content, note.isStruck);

    // Track unique gutter-eligible annotation types on this note
    const seenTypes = new Set<string>();
    let hasAnnotationDots = false;

    for (const ann of annotations) {
      if (ann.showInGutter && !seenTypes.has(ann.type)) {
        seenTypes.add(ann.type);
        hasAnnotationDots = true;
        const isResolved = Boolean(note.isStruck || ann.isResolved);
        const dotColor = isResolved ? ann.resolvedColor : ann.color;

        dots.push({
          id: `${note.id}-${ann.type}`,
          color: dotColor,
          type: ann.type,
          isStruck: note.isStruck,
          isResolved,
          label: ann.label,
        });

        if (!typeCounts[ann.label]) {
          typeCounts[ann.label] = { total: 0, resolved: 0 };
        }
        typeCounts[ann.label].total += 1;
        if (isResolved) {
          typeCounts[ann.label].resolved += 1;
        }
      }
    }

    // Fallback to manual colorTag if note had no semantic annotation dots
    if (!hasAnnotationDots && note.colorTag) {
      const isResolved = note.isStruck;
      dots.push({
        id: `${note.id}-colortag`,
        color: isResolved ? getResolvedAccentColor(note.colorTag) : note.colorTag,
        type: 'custom',
        isStruck: note.isStruck,
        isResolved,
        label: 'Color Tag',
      });
      if (!typeCounts['Color Tag']) {
        typeCounts['Color Tag'] = { total: 0, resolved: 0 };
      }
      typeCounts['Color Tag'].total += 1;
      if (isResolved) {
        typeCounts['Color Tag'].resolved += 1;
      }
    }
  }

  // Sort dots: active (unresolved) first, then resolved dots, ordered by priority
  dots.sort((a, b) => {
    if (a.isResolved !== b.isResolved) {
      return a.isResolved ? 1 : -1;
    }
    const priorityA = ANNOTATION_CONFIGS[a.type as AnnotationCategory]?.priority ?? 99;
    const priorityB = ANNOTATION_CONFIGS[b.type as AnnotationCategory]?.priority ?? 99;
    return priorityA - priorityB;
  });

  const countSummaries = Object.entries(typeCounts).map(([label, counts]) => {
    if (counts.resolved > 0 && counts.resolved === counts.total) {
      return `${counts.total} ${label.toLowerCase()} (all resolved)`;
    }
    if (counts.resolved > 0) {
      return `${counts.total} ${label.toLowerCase()} (${counts.resolved} resolved)`;
    }
    return `${counts.total} ${label.toLowerCase()}`;
  });

  const title =
    countSummaries.length > 0
      ? countSummaries.join(', ')
      : `${dots.length} notable dot(s)`;

  return { dots, title };
}

// Preset quick annotations for autocomplete menus and quick-tag pills
export interface QuickTagOption {
  tag: string;
  label: string;
  description: string;
  color: string;
  type: AnnotationCategory;
}

export const SUGGESTED_TAGS: QuickTagOption[] = [
  {
    tag: 'important',
    label: '@important',
    description: 'Urgent / critical priority (adds red date dot & bold font)',
    color: ANNOTATION_CONFIGS.important.color,
    type: 'important',
  },
  {
    tag: 'wait',
    label: '@wait',
    description: 'Waiting on external event, email, or blocker (adds orange dot)',
    color: ANNOTATION_CONFIGS.wait.color,
    type: 'wait',
  },
  {
    tag: 'celebrate',
    label: '@celebrate',
    description: 'Happy event, celebration, birthday, or milestone (adds yellow dot)',
    color: ANNOTATION_CONFIGS.celebrate.color,
    type: 'celebrate',
  },
  {
    tag: 'todo',
    label: '@todo',
    description: 'Actionable to-do item (adds green dot)',
    color: ANNOTATION_CONFIGS.todo.color,
    type: 'todo',
  },
  {
    tag: 'explore',
    label: '@explore',
    description: 'Exploratory idea, inquiry, research, or unknown (adds purple dot)',
    color: ANNOTATION_CONFIGS.explore.color,
    type: 'explore',
  },
  {
    tag: 'thought',
    label: '@thought',
    description: 'Insight, reflection, journal entry, or revelation (adds blue dot)',
    color: ANNOTATION_CONFIGS.thought.color,
    type: 'thought',
  },
  {
    tag: '4:00pm',
    label: '@4:00pm',
    description: 'Schedule at a specific time of day (adds teal dot)',
    color: ANNOTATION_CONFIGS.time.color,
    type: 'time',
  },
  {
    tag: 'failed',
    label: '@failed',
    description: 'Failed, rejected, or unsuccessful task/event (adds muted red dot)',
    color: ANNOTATION_CONFIGS.failed.color,
    type: 'failed',
  },
  {
    tag: 'skipped',
    label: '@skipped',
    description: 'Missed or postponed task (dimmed)',
    color: ANNOTATION_CONFIGS.skipped.color,
    type: 'skipped',
  },
];
