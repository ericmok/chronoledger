// Semantic Note Annotations & Tagging Engine
// Provides tag parsing, micro-badge rendering metadata, time-parsing,
// dynamic bullet colors, notable dots tracking, and resolution states.

export type AnnotationCategory =
  | 'important'
  | 'wait'
  | 'celebrate'
  | 'explore'
  | 'thought'
  | 'todo'
  | 'time'
  | 'skipped'
  | 'custom';

export interface AnnotationConfig {
  type: AnnotationCategory;
  primaryTag: string; // e.g. "important"
  aliases: string[];  // e.g. ["urgent", "star", "key"]
  label: string;
  description: string;
  color: string;       // Dot / Bullet accent color
  textColor: string;   // Micro-badge text
  bgColor: string;     // Micro-badge background
  borderColor: string; // Micro-badge border
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
    color: '#D23B38', // Desert crimson red
    textColor: '#B91C1C',
    bgColor: '#FEF2F2',
    borderColor: '#FECACA',
    gutterColor: '#D23B38',
    makesBold: true,
    priority: 1,
  },
  wait: {
    type: 'wait',
    primaryTag: 'wait',
    aliases: ['await', 'waiting', 'blocked', 'pending'],
    label: 'Waiting',
    description: 'Waiting on external event, email, or blocker (adds orange dot)',
    color: '#E07A5F', // Warm terracotta orange
    textColor: '#C2410C',
    bgColor: '#FFF7ED',
    borderColor: '#FFEDD5',
    gutterColor: '#E07A5F',
    priority: 2,
  },
  celebrate: {
    type: 'celebrate',
    primaryTag: 'celebrate',
    aliases: ['happy', 'birthday', 'party', 'fun', 'joy', 'milestone', 'cheers'],
    label: 'Happy Event',
    description: 'Celebration, birthday, milestone, or happy event (adds golden yellow dot)',
    color: '#F59E0B', // Radiant golden yellow / marigold
    textColor: '#B45309',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
    gutterColor: '#F59E0B',
    priority: 3,
  },
  explore: {
    type: 'explore',
    primaryTag: 'explore',
    aliases: ['idea', 'question', 'unknown', 'research', 'brainstorm'],
    label: 'Explore / Idea',
    description: 'Exploratory inquiry, unknown, research, or idea (adds purple dot)',
    color: '#9B5DE5', // Vivid amethyst purple
    textColor: '#7E22CE',
    bgColor: '#FAF5FF',
    borderColor: '#F3E8FF',
    gutterColor: '#9B5DE5',
    priority: 4,
  },
  thought: {
    type: 'thought',
    primaryTag: 'thought',
    aliases: ['revelation', 'insight', 'reflection', 'note'],
    label: 'Thought',
    description: 'Revelation, reflection, journal entry, or insight (adds blue dot)',
    color: '#4A90E2', // Sky blue / cerulean
    textColor: '#1D4ED8',
    bgColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    gutterColor: '#4A90E2',
    priority: 5,
  },
  todo: {
    type: 'todo',
    primaryTag: 'todo',
    aliases: ['task', 'action'],
    label: 'To-Do',
    description: 'Actionable task item (adds green dot)',
    color: '#2E8540', // Crisp botanical emerald green
    textColor: '#15803D',
    bgColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    gutterColor: '#2E8540',
    priority: 6,
  },
  time: {
    type: 'time',
    primaryTag: 'time',
    aliases: ['event', 'sched', 'schedule'],
    label: 'Scheduled Event',
    description: 'Time-of-day scheduled event or appointment (adds slate dot)',
    color: '#8E8F95', // Muted slate gray
    textColor: '#475569',
    bgColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    gutterColor: '#8E8F95',
    priority: 7,
  },
  skipped: {
    type: 'skipped',
    primaryTag: 'skipped',
    aliases: ['missed', 'postponed', 'dropped', 'canceled'],
    label: 'Skipped',
    description: 'Missed or postponed task (dimmed with line-through)',
    color: '#A19D94', // Muted graphite ash
    textColor: '#6B7280',
    bgColor: '#F3F4F6',
    borderColor: '#E5E7EB',
    dimsText: true,
    priority: 8,
  },
  custom: {
    type: 'custom',
    primaryTag: 'custom',
    aliases: [],
    label: 'Tag',
    description: 'Custom annotation',
    color: '#71727A',
    textColor: '#4B5563',
    bgColor: '#F3F4F6',
    borderColor: '#E5E7EB',
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
  gutterColor?: string;
  makesBold?: boolean;
  dimsText?: boolean;
  priority: number;
  isTime?: boolean;
  timeString?: string;
  isResolved?: boolean;
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
    priority: fallback.priority,
    isResolved,
  };
}

export interface NoteSegment {
  type: 'text' | 'badge';
  text: string;
  annotation?: ParsedAnnotation;
}

export interface ParsedNoteResult {
  segments: NoteSegment[];
  annotations: ParsedAnnotation[];
  primaryAnnotation?: ParsedAnnotation;
  isImportant: boolean;
  isSkipped: boolean;
  hasTime: boolean;
  timeString?: string;
}

// Unified regex capturing active tags (@tag) or resolved tags (~~@tag~~) anywhere in text
export const ANNOTATION_REGEX = /(?:^|(?<=\s))(~~)?@([a-zA-Z0-9]+(?:[:.-][a-zA-Z0-9]+)*(?:[ap]m)?)(~~)?/gi;

export function parseNoteContent(content: string, noteIsStruck = false): ParsedNoteResult {
  if (!content) {
    return {
      segments: [{ type: 'text', text: '' }],
      annotations: [],
      isImportant: false,
      isSkipped: false,
      hasTime: false,
    };
  }

  const segments: NoteSegment[] = [];
  const annotations: ParsedAnnotation[] = [];

  const regex = /(?:^|(?<=\s))(~~)?@([a-zA-Z0-9]+(?:[:.-][a-zA-Z0-9]+)*(?:[ap]m)?)(~~)?/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const matchStart = match.index;
    const matchEnd = regex.lastIndex;
    const rawTag = match[0];
    const isTagStruck = Boolean(match[1] && match[3]);
    const tagBody = match[2];

    // Push preceding text segment
    if (matchStart > lastIndex) {
      segments.push({
        type: 'text',
        text: content.slice(lastIndex, matchStart),
      });
    }

    const isResolved = noteIsStruck || isTagStruck;
    const parsed = resolveAnnotation(tagBody, isResolved);
    parsed.raw = rawTag;
    annotations.push(parsed);

    segments.push({
      type: 'badge',
      text: rawTag,
      annotation: parsed,
    });

    lastIndex = matchEnd;
  }

  // Push remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      text: content.slice(lastIndex),
    });
  }

  // Sort annotations by priority
  const sortedAnnotations = [...annotations].sort((a, b) => a.priority - b.priority);
  const primaryAnnotation = sortedAnnotations[0];

  // Only highlight bold if there is an active (unresolved) @important annotation
  const isImportant = annotations.some((a) => a.type === 'important' && !a.isResolved);
  const isSkipped = annotations.some((a) => a.type === 'skipped');
  const timeAnnotation = annotations.find((a) => a.isTime);

  return {
    segments,
    annotations,
    primaryAnnotation,
    isImportant,
    isSkipped,
    hasTime: Boolean(timeAnnotation),
    timeString: timeAnnotation?.timeString,
  };
}

// Toggles an annotation's resolution state within a note's text
// e.g. "@wait" -> "~~@wait~~", and "~~@wait~~" -> "@wait"
export function toggleAnnotationResolution(content: string, rawTag: string): string {
  if (rawTag.startsWith('~~') && rawTag.endsWith('~~')) {
    const unwrap = rawTag.slice(2, -2);
    return content.replace(rawTag, unwrap);
  }
  return content.replace(rawTag, `~~${rawTag}~~`);
}

// Determines the color of the note's bullet
export function getNoteBulletColor(content: string, fallbackColor?: string): string {
  if (!content) return fallbackColor || '#A19D94';
  const { primaryAnnotation } = parseNoteContent(content);
  if (primaryAnnotation) {
    return primaryAnnotation.color;
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

        dots.push({
          id: `${note.id}-${ann.type}`,
          color: ann.gutterColor,
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
    description: 'Happy event, celebration, birthday, or milestone (adds golden yellow dot)',
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
    description: 'Schedule at a specific time of day (adds slate dot)',
    color: ANNOTATION_CONFIGS.time.color,
    type: 'time',
  },
  {
    tag: 'skipped',
    label: '@skipped',
    description: 'Missed or postponed task (dimmed)',
    color: ANNOTATION_CONFIGS.skipped.color,
    type: 'skipped',
  },
];
