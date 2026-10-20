import { marked, type Token, type TokensList } from 'marked';

export interface ParseMarkdownResult {
  tokens: TokensList;
  taskCount: number;
  completedTaskCount: number;
}

/**
 * Parses a markdown string into marked AST tokens with GFM and line-break support.
 */
export function parseMarkdown(content: string): ParseMarkdownResult {
  if (!content) {
    const emptyTokens = marked.lexer('', { gfm: true, breaks: true });
    return { tokens: emptyTokens, taskCount: 0, completedTaskCount: 0 };
  }

  const tokens = marked.lexer(content, { gfm: true, breaks: true });

  let taskCount = 0;
  let completedTaskCount = 0;

  for (const token of tokens) {
    if (token.type === 'list') {
      for (const item of token.items) {
        if (item.task) {
          taskCount++;
          if (item.checked) {
            completedTaskCount++;
          }
        }
      }
    }
  }

  return { tokens, taskCount, completedTaskCount };
}

/**
 * Toggles a task list item ([ ] <-> [x]) by its sequential task occurrence index
 * in the raw markdown content.
 *
 * This guarantees safe in-place replacement even if multiple checklist items
 * share identical text, preserving whitespace, indentation, and list marker style.
 *
 * @param content Raw markdown note content
 * @param targetTaskIndex Zero-based index of the task item among all tasks in the note
 * @returns Updated raw markdown string
 */
export function toggleTaskItemByIndex(content: string, targetTaskIndex: number): string {
  if (!content) return content;

  let currentTaskIdx = 0;
  const lines = content.split('\n');
  // Matches list prefix like "- [ ]", "* [x]", "1. [X]", with any indentation
  const taskRegex = /^(\s*(?:-|\*|\d+\.)\s*\[)([\sxX])(\].*)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(taskRegex);
    if (match) {
      if (currentTaskIdx === targetTaskIndex) {
        const isCurrentlyChecked = match[2].toLowerCase() === 'x';
        const newMarker = isCurrentlyChecked ? ' ' : 'x';
        lines[i] = `${match[1]}${newMarker}${match[3]}`;
        return lines.join('\n');
      }
      currentTaskIdx++;
    }
  }

  return content;
}

/**
 * Estimates the rendered line count of a note to evaluate progressive disclosure folding.
 * Accounts for line breaks, list items, headings, blockquotes, code block lines,
 * and character wrapping (assuming ~55 characters per line in comfortable width).
 */
export function estimateRenderedLines(content: string): number {
  if (!content) return 1;

  const lines = content.split('\n');
  let totalLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      totalLines += 0.5; // blank line spacing
      continue;
    }

    // Code fence delimiters
    if (trimmed.startsWith('```')) {
      totalLines += 1;
      continue;
    }

    // Headings have larger font size, counting as slightly more vertical weight
    if (/^#{1,3}\s/.test(trimmed)) {
      totalLines += 1.3;
      continue;
    }

    // Standard line with potential text wrap
    const wrapLines = Math.max(1, Math.ceil(trimmed.length / 55));
    totalLines += wrapLines;
  }

  return Math.ceil(totalLines);
}

/**
 * Threshold for folding long notes on the calendar timeline.
 * Notes exceeding 5 rendered lines will be folded with a progressive disclosure gradient.
 */
export const PROGRESSIVE_FOLD_LINE_THRESHOLD = 5;

export type { Token, TokensList };
