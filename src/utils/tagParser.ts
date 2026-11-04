/**
 * ChronoLedger Tag & Attribute AST Lexer & Parser
 *
 * Implements tokenization, bracket attribute parsing, CommonMark backslash
 * escaping, resolution state detection, and prototype resolution for notes.
 */

import {
  getTagPrototype,
  type TagTypeDefinition,
} from './tagPrototypes.ts';

export interface TagRelation {
  key: string;
  targetNoteId: string;
}

export interface ParsedTagToken {
  /** The full exact string matched, e.g. "@todo[urgent, priority=1]" or "~~@todo~~" */
  raw: string;
  /** The root tag identifier (normalized to lowercase), e.g. "todo" */
  tag: string;
  /** The exact tag text typed before bracket, preserving original case (e.g. "4:00pm", "Todo") */
  tagBody: string;
  /** Unique token instance ID within the note (e.g. "ti_0_todo") */
  instanceId: string;
  /** Positional elements within brackets that have no "=", e.g. ["housing", "portfolio"] */
  positionalValues: string[];
  /** Structured key-value properties and boolean flags, e.g. { urgent: true, priority: 1 } */
  attributes: Record<string, string | number | boolean>;
  /** Relational references to other note IDs, e.g. [{ key: "ref", targetNoteId: "note_123" }] */
  relations: TagRelation[];
  /** True if wrapped in ~~...~~, has [resolved], or noteIsStruck is true */
  isResolved: boolean;
  /** True if preceded by an odd number of backslashes (\@tag) */
  isEscaped: boolean;
  /** Character offset where the tag token begins in the content */
  startIndex: number;
  /** Character offset where the tag token ends in the content */
  endIndex: number;
}

/**
 * Parses the interior of bracket attributes: e.g. "status=wip, priority=1, urgent"
 * Handles quoted strings with spaces, escaped quotes, embedded commas, and equals signs.
 */
export function parseBracketAttributes(bracketContent: string): {
  positionalValues: string[];
  attributes: Record<string, string | number | boolean>;
  relations: TagRelation[];
  hasResolvedFlag: boolean;
} {
  const positionalValues: string[] = [];
  const attributes: Record<string, string | number | boolean> = {};
  const relations: TagRelation[] = [];
  let hasResolvedFlag = false;

  if (!bracketContent || !bracketContent.trim()) {
    return { positionalValues, attributes, relations, hasResolvedFlag };
  }

  // Tokenize by comma, respecting quotes and backslash escapes
  const rawItems: string[] = [];
  let current = '';
  let inQuotes: boolean | string = false; // false, '"', or "'"

  for (let i = 0; i < bracketContent.length; i++) {
    const ch = bracketContent[i];

    if (ch === '\\' && i + 1 < bracketContent.length) {
      current += ch + bracketContent[i + 1];
      i++;
      continue;
    }

    if ((ch === '"' || ch === "'") && !inQuotes) {
      inQuotes = ch;
      current += ch;
      continue;
    }

    if (ch === inQuotes) {
      inQuotes = false;
      current += ch;
      continue;
    }

    if (ch === ',' && !inQuotes) {
      rawItems.push(current);
      current = '';
      continue;
    }

    current += ch;
  }
  if (current.length > 0) {
    rawItems.push(current);
  }

  // Helper to unquote strings and unescape quotes
  const unquote = (val: string): string => {
    val = val.trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    return val.replace(/\\(["'\\])/g, '$1');
  };

  for (let item of rawItems) {
    item = item.trim();
    if (!item) continue;

    const firstEq = item.indexOf('=');

    if (firstEq === -1) {
      // Positional value / boolean flag
      const unquoted = unquote(item);
      if (!unquoted) continue;

      positionalValues.push(unquoted);
      attributes[unquoted] = true;

      if (unquoted.toLowerCase() === 'resolved') {
        hasResolvedFlag = true;
      }
    } else {
      // Key-Value pair
      const key = item.slice(0, firstEq).trim().toLowerCase();
      const rawVal = item.slice(firstEq + 1).trim();
      const valStr = unquote(rawVal);

      if (!key) continue;

      let typedVal: string | number | boolean = valStr;
      if (valStr.toLowerCase() === 'true') {
        typedVal = true;
      } else if (valStr.toLowerCase() === 'false') {
        typedVal = false;
      } else if (!isNaN(Number(valStr)) && valStr !== '') {
        typedVal = Number(valStr);
      }

      attributes[key] = typedVal;

      if (key.toLowerCase() === 'status') {
        if (['done', 'dropped', 'migrated'].includes(valStr.toLowerCase())) {
          hasResolvedFlag = true;
        }
      }

      if (key.toLowerCase() === 'resolved') {
        if (typedVal === true) {
          hasResolvedFlag = true;
        }
      }

      // Detect relations
      if (['ref', 'target', 'by', 'blocker'].includes(key.toLowerCase()) && typeof typedVal === 'string') {
        relations.push({
          key,
          targetNoteId: typedVal,
        });
      }
    }
  }

  return { positionalValues, attributes, relations, hasResolvedFlag };
}

/**
 * Scans content and extracts all tag tokens, their attributes, and escaping/resolution state.
 */
export function parseTagTokens(content: string, noteIsStruck = false): ParsedTagToken[] {
  if (!content) return [];

  const tokens: ParsedTagToken[] = [];
  // Matches optional strikethrough, @identifier, optional [bracketContent], optional trailing strikethrough
  const tagRegex = /(~~)?@([a-zA-Z0-9_-]+(?:[:.-][a-zA-Z0-9_-]+)*)(?:\[([^\]\r\n]*)\])?(~~)?/gi;

  let match: RegExpExecArray | null;
  let instanceCounter = 0;

  while ((match = tagRegex.exec(content)) !== null) {
    const matchStart = match.index;
    const matchEnd = tagRegex.lastIndex;
    const rawMatch = match[0];
    const isTagStruck = Boolean(match[1] && match[4]);
    const tagBody = match[2];
    const bracketContent = match[3];

    // Count preceding consecutive backslashes immediately before matchStart
    let backslashCount = 0;
    let checkIdx = matchStart;
    while (checkIdx > 0 && content[checkIdx - 1] === '\\') {
      backslashCount++;
      checkIdx--;
    }

    // Boundary check: must be start of string, whitespace, or opening delimiter
    const isAtStart = checkIdx === 0;
    const isPrecededByBoundary = isAtStart || /[\s([{"'`]/.test(content[checkIdx - 1]);

    if (!isPrecededByBoundary) {
      // e.g. user@example.com -> ignored
      continue;
    }

    const isEscaped = backslashCount % 2 === 1;

    // Parse bracket attributes if present
    const parsedBrackets = parseBracketAttributes(bracketContent ?? '');
    const isResolved =
      noteIsStruck ||
      isTagStruck ||
      parsedBrackets.hasResolvedFlag;

    const normalizedTag = tagBody.toLowerCase();
    const instanceId = `ti_${instanceCounter++}_${normalizedTag}`;

    tokens.push({
      raw: rawMatch,
      tag: normalizedTag,
      tagBody,
      instanceId,
      positionalValues: parsedBrackets.positionalValues,
      attributes: parsedBrackets.attributes,
      relations: parsedBrackets.relations,
      isResolved,
      isEscaped,
      startIndex: matchStart,
      endIndex: matchEnd,
    });
  }

  return tokens;
}

/**
 * Merges a ParsedTagToken with its prototype defaults, resolving effective properties.
 */
export function resolveTokenWithPrototype(
  token: ParsedTagToken,
  customPrototypes?: Record<string, TagTypeDefinition>
): {
  color: string;
  notable: boolean;
  makesBold: boolean;
  dimsText: boolean;
  gutterPriority: number;
  isCore: boolean;
} {
  const proto = getTagPrototype(token.tag, customPrototypes);

  // Instance overrides take precedence
  let color = proto.color;
  if (typeof token.attributes.color === 'string') {
    color = token.attributes.color;
  }

  let notable = proto.notable;
  if (token.attributes.notable !== undefined) {
    notable = token.attributes.notable === true || token.attributes.notable === 'true';
  }

  const makesBold = proto.makesBold ?? false;
  const dimsText = proto.dimsText ?? false;
  const gutterPriority = typeof token.attributes.priority === 'number'
    ? token.attributes.priority
    : proto.gutterPriority;

  return {
    color,
    notable,
    makesBold,
    dimsText,
    gutterPriority,
    isCore: proto.isCore,
  };
}
