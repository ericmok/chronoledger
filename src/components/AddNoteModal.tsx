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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 font-mono">
      <div className="w-full max-w-md bg-[#FAFAFA] border-2 border-[#3264EB] rounded-none shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-[#212121]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0] bg-[#F2F2F4]">
          <h3 className="font-mono text-xs font-bold text-[#212121] uppercase tracking-wider flex items-center gap-1.5">
            <span className="text-[#3264EB]">&gt;</span> :new_note
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-none text-[#757575] hover:text-[#212121] hover:bg-[#E9ECEF]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 font-mono text-xs">
          {/* Note content */}
          <div>
            <div className="flex items-center justify-between mb-1.5 font-mono">
              <label className="block text-[11px] font-mono text-[#757575] uppercase tracking-wider">
                // Note Buffer (Markdown)
              </label>
              <span className="text-[10px] font-mono text-[#9E9E9E]">⌘↵ save • ↵ newline</span>
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
                className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#CBD5E1] rounded-none focus:outline-hidden focus:border-[#3264EB] placeholder-[#9E9E9E] resize-none leading-relaxed text-[#212121]"
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
            <label className="block text-[11px] font-mono text-[#757575] uppercase tracking-wider mb-1.5">
              // Target Attachment
            </label>
            <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#F2F2F4] border border-[#E2E8F0] rounded-none text-xs font-mono font-medium">
              <button
                type="button"
                onClick={() => setMode('single')}
                className={`py-1 rounded-none transition-all cursor-pointer ${
                  mode === 'single' ? 'bg-[#3264EB] text-white font-bold' : 'text-[#757575] hover:text-[#212121]'
                }`}
              >
                :single
              </button>
              <button
                type="button"
                onClick={() => setMode('contiguous')}
                className={`py-1 rounded-none transition-all cursor-pointer ${
                  mode === 'contiguous' ? 'bg-[#3264EB] text-white font-bold' : 'text-[#757575] hover:text-[#212121]'
                }`}
              >
                :span
              </button>
              <button
                type="button"
                onClick={() => setMode('non-contiguous')}
                className={`py-1 rounded-none transition-all cursor-pointer ${
                  mode === 'non-contiguous' ? 'bg-[#3264EB] text-white font-bold' : 'text-[#757575] hover:text-[#212121]'
                }`}
              >
                :multi
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
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-mono font-medium text-[#757575] hover:text-[#212121] border border-[#CBD5E1] rounded-none hover:bg-[#F2F2F4] transition-colors cursor-pointer"
            >
              [:cancel]
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-mono font-medium bg-[#3264EB] hover:bg-[#2552D0] text-white rounded-none border border-[#2552D0] transition-colors cursor-pointer"
            >
              [+ :save]
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
