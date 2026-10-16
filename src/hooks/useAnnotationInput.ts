import { useState, useCallback } from 'react';

export function useAnnotationInput(
  value: string,
  setValue: (val: string) => void
) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursorPos, setCursorPos] = useState(0);

  const updateCursor = useCallback((text: string, cursor: number) => {
    setCursorPos(cursor);
    const before = text.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([a-zA-Z0-9:-]*)$/);
    if (match) {
      setIsOpen(true);
      setQuery(match[1]);
    } else {
      setIsOpen(false);
    }
  }, []);

  const selectTag = useCallback(
    (tag: string) => {
      const before = value.slice(0, cursorPos);
      const after = value.slice(cursorPos);
      const atIndex = before.lastIndexOf('@');
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
