/**
 * Client-Side Tag Selector & Full-Text Matcher
 *
 * Provides instantaneous (<1ms), offline-resilient filtering of in-memory notes
 * against Trilium-style tag selector expressions and fulltext search terms.
 *
 * Examples:
 * - `@todo` -> matches any note with @todo
 * - `@todo[status=wip]` -> matches @todo with status=wip
 * - `@project[apollo]` -> matches @project with positional value "apollo"
 * - `@todo[priority <= 2]` -> numerical comparison
 * - `!@todo` -> notes without @todo
 * - `@*` -> notes with any tag
 * - `lunar module` -> plain text search
 */

import { parseTagTokens, type ParsedTagToken } from './tagParser.ts';

export interface SelectorTerm {
  tag: string;
  isWildcard: boolean;
  isNegated: boolean;
  conditions: Array<{
    key?: string;
    op: string;
    val: string | number;
    isPresence?: boolean;
    isPositional?: boolean;
  }>;
}

/**
 * Parses a simple selector string into terms.
 */
export function parseClientSelector(selector: string): { terms: SelectorTerm[]; plainText: string } {
  const trimmed = selector.trim();
  if (!trimmed) return { terms: [], plainText: '' };

  const terms: SelectorTerm[] = [];
  const plainWords: string[] = [];

  // Match tags like @todo, @todo[status=wip], !@memo, or plain words
  const tokenRegex = /(!?@(?:\*|[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+)(?:\[[^\]]*\])?|\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(trimmed)) !== null) {
    const raw = match[1];
    if (raw.toUpperCase() === 'AND' || raw === ',') continue;

    if (raw.startsWith('@') || raw.startsWith('!@')) {
      const isNegated = raw.startsWith('!');
      const clean = isNegated ? raw.slice(1) : raw;
      const bracketIdx = clean.indexOf('[');

      let tagName = '';
      let bracketContent = '';

      if (bracketIdx !== -1 && clean.endsWith(']')) {
        tagName = clean.slice(1, bracketIdx).toLowerCase();
        bracketContent = clean.slice(bracketIdx + 1, -1);
      } else {
        tagName = clean.slice(1).toLowerCase();
      }

      const conditions: SelectorTerm['conditions'] = [];

      if (bracketContent) {
        const parts = bracketContent.split(',').map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          const ops = ['<=', '>=', '!=', '=', '<', '>'];
          let matchedOp: string | null = null;
          let opIdx = -1;

          for (const op of ops) {
            const idx = p.indexOf(op);
            if (idx > 0) {
              matchedOp = op;
              opIdx = idx;
              break;
            }
          }

          if (matchedOp && opIdx > 0) {
            const k = p.slice(0, opIdx).trim().toLowerCase();
            let v = p.slice(opIdx + matchedOp.length).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (v === '*') {
              conditions.push({ key: k, op: '=', val: '*', isPresence: true });
            } else if (!isNaN(Number(v)) && v !== '') {
              conditions.push({ key: k, op: matchedOp, val: Number(v) });
            } else {
              conditions.push({ key: k, op: matchedOp, val: v.toLowerCase() });
            }
          } else {
            // Positional or flag
            let v = p;
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            conditions.push({ op: '=', val: v.toLowerCase(), isPositional: true });
          }
        }
      }

      terms.push({
        tag: tagName,
        isWildcard: tagName === '*',
        isNegated,
        conditions,
      });
    } else {
      plainWords.push(raw.toLowerCase());
    }
  }

  return { terms, plainText: plainWords.join(' ') };
}

/**
 * Evaluates whether a note matches the selector and plain-text query.
 */
export function matchesSelector(
  content: string,
  isStruck: boolean,
  selector: string
): boolean {
  if (!selector || !selector.trim()) return true;

  const { terms, plainText } = parseClientSelector(selector);

  // Check plain text search
  if (plainText) {
    if (!content.toLowerCase().includes(plainText)) {
      return false;
    }
  }

  if (terms.length === 0) {
    return true;
  }

  const tokens = parseTagTokens(content, isStruck).filter((t) => !t.isEscaped);

  for (const term of terms) {
    let termMatched = false;

    if (term.isWildcard) {
      if (term.conditions.length === 0) {
        termMatched = tokens.length > 0;
      } else {
        // Any token satisfying all conditions
        termMatched = tokens.some((token) => matchesAllConditions(token, term.conditions));
      }
    } else {
      const matchingTokens = tokens.filter((t) => t.tag.toLowerCase() === term.tag);
      if (matchingTokens.length > 0) {
        if (term.conditions.length === 0) {
          termMatched = true;
        } else {
          termMatched = matchingTokens.some((token) => matchesAllConditions(token, term.conditions));
        }
      }
    }

    if (term.isNegated) {
      if (termMatched) return false;
    } else {
      if (!termMatched) return false;
    }
  }

  return true;
}

function matchesAllConditions(
  token: ParsedTagToken,
  conditions: SelectorTerm['conditions']
): boolean {
  for (const cond of conditions) {
    if (cond.isPositional) {
      const posVals = (token.positionalValues || []).map((v) => v.toLowerCase());
      const hasPos = posVals.includes(String(cond.val).toLowerCase());
      const hasAttr = token.attributes[String(cond.val).toLowerCase()] !== undefined;
      if (!hasPos && !hasAttr) return false;
    } else if (cond.isPresence) {
      if (cond.key && token.attributes[cond.key] === undefined) {
        const hasRel = (token.relations || []).some((r) => r.key === cond.key);
        if (!hasRel) return false;
      }
    } else if (cond.key) {
      const attrVal = token.attributes[cond.key];
      if (attrVal === undefined) {
        // Check relations
        const rel = (token.relations || []).find((r) => r.key === cond.key);
        if (rel && cond.op === '=' && rel.targetNoteId.toLowerCase() === String(cond.val).toLowerCase()) {
          continue;
        }
        return false;
      }

      if (typeof cond.val === 'number' && typeof attrVal === 'number') {
        if (cond.op === '<=' && !(attrVal <= cond.val)) return false;
        if (cond.op === '>=' && !(attrVal >= cond.val)) return false;
        if (cond.op === '<' && !(attrVal < cond.val)) return false;
        if (cond.op === '>' && !(attrVal > cond.val)) return false;
        if (cond.op === '!=' && !(attrVal !== cond.val)) return false;
        if (cond.op === '=' && !(attrVal === cond.val)) return false;
      } else {
        const sVal = String(attrVal).toLowerCase();
        const target = String(cond.val).toLowerCase();
        if (cond.op === '!=' && sVal === target) return false;
        if (cond.op === '=' && sVal !== target) return false;
      }
    }
  }

  return true;
}
