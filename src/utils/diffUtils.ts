/**
 * Word-level diff utility for analog calendar ledger revisions.
 * Computes difference between original text and updated text.
 * Deleted words are struck out with red ink; added words are styled in green ink.
 */

export interface DiffChunk {
  type: 'unchanged' | 'deleted' | 'added';
  value: string;
}

/**
 * Strips markdown strikethrough resolution markers (`~~`) from a tag token for semantic equivalence.
 * e.g. `~~@todo~~` -> `@todo`
 */
function stripTagResolution(token: string): string {
  if (!token) return '';
  const match = token.match(/^(?:~~)?(@[a-zA-Z0-9]+(?:[:.-][a-zA-Z0-9]+)*(?:[ap]m)?)(?:~~)?$/i);
  return match ? match[1].toLowerCase() : token;
}

/**
 * Compares two tokens for equality.
 * Tags with differing resolution status (e.g. `@todo` vs `~~@todo~~`) are treated as equivalent.
 */
function areTokensEquivalent(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  const s1 = stripTagResolution(t1);
  const s2 = stripTagResolution(t2);
  if (s1.startsWith('@') && s2.startsWith('@')) {
    return s1 === s2;
  }
  return false;
}

/**
 * Tokenize string into words, tags, whitespace, and punctuation tokens.
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  // Isolates tags (with optional resolution markers), whitespace sequences, or other non-whitespace runs
  return text.match(/(?:~~)?@[a-zA-Z0-9]+(?:[:.-][a-zA-Z0-9]+)*(?:[ap]m)?(?:~~)?|\s+|[^\s]+/gi) || [];
}

/**
 * Computes word-level diff between original and updated strings using Longest Common Subsequence (LCS).
 */
export function computeWordDiff(oldText: string, newText: string): DiffChunk[] {
  if (oldText === newText) {
    return [{ type: 'unchanged', value: newText }];
  }

  const oldTokens = tokenize(oldText);
  const newTokens = tokenize(newText);

  const m = oldTokens.length;
  const n = newTokens.length;

  // Build LCS matrix
  // dp[i][j] stores length of LCS of oldTokens[0..i-1] and newTokens[0..j-1]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (areTokensEquivalent(oldTokens[i - 1], newTokens[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to assemble diff chunks
  const rawChunks: DiffChunk[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && areTokensEquivalent(oldTokens[i - 1], newTokens[j - 1])) {
      // Preserve newTokens[j - 1] so current tag resolution state is shown in unchanged chunk
      rawChunks.push({ type: 'unchanged', value: newTokens[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawChunks.push({ type: 'added', value: newTokens[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i - 1][j] > dp[i][j - 1])) {
      rawChunks.push({ type: 'deleted', value: oldTokens[i - 1] });
      i--;
    }
  }

  rawChunks.reverse();

  // Merge consecutive chunks of the same type for clean rendering
  const merged: DiffChunk[] = [];
  for (const chunk of rawChunks) {
    if (merged.length > 0 && merged[merged.length - 1].type === chunk.type) {
      merged[merged.length - 1].value += chunk.value;
    } else {
      merged.push({ ...chunk });
    }
  }

  return merged;
}
