import { useState, useCallback } from 'react';

/**
 * Hook for managing annotation autocomplete inputs, cursor-tracking,
 * and backslash-escape detection.
 *
 * - Detects active `@query` when typing after a valid word/start boundary.
 * - Suppresses the autocomplete dropdown if the `@` is preceded by an odd number
 *   of backslashes (e.g. `\@` or `\\\@`), respecting manual escaping.
 * - When selecting a suggestion, only replaces the last unescaped `@` trigger.
 */
export function useAnnotationInput(
  value: string,
  setValue: (val: string) => void
) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursorPos, setCursorPos] = useState(0);

  /**
   * Tracks text and cursor position, opening autocomplete only for unescaped `@` triggers.
   */
  const updateCursor = useCallback((text: string, cursor: number) => {
    setCursorPos(cursor);
    const before = text.slice(0, cursor);
    const atMatch = before.match(/@([a-zA-Z0-9:-]*)$/);
    if (atMatch) {
      const atIdx = before.length - atMatch[0].length;
      let backslashCount = 0;
      let k = atIdx;
      while (k > 0 && before[k - 1] === '\\') {
        backslashCount++;
        k--;
      }
      const isAtStart = k === 0;
      const isPrecededByBoundary = isAtStart || /[\s([{"'`]/.test(before[k - 1]);

      // Only open autocomplete if boundary is valid and @ is not escaped (even count of backslashes)
      if (isPrecededByBoundary && backslashCount % 2 === 0) {
        setIsOpen(true);
        setQuery(atMatch[1]);
        return;
      }
    }
    setIsOpen(false);
  }, []);

  const selectTag = useCallback(
    (tag: string) => {
      const before = value.slice(0, cursorPos);
      const after = value.slice(cursorPos);

      // Find the last UNESCAPED '@' before cursorPos
      let atIndex = -1;
      for (let i = before.length - 1; i >= 0; i--) {
        if (before[i] === '@') {
          let count = 0;
          let k = i;
          while (k > 0 && before[k - 1] === '\\') {
            count++;
            k--;
          }
          if (count % 2 === 0) {
            atIndex = i;
            break;
          }
        }
      }

      if (atIndex !== -1) {
        const newText = before.slice(0, atIndex) + `@${tag} ` + after;
        setValue(newText);
      } else {
        setValue(value + ` @${tag} `);
      }
      setIsOpen(false);
    },
    [value, cursorPos, setValue]
  );

  const insertTagDirectly = useCallback(
    (tag: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setValue(`@${tag} `);
      } else {
        setValue(`${trimmed} @${tag} `);
      }
    },
    [value, setValue]
  );

  return {
    isOpen,
    query,
    updateCursor,
    selectTag,
    insertTagDirectly,
    close: () => setIsOpen(false),
  };
}
