import React, { useState } from 'react';
import type { MonthMeta } from './MonthNotesColumn';

export interface MultiMonthNoteModalProps {
  isOpen: boolean;
  monthMetas: MonthMeta[];
  onClose: () => void;
  onSave: (content: string, parentMonths: string[], colorTag?: string) => void;
}

export const MultiMonthNoteModal: React.FC<MultiMonthNoteModalProps> = ({
  isOpen,
  monthMetas,
  onClose,
  onSave,
}) => {
  const [content, setContent] = useState('');
  const [startMonth, setStartMonth] = useState(monthMetas[1]?.monthKey || monthMetas[0]?.monthKey || '');
  const [endMonth, setEndMonth] = useState(monthMetas[3]?.monthKey || monthMetas[0]?.monthKey || '');
  const [colorTag] = useState('#83C5BE');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    // Build contiguous list of spanned months
    const allKeys = monthMetas.map((m) => m.monthKey);
    const sIdx = allKeys.indexOf(startMonth);
    const eIdx = allKeys.indexOf(endMonth);

    const minIdx = Math.min(sIdx, eIdx);
    const maxIdx = Math.max(sIdx, eIdx);
    const targetMonths = allKeys.slice(minIdx, maxIdx + 1);

    onSave(content, targetMonths, colorTag);
    setContent('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm bg-[#FAF8F5] border border-[#DDD6C8] rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-4 py-3 border-b border-[#E5DFD5] flex items-center justify-between">
          <h4 className="font-serif font-bold text-base text-[#2B2C30]">Multi-Month Note</h4>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8E8F95] hover:text-[#2B2C30] text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-mono text-[#7E7F85] uppercase mb-1">
              Note / Objective
            </label>
            <input
              autoFocus
              type="text"
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. Q4 Growth Sprint, Hiring Initiative..."
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#DDD6C8] rounded focus:outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-mono text-[#7E7F85] uppercase mb-0.5">
                From Month
              </label>
              <select
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-white border border-[#DDD6C8] rounded"
              >
                {monthMetas.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.fullName} {m.year}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-[#7E7F85] uppercase mb-0.5">
                To Month
              </label>
              <select
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-white border border-[#DDD6C8] rounded"
              >
                {monthMetas.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.fullName} {m.year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5DFD5]">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 text-xs text-[#7E7F85] hover:text-[#2B2C30] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 text-xs font-medium bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] rounded shadow-xs cursor-pointer"
            >
              Save Spanning Note
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
