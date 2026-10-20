import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  Heading1,
  Heading2,
  Bold,
  Italic,
  List,
  CheckSquare,
  Quote,
  Code,
  Link,
  BookOpen,
  Eye,
  PenLine,
  Columns2,
  Check,
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useAnnotationInput } from '../../hooks/useAnnotationInput';
import { AnnotationAutocomplete } from './AnnotationAutocomplete';
import { handleSmartMarkdownKeyDown } from '../../utils/editorUtils';
import { SUGGESTED_TAGS } from '../../utils/annotationUtils';

export interface NoteFolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent: string;
  onSave: (newContent: string) => void;
  title?: string;
  subtitle?: string;
}

export const NoteFolioModal: React.FC<NoteFolioModalProps> = ({
  isOpen,
  onClose,
  initialContent,
  onSave,
  title = 'Note Folio',
  subtitle,
}) => {
  const [content, setContent] = useState(initialContent);
  const [viewMode, setViewMode] = useState<'write' | 'preview' | 'split'>('write');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const annotationInput = useAnnotationInput(content, setContent);

  // Reading metrics
  const metrics = useMemo(() => {
    const trimmed = content.trim();
    if (!trimmed) return { words: 0, characters: 0, paragraphs: 0, readingMinutes: 0 };

    const words = trimmed.split(/\s+/).filter(Boolean).length;
    const characters = trimmed.length;
    const paragraphs = trimmed.split(/\n\s*\n/).filter(Boolean).length;
    const readingMinutes = Math.max(1, Math.ceil(words / 200));

    return { words, characters, paragraphs, readingMinutes };
  }, [content]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(content.trim());
    onClose();
  };

  /**
   * Inserts or wraps markdown syntax around current cursor selection
   */
  const insertSyntax = (prefix: string, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    const selected = content.slice(selectionStart, selectionEnd) || defaultText;
    const replacement = `${prefix}${selected}${suffix}`;
    const nextContent =
      content.slice(0, selectionStart) + replacement + content.slice(selectionEnd);

    setContent(nextContent);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = selectionStart + prefix.length;
      textarea.selectionEnd = selectionStart + prefix.length + selected.length;
    }, 0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4 md:p-6 animate-in fade-in duration-150">
      <div className="relative w-full max-w-4xl h-[90vh] max-h-[850px] bg-[#FAF8F5] border border-[#DDD6C8] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#E5DFD5] bg-[#FAF8F5]/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#EAE3D6] flex items-center justify-center text-[#2B2C30] shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-serif text-base sm:text-lg font-bold text-[#2B2C30] truncate leading-tight">
                {title}
              </h2>
              {subtitle && (
                <p className="font-mono text-[11px] text-[#8E8F95] truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="hidden sm:flex items-center p-0.5 bg-[#F2EDE4] rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('write')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  viewMode === 'write'
                    ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs'
                    : 'text-[#71727A] hover:text-[#2B2C30]'
                }`}
                title="Editor Mode"
              >
                <PenLine className="w-3.5 h-3.5" />
                <span>Write</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('split')}
                className={`hidden md:flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  viewMode === 'split'
                    ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs'
                    : 'text-[#71727A] hover:text-[#2B2C30]'
                }`}
                title="Split View (Editor & Live Preview)"
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Split</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  viewMode === 'preview'
                    ? 'bg-[#FAF8F5] text-[#2B2C30] font-bold shadow-2xs'
                    : 'text-[#71727A] hover:text-[#2B2C30]'
                }`}
                title="Rendered Preview Mode"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8E8F95] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/60 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Markdown Action Bar */}
        {viewMode !== 'preview' && (
          <div className="px-4 py-1.5 border-b border-[#E5DFD5] bg-[#F7F4EE] flex items-center justify-between gap-2 overflow-x-auto shrink-0 select-none">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => insertSyntax('# ', '', 'Heading')}
                className="p-1 rounded hover:bg-[#EAE3D6] text-[#71727A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                title="Heading 1"
              >
                <Heading1 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertSyntax('## ', '', 'Section')}
                className="p-1 rounded hover:bg-[#EAE3D6] text-[#71727A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                title="Heading 2"
              >
                <Heading2 className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-[#DDD6C8] mx-1" />
              <button
                type="button"
                onClick={() => insertSyntax('**', '**', 'bold text')}
                className="p-1 rounded hover:bg-[#EAE3D6] text-[#71727A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                title="Bold (⌘B)"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertSyntax('*', '*', 'italic text')}
                className="p-1 rounded hover:bg-[#EAE3D6] text-[#71727A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                title="Italic (⌘I)"
              >
                <Italic className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-[#DDD6C8] mx-1" />
              <button
                type="button"
                onClick={() => insertSyntax('- ', '', 'List item')}
                className="p-1 rounded hover:bg-[#EAE3D6] text-[#71727A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                title="Bulleted List"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertSyntax('- [ ] ', '', 'Task item')}
                className="p-1 rounded hover:bg-[#EAE3D6] text-[#71727A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                title="Task Checklist"
              >
                <CheckSquare className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertSyntax('> ', '', 'Quote or reflection')}
                className="p-1 rounded hover:bg-[#EAE3D6] text-[#71727A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                title="Blockquote"
              >
                <Quote className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertSyntax('```ts\n', '\n```', 'code')}
                className="p-1 rounded hover:bg-[#EAE3D6] text-[#71727A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                title="Code Block"
              >
                <Code className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => insertSyntax('[', '](https://)', 'Link title')}
                className="p-1 rounded hover:bg-[#EAE3D6] text-[#71727A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                title="Insert Link"
              >
                <Link className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Tag Insert Dropdown / Helper */}
            <div className="flex items-center gap-1.5 flex-nowrap">
              <span className="text-[10px] font-mono text-[#8E8F95] hidden md:inline">Tags:</span>
              {SUGGESTED_TAGS.slice(0, 4).map((opt) => (
                <button
                  key={opt.tag}
                  type="button"
                  onClick={() => insertSyntax(`${opt.tag} `)}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-[#DDD6C8] bg-white hover:bg-[#FAF8F5] text-[#2B2C30] transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: opt.color }}
                  />
                  <span>{opt.tag}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Writing Canvas / Preview Body */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Editor Column */}
          {viewMode !== 'preview' && (
            <div
              className={`relative flex-1 flex flex-col h-full bg-[#FAF8F5] ${
                viewMode === 'split' ? 'border-r border-[#E5DFD5]' : ''
              }`}
            >
              <textarea
                ref={textareaRef}
                autoFocus
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  annotationInput.updateCursor(e.target.value, e.target.selectionStart || 0);
                }}
                onKeyUp={(e) => {
                  annotationInput.updateCursor(content, (e.target as HTMLTextAreaElement).selectionStart || 0);
                }}
                onClick={(e) => {
                  annotationInput.updateCursor(content, (e.target as HTMLTextAreaElement).selectionStart || 0);
                }}
                onKeyDown={(e) => {
                  handleSmartMarkdownKeyDown(
                    e,
                    content,
                    setContent,
                    handleSave,
                    onClose,
                    annotationInput.isOpen
                  );
                }}
                placeholder="Write your thoughts, daily journal, weekly review, or project plan... supports full markdown and @annotations"
                className="w-full flex-1 p-6 bg-transparent border-0 focus:outline-hidden font-sans text-sm sm:text-base leading-relaxed text-[#2B2C30] placeholder:text-[#A19D94] resize-none overflow-y-auto"
              />

              <AnnotationAutocomplete
                isOpen={annotationInput.isOpen}
                query={annotationInput.query}
                onSelectTag={annotationInput.selectTag}
                onClose={annotationInput.close}
                className="top-12 left-6"
              />
            </div>
          )}

          {/* Rendered Preview Column */}
          {(viewMode === 'preview' || viewMode === 'split') && (
            <div className="flex-1 h-full overflow-y-auto p-6 bg-white/60">
              <div className="max-w-2xl mx-auto">
                <MarkdownRenderer
                  content={content || '*No content yet. Start writing...*'}
                  density="comfortable"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#E5DFD5] bg-[#FAF8F5] flex items-center justify-between gap-4 shrink-0 select-none">
          <div className="flex items-center gap-3 text-[11px] font-mono text-[#8E8F95]">
            <span>{metrics.paragraphs} {metrics.paragraphs === 1 ? 'paragraph' : 'paragraphs'}</span>
            <span>•</span>
            <span>{metrics.words} words</span>
            <span>•</span>
            <span>{metrics.readingMinutes} min read</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#8E8F95] hidden md:inline">
              ⌘↵ to save • Esc to close
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-[#71727A] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/50 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
