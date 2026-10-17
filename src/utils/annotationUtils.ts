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

export interface AnnotationConfig {
  type: AnnotationCategory;
  primaryTag: string; // e.g. "important"
  aliases: string[];  // e.g. ["urgent", "star", "key"]
  label: string;
  description: string;
  color: string;               // Dot / Bullet accent color (Active)
  textColor: string;           // Badge ink text color (Active - deep tone)
  bgColor: string;             // Badge wash background color (Active - soft tinted paper wash)
  borderColor: string;         // Micro-badge border
  resolvedColor?: string;     // Dot / Bullet accent color (Resolved - same hue, dialed warmer/lighter)
  resolvedTextColor?: string; // Badge ink text color (Resolved - same hue, dialed warmer/lighter)
  resolvedBgColor?: string;   // Badge wash background color (Resolved - same hue, dialed warmer/lighter)
  gutterColor?: string; // Dot color on date gutter
  makesBold?: boolean; // Changes note text font to bold
  dimsText?: boolean;  // Dims note text
  priority: number;    // Lower number = higher priority
}

export const ANNOTATION_CONFIGS: Record<AnnotationCategory, AnnotationConfig> = {
  important: {
    type: 'important',
    primaryTag: 'important',
    aliases: ['urgent', 'star', 'key'],
    label: 'Important',
    description: 'High priority / critical task (adds red dot to date gutter & bold font)',
    color: '#D23B38', // Desert Crimson
    textColor: '#8C1D1B', // Deep crimson ink
    bgColor: '#FCEBEA', // Soft crimson paper wash
    borderColor: '#D23B3830',
    resolvedColor: '#D99492',
    resolvedTextColor: '#A65E5C',
    resolvedBgColor: '#FCF3F2',
    gutterColor: '#D23B38',
    makesBold: true,
    priority: 1,
  },
  wait: {
    type: 'wait',
    primaryTag: 'wait',
    aliases: ['await', 'waiting', 'blocked', 'pending'],
    label: 'Waiting',
    description: 'Waiting on external event, email, or blocker (adds terracotta dot)',
    color: '#E29578', // Terracotta
    textColor: '#8A3E26', // Deep terracotta ink
    bgColor: '#FAECE6', // Soft terracotta paper wash
    borderColor: '#E2957830',
    resolvedColor: '#DFAC98',
    resolvedTextColor: '#A97463',
    resolvedBgColor: '#FAF2EF',
    gutterColor: '#E29578',
    priority: 2,
  },
  celebrate: {
    type: 'celebrate',
    primaryTag: 'celebrate',
    aliases: ['happy', 'birthday', 'party', 'fun', 'joy', 'milestone', 'cheers'],
    label: 'Happy Event',
    description: 'Celebration, birthday, milestone, or happy event (adds golden ochre dot)',
    color: '#E9C46A', // Warm Ochre
    textColor: '#7D5705', // Deep amber ochre ink
    bgColor: '#FAF3E1', // Soft warm ochre paper wash
    borderColor: '#E9C46A30',
    resolvedColor: '#DFC78B',
    resolvedTextColor: '#9E8651',
    resolvedBgColor: '#FCF8EE',
    gutterColor: '#E9C46A',
    priority: 3,
  },
  explore: {
    type: 'explore',
    primaryTag: 'explore',
    aliases: ['idea', 'question', 'unknown', 'research', 'brainstorm'],
    label: 'Explore / Idea',
    description: 'Exploratory inquiry, unknown, research, or idea (adds lavender dot)',
    color: '#9B5DE5', // Lavender / Amethyst
    textColor: '#5A229E', // Deep amethyst ink
    bgColor: '#F4ECFC', // Soft lavender paper wash
    borderColor: '#9B5DE530',
    resolvedColor: '#B693E3',
    resolvedTextColor: '#8B71A8',
    resolvedBgColor: '#F9F4FD',
    gutterColor: '#9B5DE5',
    priority: 4,
  },
  thought: {
    type: 'thought',
    primaryTag: 'thought',
    aliases: ['revelation', 'insight', 'reflection', 'note'],
    label: 'Thought',
    description: 'Revelation, reflection, journal entry, or insight (adds steel blue dot)',
    color: '#457B9D', // Steel Blue / Slate
    textColor: '#1B4766', // Deep slate blue ink
    bgColor: '#EBF2F6', // Soft slate paper wash
    borderColor: '#457B9D30',
    resolvedColor: '#7FA1B5',
    resolvedTextColor: '#688699',
    resolvedBgColor: '#F2F6F9',
    gutterColor: '#457B9D',
    priority: 5,
  },
  todo: {
    type: 'todo',
    primaryTag: 'todo',
    aliases: ['task', 'action'],
    label: 'To-Do',
    description: 'Actionable task item (adds sage dot)',
    color: '#83C5BE', // Sage / Aqua
    textColor: '#1C544E', // Deep forest sage ink
    bgColor: '#E4F1EF', // Soft sage paper wash
    borderColor: '#83C5BE30',
    resolvedColor: '#A0C4C0',
    resolvedTextColor: '#6C8F8B',
    resolvedBgColor: '#EFF6F5',
    gutterColor: '#83C5BE',
    priority: 6,
  },
  time: {
    type: 'time',
    primaryTag: 'time',
    aliases: ['event', 'sched', 'schedule'],
    label: 'Scheduled Event',
    description: 'Time-of-day scheduled event or appointment (adds slate dot)',
    color: '#71727A', // Muted slate gray
    textColor: '#36373D', // Deep graphite ink
    bgColor: '#F0EFEA', // Soft parchment wash
    borderColor: '#71727A30',
    resolvedColor: '#9D9DA3',
    resolvedTextColor: '#83838A',
    resolvedBgColor: '#F6F5F2',
    gutterColor: '#71727A',
    priority: 7,
  },
  failed: {
    type: 'failed',
    primaryTag: 'failed',
    aliases: ['fail', 'failure', 'rejected', 'unsuccessful'],
    label: 'Failed',
    description: 'Failed, rejected, or unsuccessful task/event (adds ruby dot)',
    color: '#C84E4B', // Ruby muted red
    textColor: '#872321', // Deep ruby ink
    bgColor: '#FCEBEA', // Soft ruby wash
    borderColor: '#C84E4B30',
    resolvedColor: '#D89593',
    resolvedTextColor: '#A46765',
    resolvedBgColor: '#FCF3F2',
    gutterColor: '#C84E4B',
    priority: 8,
  },
  skipped: {
    type: 'skipped',
    primaryTag: 'skipped',
    aliases: ['missed', 'postponed', 'dropped', 'canceled'],
    label: 'Skipped',
    description: 'Missed or postponed task (dimmed with line-through)',
    color: '#A19D94', // Muted graphite ash
    textColor: '#57544D', // Deep pencil ash ink
    bgColor: '#F3F1EC', // Soft ash paper wash
    borderColor: '#A19D9430',
    resolvedColor: '#BDBAB2',
    resolvedTextColor: '#949087',
    resolvedBgColor: '#F7F6F3',
    dimsText: true,
    priority: 9,
  },
  custom: {
    type: 'custom',
    primaryTag: 'custom',
    aliases: [],
    label: 'Tag',
    description: 'Custom annotation',
    color: '#71727A',
    textColor: '#3E3F45',
    bgColor: '#F1EFEA',
    borderColor: '#71727A30',
    resolvedColor: '#9D9DA3',
    resolvedTextColor: '#83838A',
    resolvedBgColor: '#F5F4F1',
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
  resolvedColor?: string;
  resolvedTextColor?: string;
  resolvedBgColor?: string;
  gutterColor?: string;
  makesBold?: boolean;
  dimsText?: boolean;
  priority: number;
  isTime?: boolean;
  timeString?: string;
  isResolved?: boolean;
  isLeading?: boolean;
}

export function resolveAnnotation(tag: string, isResolved = false): ParsedAnnotation {
  const lowerTag = tag.toLowerCase().trim();

  // Check if it's a time annotation (e.g. 4:00pm, 9am, 14:30)
  if (isTimeString(lowerTag)) {
    const config = ANNOTATION_CONFIGS.time;
    return {
      raw: `@${tag}`,
      tag,
      type: 'time',
      label: tag,
      color: config.color,
      textColor: config.textColor,
      bgColor: config.bgColor,
      borderColor: config.borderColor,
      resolvedColor: config.resolvedColor,
      resolvedTextColor: config.resolvedTextColor,
      resolvedBgColor: config.resolvedBgColor,
      gutterColor: config.gutterColor,
      priority: config.priority,
      isTime: true,
      timeString: tag,
      isResolved,
    };
  }

  // Check defined categories and their aliases
  for (const config of Object.values(ANNOTATION_CONFIGS)) {
    if (config.primaryTag === lowerTag || config.aliases.includes(lowerTag)) {
      return {
        raw: `@${tag}`,
        tag,
        type: config.type,
        label: config.label,
        color: config.color,
        textColor: config.textColor,
        bgColor: config.bgColor,
        borderColor: config.borderColor,
        resolvedColor: config.resolvedColor,
        resolvedTextColor: config.resolvedTextColor,
        resolvedBgColor: config.resolvedBgColor,
        gutterColor: config.gutterColor,
        makesBold: config.makesBold,
        dimsText: config.dimsText,
        priority: config.priority,
        isResolved,
      };
    }
  }

  // Fallback for custom / unknown tags
  const fallback = ANNOTATION_CONFIGS.custom;
  return {
    raw: `@${tag}`,
    tag,
    type: 'custom',
    label: tag,
    color: fallback.color,
    textColor: fallback.textColor,
    bgColor: fallback.bgColor,
    borderColor: fallback.borderColor,
    resolvedColor: fallback.resolvedColor,
    resolvedTextColor: fallback.resolvedTextColor,
    resolvedBgColor: fallback.resolvedBgColor,
    priority: fallback.priority,
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
export function parseNoteContent(content: string, noteIsStruck = false): ParsedNoteResult {
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
    const parsed = resolveAnnotation(tagBody, isResolved);
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
export function splitNoteAnchorAndBody(content: string, noteIsStruck = false): SplitNoteResult {
  if (!content) {
    return { anchor: null, bodyText: '' };
  }

  const parsed = parseNoteContent(content, noteIsStruck);
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
      if (ann.gutterColor && !seenTypes.has(ann.type)) {
        seenTypes.add(ann.type);
        hasAnnotationDots = true;
        const isResolved = Boolean(note.isStruck || ann.isResolved);
        const resolvedDotColor = ann.resolvedColor || ann.gutterColor;

        dots.push({
          id: `${note.id}-${ann.type}`,
          color: isResolved && resolvedDotColor ? resolvedDotColor : (ann.gutterColor || ann.color),
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
        color: note.colorTag,
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
    description: 'Urgent / critical priority (adds crimson date dot & bold font)',
    color: ANNOTATION_CONFIGS.important.color,
    type: 'important',
  },
  {
    tag: 'wait',
    label: '@wait',
    description: 'Waiting on external event, email, or blocker (adds terracotta dot)',
    color: ANNOTATION_CONFIGS.wait.color,
    type: 'wait',
  },
  {
    tag: 'celebrate',
    label: '@celebrate',
    description: 'Happy event, celebration, birthday, or milestone (adds warm ochre dot)',
    color: ANNOTATION_CONFIGS.celebrate.color,
    type: 'celebrate',
  },
  {
    tag: 'todo',
    label: '@todo',
    description: 'Actionable to-do item (adds sage dot)',
    color: ANNOTATION_CONFIGS.todo.color,
    type: 'todo',
  },
  {
    tag: 'explore',
    label: '@explore',
    description: 'Exploratory idea, inquiry, research, or unknown (adds lavender dot)',
    color: ANNOTATION_CONFIGS.explore.color,
    type: 'explore',
  },
  {
    tag: 'thought',
    label: '@thought',
    description: 'Insight, reflection, journal entry, or revelation (adds steel blue dot)',
    color: ANNOTATION_CONFIGS.thought.color,
    type: 'thought',
  },
  {
    tag: '4:00pm',
    label: '@4:00pm',
    description: 'Schedule at a specific time of day (adds slate dot)',
    color: ANNOTATION_CONFIGS.time.color,
    type: 'time',
  },
  {
    tag: 'failed',
    label: '@failed',
    description: 'Failed, rejected, or unsuccessful task/event (adds ruby dot)',
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
