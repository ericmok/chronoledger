/**
 * Tag & Attribute Style Resolver
 *
 * Evaluates tag prototypes, user definitions, and attribute style rules against
 * parsed tag tokens to compute final badge colors, contrast text, typography,
 * and subtle bounce motion states.
 */

import {
  type AttributeStyleRule,
  type TagTypeDefinition,
  type AnimatedStyle,
  CORE_TAG_PROTOTYPES,
} from './tagPrototypes.ts';
import type { ParsedTagToken } from './tagParser.ts';
import {
  getWashBgColor,
  getWashResolvedBgColor,
  getWashResolvedTextColor,
  getSolidResolvedBgColor,
  getContrastingTextColor,
  getResolvedAccentColor,
  type BadgeTheme,
  DEFAULT_BADGE_THEME,
} from './annotationUtils.ts';
import type { UserTagDefinition } from '../services/tagService.ts';

export interface ResolvedTagStyle {
  tag: string;
  color: string;
  textColor: string;
  bgColor: string;
  bulletColor: string;
  isBold: boolean;
  isItalic: boolean;
  isDim: boolean;
  isStrikethrough: boolean;
  animatedStyle: AnimatedStyle;
  matchedRule?: AttributeStyleRule;
}

/**
 * Checks whether an attribute style rule matches a parsed tag token.
 *
 * Matching logic:
 * 1. If attrKey is specified (e.g. "priority"):
 *    Checks if token.attributes[attrKey] equals attrValue (case-insensitive string match).
 * 2. If attrKey is empty, omitted, or "*":
 *    - Matches if attrValue is in token.positionalValues (e.g. @todo[wip] or @todo[high])
 *    - Matches if token.attributes[attrValue] === true (boolean flag shorthand)
 *    - Matches if any attribute key has this value (e.g. status=wip, priority=high)
 */
export function matchesAttributeRule(
  rule: AttributeStyleRule,
  token?: ParsedTagToken | null
): boolean {
  if (!token) return false;
  const targetVal = rule.attrValue.toLowerCase().trim();
  if (!targetVal) return false;

  const rawKey = (rule.attrKey || '').toLowerCase().trim();

  // Key-Value explicit match (e.g. priority=high, status=wip)
  if (rawKey && rawKey !== '*') {
    const val = token.attributes?.[rawKey];
    if (val !== undefined && String(val).toLowerCase().trim() === targetVal) {
      return true;
    }

    // Special status equivalence: positional flags (e.g. @todo[wip]) naturally match status=wip
    if (rawKey === 'status') {
      if (
        token.positionalValues &&
        token.positionalValues.some((p) => p.toLowerCase().trim() === targetVal)
      ) {
        return true;
      }
      if (token.attributes && token.attributes[targetVal] === true) {
        return true;
      }
    }

    return false;
  }

  // Shorthand / Any-key match:
  // 1. Check positional values (e.g. @todo[wip, high])
  if (
    token.positionalValues &&
    token.positionalValues.some((p) => p.toLowerCase().trim() === targetVal)
  ) {
    return true;
  }

  // 2. Check boolean attribute flags (e.g. @todo[wip] sets attributes['wip'] = true)
  if (token.attributes && token.attributes[targetVal] === true) {
    return true;
  }

  // 3. Check any attribute key having this value
  if (token.attributes) {
    for (const v of Object.values(token.attributes)) {
      if (String(v).toLowerCase().trim() === targetVal) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Resolves the visual styling for a tag token based on tag definition defaults
 * and attribute style rules.
 */
export function resolveTagStyle(
  tag: string,
  token?: ParsedTagToken | null,
  definition?: UserTagDefinition | TagTypeDefinition | null,
  isResolved = false,
  badgeTheme: BadgeTheme = DEFAULT_BADGE_THEME
): ResolvedTagStyle {
  const cleanTag = (tag || '').toLowerCase().trim();
  const effectiveDef =
    definition ||
    CORE_TAG_PROTOTYPES[cleanTag] ||
    CORE_TAG_PROTOTYPES.custom;

  const baseColor = effectiveDef.color || '#6F7880';
  const styleRules = effectiveDef.styleRules || [];

  // Find first matching attribute rule
  let matchedRule: AttributeStyleRule | undefined;
  if (token && styleRules.length > 0) {
    for (const rule of styleRules) {
      if (matchesAttributeRule(rule, token)) {
        matchedRule = rule;
        break;
      }
    }
  }

  // Determine active ink color
  let activeColor = baseColor;
  if (matchedRule?.color) {
    activeColor = matchedRule.color;
  } else if (token && typeof token.attributes?.color === 'string') {
    activeColor = token.attributes.color;
  }

  // Determine active color style:
  // Default to rule.colorStyle if specified; otherwise inherit global badgeTheme
  const effectiveColorStyle =
    matchedRule?.colorStyle ||
    (badgeTheme === 'wash' ? 'dark_on_light' : 'light_on_dark');

  let textColor: string;
  let bgColor: string;
  let bulletColor: string;

  if (effectiveColorStyle === 'dark_on_light') {
    // Wash / tint style: dark pencil text over soft translucent ink wash
    bgColor =
      matchedRule?.bgColor ||
      (isResolved ? getWashResolvedBgColor(activeColor) : getWashBgColor(activeColor));
    textColor = isResolved ? getWashResolvedTextColor(activeColor) : '#2B2C30';
    bulletColor = isResolved ? getResolvedAccentColor(activeColor) : activeColor;
  } else {
    // Light on dark (solid): white/contrasting text on colored ink pill
    bgColor =
      matchedRule?.bgColor ||
      (isResolved ? getSolidResolvedBgColor(activeColor) : activeColor);
    textColor = getContrastingTextColor(bgColor);
    bulletColor = textColor === '#FFFFFF' ? '#FFFFFF' : '#2B2C30';
  }

  const isBold = Boolean(matchedRule?.bold ?? (effectiveDef as TagTypeDefinition).makesBold);
  const isItalic = Boolean(matchedRule?.italic);
  const isDim = Boolean(isResolved || matchedRule?.dim || (effectiveDef as TagTypeDefinition).dimsText);
  const isStrikethrough = Boolean(isResolved || matchedRule?.strikethrough);
  // Disabled animation if note is resolved (struck notes rest still)
  const animatedStyle: AnimatedStyle = isResolved
    ? 'none'
    : (matchedRule?.animatedStyle || 'none');

  return {
    tag: cleanTag,
    color: activeColor,
    textColor,
    bgColor,
    bulletColor,
    isBold,
    isItalic,
    isDim,
    isStrikethrough,
    animatedStyle,
    matchedRule,
  };
}
