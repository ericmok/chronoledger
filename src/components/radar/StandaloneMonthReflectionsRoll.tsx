import { useState, useMemo, useRef, useEffect } from 'react';
import type React from 'react';
import { Plus } from 'lucide-react';
import type { MonthNote, CalendarSettings } from '../../types/calendar';
import { MONTH_NAMES, FULL_MONTH_NAMES, formatDateKey } from '../../utils/dateUtils';
import { getSeasonalColor } from '../../utils/seasonalColors';
import { NoteCard } from '../common/NoteCard';
import { MonthNoteInlineForm } from './MonthNoteInlineForm';

export interface StandaloneMonthReflectionsRollProps {
  monthNotes: MonthNote[];
  settings: CalendarSettings;
  targetMonthKey?: string | null;
  onAddMonthNote: (content: string, parentMonths: string[], colorTag?: string) => void;
  onToggleStrikeMonthNote: (id: string) => void;
  onRemoveMonthNote: (id: string) => void;
  onUpdateMonthNote?: (id: string, newContent: string, parentMonths?: string[], colorTag?: string) => void;
  onAcceptNoteRevision?: (noteId: string) => void;
  onReorderMonthNotes?: (sourceNoteId: string, targetNoteId: string, position: 'before' | 'after', targetMonth?: string) => void;
  onMoveMonthNoteToMonth?: (noteId: string, targetMonth: string, position?: 'start' | 'end') => void;
}

export const StandaloneMonthReflectionsRoll: React.FC<StandaloneMonthReflectionsRollProps> = ({
  monthNotes = [],
  settings,
  targetMonthKey,
  onAddMonthNote,
  onToggleStrikeMonthNote,
  onRemoveMonthNote,
  onUpdateMonthNote,
  onAcceptNoteRevision,
}) => {
  const [quickInputMonth, setQuickInputMonth] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const monthSectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Generate 24 continuous months window around current date (-6 months to +18 months)
  const months = useMemo(() => {
    const list: { monthKey: string; monthIndex: number; year: number; name: string; fullName: string }[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    for (let offset = -6; offset <= 18; offset++) {
      const d = new Date(currentYear, currentMonth + offset, 1);
      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const monthKey = `${yr}-${String(mIdx + 1).padStart(2, '0')}`;
      list.push({
        monthKey,
        monthIndex: mIdx,
        year: yr,
        name: MONTH_NAMES[mIdx],
        fullName: FULL_MONTH_NAMES[mIdx],
      });
    }
    return list;
  }, []);

  const availableMonths = useMemo(() => {
    return months.map((m) => ({
      monthKey: m.monthKey,
      label: `${m.fullName} ${m.year}`,
    }));
  }, [months]);

  // Group notes by monthKey
  const monthNotesByMonth = useMemo(() => {
    const map = new Map<string, MonthNote[]>();
    for (const mn of monthNotes) {
      if (!settings.showStruckItems && mn.isStruck) continue;

      for (const mKey of mn.parentMonths) {
        const list = map.get(mKey) || [];
        if (!list.some((x) => x.id === mn.id)) {
          list.push(mn);
        }
        map.set(mKey, list);
      }
    }
    return map;
  }, [monthNotes, settings.showStruckItems]);

  const currentMonthKey = useMemo(() => formatDateKey(new Date()).slice(0, 7), []);

  // Smooth scroll to target month or current month
  useEffect(() => {
    const keyToScroll = targetMonthKey || currentMonthKey;
    const el = monthSectionRefs.current.get(keyToScroll);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [targetMonthKey, currentMonthKey]);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-y-auto paper-texture select-none h-full outline-hidden px-3 py-4"
    >
      <div className="max-w-[720px] mx-auto pb-16">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[#8E8F95] pb-2 border-b border-[#E5DFD5] mb-4">
          <span className="font-semibold text-[#2B2C30]">Monthly Reflections</span>
          <span>Notable Memories & Themes</span>
        </div>

        <div className="flex flex-col gap-4">
          {months.map((m) => {
            const notes = monthNotesByMonth.get(m.monthKey) || [];
            const isAdding = quickInputMonth === m.monthKey;
            const seasonal = getSeasonalColor(m.monthIndex);
            const isCurrent = m.monthKey === currentMonthKey;

            return (
              <div
                key={m.monthKey}
                ref={(el) => {
                  if (el) monthSectionRefs.current.set(m.monthKey, el);
                  else monthSectionRefs.current.delete(m.monthKey);
                }}
                className={`p-3.5 rounded-lg border transition-colors ${
                  isCurrent
                    ? 'border-[#D23B38] bg-[#FAF7F2] shadow-xs'
                    : 'border-[#E5DFD5] bg-[#FAF8F5]'
                }`}
                style={{
                  borderLeftWidth: '4px',
                  borderLeftColor: seasonal.accentTag,
                }}
              >
                {/* Month Card Header */}
                <div className="flex items-center justify-between border-b border-[#E5DFD5] pb-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: seasonal.accentTag }}
                    />
                    <h3 className="font-serif font-bold text-sm text-[#2B2C30]">
                      {m.fullName} {m.year}
                    </h3>
                    {isCurrent && (
                      <span className="text-[10px] font-mono uppercase bg-[#2B2C30] text-[#FAF8F5] px-1.5 py-0.5 rounded font-bold">
                        Current
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setQuickInputMonth(m.monthKey)}
                    className="p-1 rounded hover:bg-[#EAE3D6] text-[#63666A] hover:text-[#2B2C30] transition-colors cursor-pointer"
                    title={`Add reflection for ${m.fullName}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Inline Add Form */}
                {isAdding && (
                  <div className="mb-2">
                    <MonthNoteInlineForm
                      currentMonthKey={m.monthKey}
                      availableMonths={availableMonths}
                      onSubmit={(content, parentMonths, colorTag) => {
                        onAddMonthNote(content, parentMonths, colorTag);
                        setQuickInputMonth(null);
                      }}
                      onCancel={() => setQuickInputMonth(null)}
                    />
                  </div>
                )}

                {/* Notes List */}
                <div className="flex flex-col gap-1.5 min-h-[32px]">
                  {notes.length === 0 && !isAdding && (
                    <div
                      onDoubleClick={() => setQuickInputMonth(m.monthKey)}
                      className="text-xs text-[#A19D94] italic py-2 px-1 cursor-pointer hover:text-[#7E7F85]"
                    >
                      No reflections recorded. Double-tap to write a notable memory.
                    </div>
                  )}

                  {notes.map((note) => (
                    <div key={note.id} className="relative">
                      <NoteCard
                        id={note.id}
                        content={note.content}
                        originalContent={note.originalContent}
                        isStruck={note.isStruck}
                        colorTag={note.colorTag}
                        density="comfortable"
                        variant="card"
                        onToggleStrike={onToggleStrikeMonthNote}
                        onRemove={onRemoveMonthNote}
                        onUpdate={(id, text) => {
                          onUpdateMonthNote?.(id, text, note.parentMonths, note.colorTag);
                        }}
                        onAcceptEdit={onAcceptNoteRevision}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
