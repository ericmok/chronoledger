import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { formatDateKey, parseDateKey } from '../utils/dateUtils';
import { NOTE_ACCENT_COLORS } from '../types/calendar';
import { useAnnotationInput } from '../hooks/useAnnotationInput';
import { AnnotationAutocomplete } from './common/AnnotationAutocomplete';
import { handleSmartMarkdownKeyDown, autoResizeTextarea } from '../utils/editorUtils';

interface AddNoteModalProps {
  initialDate?: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: string, parentDates: string[], colorTag?: string) => void;
}

export const AddNoteModal: React.FC<AddNoteModalProps> = ({
  initialDate,
  isOpen,
  onClose,
  onSave,
}) => {
  const defaultDate = initialDate || formatDateKey(new Date());
  const [content, setContent] = useState('');
  const [mode, setMode] = useState<'single' | 'contiguous' | 'non-contiguous'>('single');
  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [customDates, setCustomDates] = useState<string[]>([defaultDate]);
  const [newDateInput, setNewDateInput] = useState('');
  const [colorTag, setColorTag] = useState<string | undefined>('#E29578');

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const annotationInput = useAnnotationInput(content, setContent);

  if (!isOpen) return null;

  const handleAddCustomDate = () => {
    if (newDateInput && !customDates.includes(newDateInput)) {
      setCustomDates([...customDates, newDateInput].sort());
      setNewDateInput('');
    }
  };

  const handleRemoveCustomDate = (dateToRemove: string) => {
    if (customDates.length > 1) {
      setCustomDates(customDates.filter((d) => d !== dateToRemove));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    let targetDates: string[] = [];

    if (mode === 'single') {
      targetDates = [startDate];
    } else if (mode === 'contiguous') {
      const d1 = parseDateKey(startDate);
      const d2 = parseDateKey(endDate);
      const start = d1 < d2 ? d1 : d2;
      const end = d1 < d2 ? d2 : d1;

      const current = new Date(start);
      while (current <= end) {
        targetDates.push(formatDateKey(current));
        current.setDate(current.getDate() + 1);
      }
    } else {
      targetDates = customDates.sort();
    }

    onSave(content, targetDates, colorTag);
    setContent('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-[#FAF8F5] border border-[#DDD6C8] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E5DFD5]">
          <h3 className="font-serif text-lg font-semibold text-[#2B2C30]">New Note</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#7E7F85] hover:text-[#2B2C30] hover:bg-[#F2EDE4]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Note content */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-mono text-[#7E7F85] uppercase tracking-wider">
                Note or Task (Markdown)
              </label>
              <span className="text-[10px] font-mono text-[#A19D94]">⌘↵ to save • Enter for newline</span>
            </div>

            <div className="relative">
              <textarea
                autoFocus
                required
                ref={(el) => {
                  textareaRef.current = el;
                  autoResizeTextarea(el, 100, 360);
                }}
                rows={4}
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  autoResizeTextarea(e.target, 100, 360);
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
                    (val) => {
                      setContent(val);
                      setTimeout(() => autoResizeTextarea(textareaRef.current, 100, 360), 0);
                    },
                    () => handleSubmit(e),
                    () => onClose(),
                    annotationInput.isOpen
                  );
                }}
                placeholder="Write note... (e.g. Flight to Tokyo @4:00pm, - [ ] Checklist item, ## Section heading)"
                className="w-full px-3 py-2 text-sm bg-white border border-[#DDD6C8] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#2B2C30]/20 focus:border-[#2B2C30] placeholder-[#BBB6AC] resize-none leading-relaxed"
              />

              <AnnotationAutocomplete
                isOpen={annotationInput.isOpen}
                query={annotationInput.query}
                onSelectTag={annotationInput.selectTag}
                onClose={annotationInput.close}
                className="top-full left-0 mt-1"
              />
            </div>
          </div>

          {/* Span Type Selector */}
          <div>
            <label className="block text-xs font-mono text-[#7E7F85] uppercase tracking-wider mb-1.5">
              Date Attachment
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#F2EDE4] rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`py-1.5 rounded-md transition-all ${
                  mode === 'single' ? 'bg-[#FAF8F5] text-[#2B2C30] shadow-xs' : 'text-[#6B6C72]'
                }`}
              >
                Single Day
              </button>
              <button
                type="button"
                onClick={() => setMode('contiguous')}
                className={`py-1.5 rounded-md transition-all ${
                  mode === 'contiguous' ? 'bg-[#FAF8F5] text-[#2B2C30] shadow-xs' : 'text-[#6B6C72]'
                }`}
              >
                Date Span
              </button>
              <button
                type="button"
                onClick={() => setMode('non-contiguous')}
                className={`py-1.5 rounded-md transition-all ${
                  mode === 'non-contiguous' ? 'bg-[#FAF8F5] text-[#2B2C30] shadow-xs' : 'text-[#6B6C72]'
                }`}
              >
                Multi-Date
              </button>
            </div>
          </div>

          {/* Date controls based on mode */}
          {mode === 'single' && (
            <div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-[#DDD6C8] rounded-md text-[#2B2C30]"
              />
            </div>
          )}

          {mode === 'contiguous' && (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <span className="block text-[10px] font-mono text-[#7E7F85] mb-0.5">Start</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-[#DDD6C8] rounded-md text-[#2B2C30]"
                />
              </div>
              <span className="text-xs text-[#7E7F85] mt-4">→</span>
              <div className="flex-1">
                <span className="block text-[10px] font-mono text-[#7E7F85] mb-0.5">End</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-[#DDD6C8] rounded-md text-[#2B2C30]"
                />
              </div>
            </div>
          )}

          {mode === 'non-contiguous' && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-white border border-[#DDD6C8] rounded-md">
                {customDates.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono bg-[#F2EDE4] rounded text-[#2B2C30]"
                  >
                    {d}
                    {customDates.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomDate(d)}
                        className="text-[#7E7F85] hover:text-[#D23B38]"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={newDateInput}
                  onChange={(e) => setNewDateInput(e.target.value)}
                  className="flex-1 px-2.5 py-1 text-xs font-mono bg-white border border-[#DDD6C8] rounded-md text-[#2B2C30]"
                />
                <button
                  type="button"
                  onClick={handleAddCustomDate}
                  className="px-2.5 py-1 text-xs bg-[#F2EDE4] hover:bg-[#EAE3D6] text-[#2B2C30] rounded-md border border-[#DDD6C8]"
                >
                  + Add Day
                </button>
              </div>
            </div>
          )}

          {/* Color tag */}
          <div>
            <label className="block text-xs font-mono text-[#7E7F85] uppercase tracking-wider mb-1.5">
              Accent Color
            </label>
            <div className="flex items-center gap-2">
              {/* None / Default uncolored option */}
              <button
                type="button"
                onClick={() => setColorTag(undefined)}
                className={`w-5 h-5 rounded-full border border-[#DDD6C8] flex items-center justify-center transition-all cursor-pointer ${
                  !colorTag ? 'ring-2 ring-offset-2 ring-[#2B2C30] bg-[#EAE3D6]' : 'bg-[#FAF8F5] opacity-70 hover:opacity-100'
                }`}
                title="No color (Default / Clear)"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#A19D94]" />
              </button>

              {NOTE_ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColorTag(colorTag === c ? undefined : c)}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    colorTag === c ? 'scale-125 ring-2 ring-offset-2 ring-[#2B2C30]' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5DFD5]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-[#7E7F85] hover:text-[#2B2C30] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] rounded-md shadow-xs transition-colors"
            >
              Save Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
