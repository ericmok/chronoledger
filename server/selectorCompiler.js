/**
 * Tag Selector Query Compiler & Execution Engine
 *
 * Compiles Trilium-style structured tag selector expressions into single-pass,
 * parameterized SQLite set queries using INTERSECT, UNION, and EXCEPT against
 * the `note_attributes` sidecar table and `notes` table.
 *
 * Supported Syntax:
 * - Exact Tag: `@todo`, `@wait`
 * - Wildcard Tag: `@*`, `@*[color="#F47290"]`, `@*[status=open]`
 * - Attribute Key-Value: `@todo[status=wip]`, `@task[priority=1]`
 * - Numerical Comparisons: `@todo[priority <= 2]`, `@metric[count > 10]`
 * - Inequality: `@todo[status != done]`
 * - Multi-Value / Positional: `@project[apollo]`, `@project[apollo, moon]`
 * - Relational Backlinks: `@wait[ref=note_123]`, `@*[ref=*]`
 * - Negation: `!@todo`, `!@todo[status=done]`
 * - Logical Conjunction: `AND`, `,`, or space-separated terms
 * - Logical Disjunction: `OR` or `;`
 */

import { formatUnifiedNote } from './db.js';

const MAX_SELECTOR_LENGTH = 1000;
const MAX_TERMS = 50;
const VALID_OPERATORS = ['<=', '>=', '!=', '=', '<', '>'];
const RELATION_KEYS = new Set(['ref', 'target', 'by', 'blocker', 'link']);

/**
 * Strips enclosing single or double quotes.
 */
function unquote(str) {
  if (!str) return '';
  const s = str.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Splits string by delimiter, respecting quoted substrings.
 */
function splitRespectingQuotes(input, delimiter) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if ((ch === '"' || ch === "'") && (i === 0 || input[i - 1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = ch;
      } else if (ch === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      }
      current += ch;
      continue;
    }

    if (!inQuotes) {
      if (typeof delimiter === 'string' && input.startsWith(delimiter, i)) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        i += delimiter.length - 1;
        continue;
      }
    }

    current += ch;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

/**
 * Parses bracket condition content (e.g. `status=wip, priority<=2`).
 */
function parseBracketConditions(bracketStr) {
  if (!bracketStr || !bracketStr.trim()) return [];

  const rawConditions = splitRespectingQuotes(bracketStr, ',');
  const conditions = [];

  for (const raw of rawConditions) {
    const item = raw.trim();
    if (!item) continue;

    let matchedOp = null;
    let opIdx = -1;

    for (const op of VALID_OPERATORS) {
      const idx = item.indexOf(op);
      if (idx > 0) {
        matchedOp = op;
        opIdx = idx;
        break;
      }
    }

    if (matchedOp) {
      const key = item.slice(0, opIdx).trim().toLowerCase();
      const rawVal = item.slice(opIdx + matchedOp.length).trim();
      const val = unquote(rawVal);

      if (!key) continue;

      if (val === '*') {
        conditions.push({ type: 'presence', key });
      } else {
        const isNum = !isNaN(Number(val)) && val !== '' && typeof val !== 'boolean';
        conditions.push({
          type: isNum && ['<', '>', '<=', '>='].includes(matchedOp) ? 'num' : 'kv',
          key,
          op: matchedOp,
          value: isNum ? Number(val) : val,
        });
      }
    } else {
      // Positional value or boolean flag
      const val = unquote(item);
      if (val) {
        conditions.push({ type: 'pos', value: val });
      }
    }
  }

  return conditions;
}

/**
 * Parses a single predicate term (e.g. `@todo[status=wip]`, `!@project[mars]`, `@*`).
 */
function parseTerm(rawTerm) {
  let s = rawTerm.trim();
  if (!s) return null;

  let isNegated = false;
  if (s.startsWith('!')) {
    isNegated = true;
    s = s.slice(1).trim();
  } else if (/^not\s+/i.test(s)) {
    isNegated = true;
    s = s.replace(/^not\s+/i, '').trim();
  }

  const match = /^@?([a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+|\*)(\[(.*)\])?$/.exec(s);
  if (!match) return null;

  const tag = match[1].toLowerCase();
  const bracketContent = match[3];
  const conditions = bracketContent !== undefined ? parseBracketConditions(bracketContent) : [];

  return {
    isNegated,
    tag,
    isWildcardTag: tag === '*',
    conditions,
  };
}

/**
 * Tokenizes a selector into Disjunctive Normal Form (OR branches of AND terms).
 */
export function parseSelectorToAst(selectorStr) {
  if (typeof selectorStr !== 'string') return [];
  const trimmed = selectorStr.trim();
  if (!trimmed) return [];

  if (trimmed.length > MAX_SELECTOR_LENGTH) {
    throw new Error(`Selector query exceeds maximum allowed length of ${MAX_SELECTOR_LENGTH} characters`);
  }

  // 1. Split top-level by OR (or ';')
  // We first replace top-level ' OR ' with ';' so we can split cleanly
  const normalizedOr = trimmed.replace(/\s+OR\s+/gi, ';');
  const orChunks = splitRespectingQuotes(normalizedOr, ';');

  let totalTerms = 0;
  const astOrBranches = [];

  for (const chunk of orChunks) {
    if (!chunk.trim()) continue;

    // 2. Split chunk by AND (or space between tags)
    // Normalize ' AND ' and ',' outside brackets
    let inBracket = false;
    let inQuotes = false;
    let quoteChar = '';
    let normalizedAnd = '';

    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if ((ch === '"' || ch === "'") && (i === 0 || chunk[i - 1] !== '\\')) {
        if (!inQuotes) {
          inQuotes = true;
          quoteChar = ch;
        } else if (ch === quoteChar) {
          inQuotes = false;
          quoteChar = '';
        }
        normalizedAnd += ch;
        continue;
      }

      if (!inQuotes) {
        if (ch === '[') inBracket = true;
        else if (ch === ']') inBracket = false;

        if (!inBracket && ch === ',') {
          normalizedAnd += ' AND ';
          continue;
        }
      }

      normalizedAnd += ch;
    }

    // Split on ' AND ' or space preceding an @ or !
    const andChunks = splitRespectingQuotes(normalizedAnd, ' AND ');
    const branchTerms = [];

    for (const ac of andChunks) {
      // Split on space between tags while preserving bracket contents
      const subTerms = ac.match(/(!?@(?:\*|[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+)(?:\[[^\]]*\])?|!?\b[a-zA-Z0-9_\u00C0-\u024F\u1E00-\u1EFF-]+(?:\[[^\]]*\])?)/g) || [ac];
      for (const st of subTerms) {
        const parsed = parseTerm(st);
        if (parsed) {
          totalTerms++;
          if (totalTerms > MAX_TERMS) {
            throw new Error(`Selector query exceeds maximum allowed complexity limit of ${MAX_TERMS} terms`);
          }
          branchTerms.push(parsed);
        }
      }
    }

    if (branchTerms.length > 0) {
      astOrBranches.push(branchTerms);
    }
  }

  return astOrBranches;
}

/**
 * Compiles a single condition on a tag instance into SQL clauses and params.
 */
function compileConditionSql(cond, tag, isWildcardTag, effectiveUserId, needTagInstanceId = false) {
  const params = [effectiveUserId];
  let sql = needTagInstanceId ? 'SELECT note_id, tag_instance_id FROM note_attributes WHERE user_id = ?' : 'SELECT note_id FROM note_attributes WHERE user_id = ?';

  if (!isWildcardTag) {
    sql += ' AND tag_name = ?';
    params.push(tag);
  }

  if (cond.type === 'presence') {
    if (RELATION_KEYS.has(cond.key)) {
      sql += ' AND is_relation = 1';
    } else {
      sql += ' AND attr_key = ? AND attr_value IS NOT NULL';
      params.push(cond.key);
    }
  } else if (cond.type === 'num') {
    sql += ` AND attr_key = ? AND num_value ${cond.op} ?`;
    params.push(cond.key, cond.value);
  } else if (cond.type === 'kv') {
    if (cond.op === '!=') {
      sql += ' AND attr_key = ? AND attr_value != ?';
      params.push(cond.key, String(cond.value));
    } else {
      sql += ' AND attr_key = ? AND attr_value = ?';
      params.push(cond.key, String(cond.value));
    }
  } else if (cond.type === 'pos') {
    sql += ' AND ((attr_key = ? AND attr_value = ?) OR (attr_key = ? AND attr_value = ?))';
    params.push('__val__', String(cond.value), String(cond.value).toLowerCase(), 'true');
  }

  return { sql, params };
}

/**
 * Compiles an individual positive or negated term into a SQL subquery returning note_id.
 */
function compileTermSubquery(term, effectiveUserId) {
  const { tag, isWildcardTag, conditions } = term;

  // Case A: No bracket conditions (e.g. `@todo` or `@*`)
  if (!conditions || conditions.length === 0) {
    if (isWildcardTag) {
      return {
        sql: 'SELECT note_id FROM note_attributes WHERE user_id = ? AND attr_key = ?',
        params: [effectiveUserId, '__tag__'],
      };
    }
    return {
      sql: 'SELECT note_id FROM note_attributes WHERE user_id = ? AND tag_name = ? AND attr_key = ?',
      params: [effectiveUserId, tag, '__tag__'],
    };
  }

  // Case B: Single condition inside brackets (e.g. `@todo[status=wip]`, `@*[color=red]`)
  if (conditions.length === 1) {
    return compileConditionSql(conditions[0], tag, isWildcardTag, effectiveUserId, false);
  }

  // Case C: Multiple conditions inside the same bracket (e.g. `@todo[status=wip, priority<=2]`)
  // Must bind to the same tag_instance_id via INTERSECT
  const subqueries = [];
  const params = [];

  for (const cond of conditions) {
    const compiled = compileConditionSql(cond, tag, isWildcardTag, effectiveUserId, true);
    subqueries.push(compiled.sql);
    params.push(...compiled.params);
  }

  return {
    sql: `SELECT note_id FROM (\n      ${subqueries.join('\n      INTERSECT\n      ')}\n    )`,
    params,
  };
}

/**
 * Compiles a full selector query string into a parameterized SQL subquery.
 *
 * @param {string} selectorStr
 * @param {string|null} userId
 * @returns {{ sql: string | null, params: any[], isEmpty: boolean, ast: any[] }}
 */
export function compileSelectorQuery(selectorStr, userId = null) {
  const effectiveUserId = userId || '__guest__';
  const hasInput = typeof selectorStr === 'string' && selectorStr.trim().length > 0;
  const ast = parseSelectorToAst(selectorStr);

  if (!ast || ast.length === 0) {
    if (hasInput) {
      // Non-empty selector that contained 0 valid tags/predicates (e.g. '][' or '???')
      return {
        sql: 'SELECT NULL WHERE 1=0',
        params: [],
        isEmpty: false,
        noValidTerms: true,
        ast: [],
      };
    }
    return {
      sql: null,
      params: [],
      isEmpty: true,
      ast: [],
    };
  }

  const orBranchesSql = [];
  const allParams = [];

  for (const branch of ast) {
    const positiveTerms = branch.filter((t) => !t.isNegated);
    const negatedTerms = branch.filter((t) => t.isNegated);

    let branchSql = '';
    const branchParams = [];

    // 1. Build positive intersection
    if (positiveTerms.length > 0) {
      const posSubqueries = [];
      for (const pt of positiveTerms) {
        const compiled = compileTermSubquery(pt, effectiveUserId);
        posSubqueries.push(compiled.sql);
        branchParams.push(...compiled.params);
      }
      branchSql = posSubqueries.length === 1
        ? posSubqueries[0]
        : posSubqueries.join('\n        INTERSECT\n        ');
    } else {
      // Standalone negation: Universe is all notes belonging to this user
      branchSql = 'SELECT id AS note_id FROM notes WHERE (user_id = ? OR (user_id IS NULL AND ? = ?))';
      branchParams.push(effectiveUserId, effectiveUserId, '__guest__');
    }

    // 2. Apply negative subtraction using EXCEPT
    if (negatedTerms.length > 0) {
      const negSubqueries = [];
      for (const nt of negatedTerms) {
        const compiled = compileTermSubquery(nt, effectiveUserId);
        negSubqueries.push(compiled.sql);
        branchParams.push(...compiled.params);
      }

      const combinedNeg = negSubqueries.length === 1
        ? negSubqueries[0]
        : `SELECT note_id FROM (\n          ${negSubqueries.join('\n          UNION\n          ')}\n        )`;

      branchSql = `${branchSql}\n        EXCEPT\n        ${combinedNeg}`;
    }

    orBranchesSql.push(branchSql);
    allParams.push(...branchParams);
  }

  // Combine OR branches with UNION
  let finalSql = '';
  if (orBranchesSql.length === 1) {
    finalSql = orBranchesSql[0];
  } else {
    finalSql = orBranchesSql
      .map((bs) => `SELECT note_id FROM (\n      ${bs}\n    )`)
      .join('\n    UNION\n    ');
  }

  return {
    sql: finalSql,
    params: allParams,
    isEmpty: false,
    ast,
  };
}

/**
 * Executes a selector search query against SQLite, supporting scope, date, and text filters.
 */
export function executeSelectorSearch(db, selectorStr, userId = null, options = {}) {
  const effectiveUserId = userId || '__guest__';
  const compiled = compileSelectorQuery(selectorStr, effectiveUserId);

  const scope = options.scope || 'all';
  const date = options.date;
  const startDate = options.startDate;
  const endDate = options.endDate;
  const text = options.text;
  const parsedLimit = parseInt(options.limit, 10);
  const limit = Math.max(1, Math.min(500, Number.isFinite(parsedLimit) ? parsedLimit : 50));
  const parsedOffset = parseInt(options.offset, 10);
  const offset = Math.max(0, Number.isFinite(parsedOffset) ? parsedOffset : 0);

  let query = 'SELECT * FROM notes WHERE 1=1';
  const queryParams = [];

  // Tenant scoping on outer notes query
  if (userId) {
    query += ' AND user_id = ?';
    queryParams.push(userId);
  } else {
    query += " AND (user_id IS NULL OR user_id = '__guest__')";
  }

  // Apply selector subquery constraint
  if (!compiled.isEmpty && compiled.sql) {
    query += ` AND id IN (\n    ${compiled.sql}\n  )`;
    queryParams.push(...compiled.params);
  }

  // Scope filter
  if (scope && scope !== 'all') {
    query += ' AND scope = ?';
    queryParams.push(scope);
  }

  // Fulltext / content match
  if (text && typeof text === 'string' && text.trim()) {
    query += ' AND content LIKE ?';
    queryParams.push(`%${text.trim()}%`);
  }

  // Ordering
  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...queryParams);
  let results = rows.map(formatUnifiedNote);

  // In-memory date / range filtering (for targets arrays)
  if (date || startDate || endDate) {
    results = results.filter((note) => {
      if (date) {
        if (note.scope === 'day' && !note.targets.includes(date)) return false;
        if (note.scope !== 'day' && scope !== 'all') return false;
      } else if (startDate || endDate) {
        if (note.scope === 'day') {
          const inRange = note.targets.some((d) => {
            if (startDate && d < startDate) return false;
            if (endDate && d > endDate) return false;
            return true;
          });
          if (!inRange) return false;
        } else if (scope !== 'all') {
          return false;
        }
      }
      return true;
    });
  }

  const total = results.length;
  const paged = results.slice(offset, offset + limit);

  return {
    total,
    limit,
    offset,
    notes: paged,
    compiledSql: compiled.sql,
  };
}
