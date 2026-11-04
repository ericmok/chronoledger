/**
 * Tag Prototype Type Definitions & Canonical Defaults
 *
 * Defines the core stationery prototypes for ChronoLedger tags,
 * their default properties (color, notable dot, priority, etc.),
 * and the extensible schema for user custom tags.
 */

export type TagStatus = 'open' | 'wip' | 'done' | 'dropped' | 'migrated';
export type ColorStyle = 'light_on_dark' | 'dark_on_light';
export type AnimatedStyle = 'none' | 'bounce';

export interface AttributeStyleRule {
  id: string;
  attrKey?: string;
  attrValue: string;
  color?: string;
  colorStyle?: ColorStyle;
  bgColor?: string;
  bold?: boolean;
  italic?: boolean;
  dim?: boolean;
  strikethrough?: boolean;
  animatedStyle?: AnimatedStyle;
}

export interface TagTypeDefinition {
  tag: string;
  color: string;
  notable: boolean;         // Projects dot to date gutter by default
  makesBold?: boolean;      // Emboldens note prose (e.g. @important)
  dimsText?: boolean;       // Fades note opacity (e.g. @skipped)
  isTime?: boolean;         // Triggers clock parsing (e.g. @time, @4:00pm)
  gutterPriority: number;   // Visual sorting priority for date gutter dots (1 = highest)
  isCore: boolean;          // True for built-in stationery types, false for custom user tags
  defaultStatus?: TagStatus;
  styleRules?: AttributeStyleRule[];
}

/**
 * Built-in core stationery tag definitions.
 * Colors align with CANONICAL_COLORS.
 */
export const CORE_TAG_PROTOTYPES: Record<string, TagTypeDefinition> = {
  important: {
    tag: 'important',
    color: '#F47290', // red
    notable: true,
    makesBold: true,
    gutterPriority: 1,
    isCore: true,
    styleRules: [
      {
        id: 'important_rule_high',
        attrKey: 'priority',
        attrValue: 'high',
        color: '#F47290',
        colorStyle: 'light_on_dark',
        bold: true,
        animatedStyle: 'bounce',
      },
      {
        id: 'important_rule_urgent',
        attrKey: 'priority',
        attrValue: 'urgent',
        color: '#F47290',
        colorStyle: 'light_on_dark',
        bold: true,
        animatedStyle: 'bounce',
      },
    ],
  },
  wait: {
    tag: 'wait',
    color: '#F5AC6C', // orange
    notable: true,
    gutterPriority: 2,
    isCore: true,
  },
  celebrate: {
    tag: 'celebrate',
    color: '#EADA25', // yellow
    notable: true,
    gutterPriority: 3,
    isCore: true,
  },
  explore: {
    tag: 'explore',
    color: '#D097F7', // purple
    notable: false,
    gutterPriority: 4,
    isCore: true,
  },
  thought: {
    tag: 'thought',
    color: '#4FA3F2', // blue
    notable: false,
    gutterPriority: 5,
    isCore: true,
  },
  todo: {
    tag: 'todo',
    color: '#51C391', // green
    notable: true,
    gutterPriority: 6,
    isCore: true,
    defaultStatus: 'open',
    styleRules: [
      {
        id: 'todo_rule_wip',
        attrKey: 'status',
        attrValue: 'wip',
        color: '#F5AC6C',
        colorStyle: 'dark_on_light',
        italic: true,
        animatedStyle: 'none',
      },
      {
        id: 'todo_rule_done',
        attrKey: 'status',
        attrValue: 'done',
        color: '#6F7880',
        colorStyle: 'dark_on_light',
        dim: true,
        strikethrough: true,
        animatedStyle: 'none',
      },
      {
        id: 'todo_rule_high',
        attrKey: 'priority',
        attrValue: 'high',
        color: '#F47290',
        colorStyle: 'light_on_dark',
        bold: true,
        animatedStyle: 'bounce',
      },
      {
        id: 'todo_rule_low',
        attrKey: 'priority',
        attrValue: 'low',
        color: '#4FA3F2',
        colorStyle: 'dark_on_light',
        animatedStyle: 'none',
      },
    ],
  },
  time: {
    tag: 'time',
    color: '#81DACE', // teal
    notable: true,
    isTime: true,
    gutterPriority: 7,
    isCore: true,
  },
  failed: {
    tag: 'failed',
    color: '#D86B6B', // muted red
    notable: true,
    gutterPriority: 8,
    isCore: true,
  },
  skipped: {
    tag: 'skipped',
    color: '#9FB1C1', // light gray
    notable: false,
    dimsText: true,
    gutterPriority: 9,
    isCore: true,
  },
  custom: {
    tag: 'custom',
    color: '#6F7880', // gray
    notable: false,
    gutterPriority: 99,
    isCore: true,
  },
};

/**
 * Retrieves the prototype definition for a given tag, falling back to custom.
 */
export function getTagPrototype(
  tag: string,
  customPrototypes?: Record<string, TagTypeDefinition>
): TagTypeDefinition {
  const normalized = tag.toLowerCase().trim();
  if (customPrototypes && customPrototypes[normalized]) {
    return customPrototypes[normalized];
  }
  if (CORE_TAG_PROTOTYPES[normalized]) {
    return CORE_TAG_PROTOTYPES[normalized];
  }
  return {
    ...CORE_TAG_PROTOTYPES.custom,
    tag: normalized,
    isCore: false,
  };
}
