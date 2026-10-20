import type React from 'react';

/**
 * Handles smart markdown keybindings in textareas:
 * - Cmd/Ctrl + Enter: Calls onSubmit
 * - Escape: Calls onCancel
 * - Enter: Smart list continuation for tasks (- [ ]), bullets (- ), and numbered lists (1. )
 * - Tab / Shift+Tab: Indent / outdent lines by 2 spaces without losing focus
 */
export function handleSmartMarkdownKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  setValue: (val: string) => void,
  onSubmit?: () => void,
  onCancel?: () => void,
  isAutocompleteOpen?: boolean
) {
  if (isAutocompleteOpen && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
    return; // Handled by autocomplete popup
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    onCancel?.();
    return;
  }

  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    onSubmit?.();
    return;
  }

  const textarea = e.currentTarget;
  const { selectionStart, selectionEnd } = textarea;

  // Tab / Shift+Tab indentation
  if (e.key === 'Tab') {
    e.preventDefault();
    if (!e.shiftKey) {
      // Insert 2 spaces at cursor
      const nextVal = value.slice(0, selectionStart) + '  ' + value.slice(selectionEnd);
      setValue(nextVal);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + 2;
      }, 0);
    } else {
      // Outdent current line
      const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
      if (value.slice(lineStart, lineStart + 2) === '  ') {
        const nextVal = value.slice(0, lineStart) + value.slice(lineStart + 2);
        setValue(nextVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = Math.max(lineStart, selectionStart - 2);
        }, 0);
      }
    }
    return;
  }

  // Enter key: Smart list continuation
  if (e.key === 'Enter' && !e.shiftKey) {
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const currentLine = value.slice(lineStart, selectionStart);

    // 1. Task checklist item: e.g. "- [ ] ", "* [x] "
    const taskMatch = currentLine.match(/^(\s*)(?:-|\*|\d+\.)\s*\[[\sxX]\]\s*(.*)$/);
    if (taskMatch) {
      const indent = taskMatch[1];
      const taskBody = taskMatch[2];
      if (taskBody.trim() === '') {
        // Empty task line -> clear task prefix on enter
        e.preventDefault();
        const nextVal = value.slice(0, lineStart) + value.slice(selectionStart);
        setValue(nextVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = lineStart;
        }, 0);
        return;
      }
      e.preventDefault();
      const insert = `\n${indent}- [ ] `;
      const nextVal = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
      setValue(nextVal);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length;
      }, 0);
      return;
    }

    // 2. Unordered bullet: "- ", "* "
    const bulletMatch = currentLine.match(/^(\s*)(?:-|\*)\s+(.*)$/);
    if (bulletMatch) {
      const indent = bulletMatch[1];
      const bulletBody = bulletMatch[2];
      if (bulletBody.trim() === '') {
        // Empty bullet line -> clear bullet on enter
        e.preventDefault();
        const nextVal = value.slice(0, lineStart) + value.slice(selectionStart);
        setValue(nextVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = lineStart;
        }, 0);
        return;
      }
      e.preventDefault();
      const insert = `\n${indent}- `;
      const nextVal = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
      setValue(nextVal);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length;
      }, 0);
      return;
    }

    // 3. Numbered list: "1. ", "2. "
    const numberMatch = currentLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numberMatch) {
      const indent = numberMatch[1];
      const num = parseInt(numberMatch[2], 10);
      const numBody = numberMatch[3];
      if (numBody.trim() === '') {
        // Empty numbered line -> clear number on enter
        e.preventDefault();
        const nextVal = value.slice(0, lineStart) + value.slice(selectionStart);
        setValue(nextVal);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = lineStart;
        }, 0);
        return;
      }
      e.preventDefault();
      const insert = `\n${indent}${num + 1}. `;
      const nextVal = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
      setValue(nextVal);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = selectionStart + insert.length;
      }, 0);
      return;
    }
  }
}

/**
 * Adjusts textarea height automatically based on its content scrollHeight
 * up to a specified maximum height.
 */
export function autoResizeTextarea(
  textarea: HTMLTextAreaElement | null,
  minHeight = 80,
  maxHeight = 360
) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
  textarea.style.height = `${newHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}
