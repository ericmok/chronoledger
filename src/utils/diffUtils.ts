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
 * Tokenize string into words, whitespace, and punctuation tokens.
 */
function tokenize(text: string): string[] {
  if (!text) return [];
  // Matches consecutive non-whitespace characters, or whitespace sequences
  return text.match(/\S+|\s+/g) || [];
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
      if (oldTokens[i - 1] === newTokens[j - 1]) {
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
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      rawChunks.push({ type: 'unchanged', value: oldTokens[i - 1] });
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
