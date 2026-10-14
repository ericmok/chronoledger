import { useState, useRef, useMemo, useEffect } from 'react';
import { useCalendarState } from './hooks/useCalendarState';
import { generateDateRange, formatDateKey } from './utils/dateUtils';
import { Header } from './components/Header';
import { VerticalCalendar } from './components/VerticalCalendar';
import { AddNoteModal } from './components/AddNoteModal';
import { JigsawMonthGrid } from './components/JigsawMonthGrid';

export function App() {
  const {
    notes,
    weekNotes,
    monthNotes,
    drawings,
    settings,
    addNote,
    toggleStrikeNote,
    removeNote,
    addWeekNote,
    toggleStrikeWeekNote,
    removeWeekNote,
    addMonthNote,
    toggleStrikeMonthNote,
    removeMonthNote,
    addDrawing,
    removeDrawing,
    clearAllDrawings,
    updateSettings,
  } = useCalendarState();



  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [scrollTargetDate, setScrollTargetDate] = useState<{ dateString: string; key: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Generate 1.5 years of dates around current date
  const centerDate = useMemo(() => new Date(), []);
  const dates = useMemo(() => {
    return generateDateRange(centerDate, 180, 365, settings.weekStartsOn);
  }, [centerDate, settings.weekStartsOn]);

  const scrollToDate = (dateString: string) => {
    setScrollTargetDate({ dateString, key: Date.now() });
  };

  const handleJumpToToday = () => {
    const todayStr = formatDateKey(new Date());
    scrollToDate(todayStr);
  };

  // Global hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs/textareas
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        handleJumpToToday();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setIsSidebarOpen((prev) => !prev);
      } else if (e.key === 'v' || e.key === 'V') {
        updateSettings({ activeTool: 'select' });
      } else if (e.key === 'p' || e.key === 'P') {
        updateSettings({ activeTool: 'pencil' });
      } else if (e.key === 'c' || e.key === 'C') {
        updateSettings({ activeTool: 'circle' });
      } else if (e.key === 'a' || e.key === 'A') {
        updateSettings({ activeTool: 'arrow' });
      } else if (e.key === 'e' || e.key === 'E') {
        updateSettings({ activeTool: 'eraser' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [updateSettings]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#FAF8F5] text-[#2B2C30]">
      {/* Top Analog Header Bar */}
      <Header
        settings={settings}
        onUpdateSettings={updateSettings}
        onJumpToToday={handleJumpToToday}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onOpenAddNote={() => setIsAddNoteOpen(true)}
        onClearDrawings={clearAllDrawings}
        hasDrawings={drawings.length > 0}
      />

      {/* Main Container: Infinite Vertical Roll (Left) + Continuous Jigsaw Month Radar (Right) */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Infinite Vertical Calendar View */}
        <main className="flex-1 relative flex flex-col overflow-hidden min-w-0">
          <VerticalCalendar
            dates={dates}
            notes={notes}
            weekNotes={weekNotes}
            drawings={drawings}
            settings={settings}
            onToggleStrike={toggleStrikeNote}
            onRemoveNote={removeNote}
            onAddQuickNote={(date, text) => addNote(text, [date])}
            onAddWeekNote={addWeekNote}
            onToggleStrikeWeekNote={toggleStrikeWeekNote}
            onRemoveWeekNote={removeWeekNote}
            onAddDrawing={addDrawing}
            onRemoveDrawing={removeDrawing}
            onJumpToDateRequested={(d) => scrollToDate(d)}
            scrollTargetDate={scrollTargetDate}
            scrollRef={scrollRef}
          />

        </main>

        {/* Continuous Jigsaw Grid Radar + Month Notes */}
        {isSidebarOpen && (
          <JigsawMonthGrid
            onSelectDate={(dateKey) => scrollToDate(dateKey)}
            notes={notes}
            monthNotes={monthNotes}
            drawings={drawings}
            weekStartsOn={settings.weekStartsOn}
            onJumpToToday={handleJumpToToday}
            onAddMonthNote={addMonthNote}
            onToggleStrikeMonthNote={toggleStrikeMonthNote}
            onRemoveMonthNote={removeMonthNote}
          />
        )}
      </div>

      {/* Add Note Modal */}
      <AddNoteModal
        isOpen={isAddNoteOpen}
        onClose={() => setIsAddNoteOpen(false)}
        onSave={(content, parentDates, colorTag) => addNote(content, parentDates, colorTag)}
      />
    </div>
  );
}

export default App;
