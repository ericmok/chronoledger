import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useCalendarState } from './hooks/useCalendarState';
import { useResponsiveLayout, type HorizonPanel } from './hooks/useResponsiveLayout';
import { generateDateRangeSnapped, formatDateKey, parseDateKey } from './utils/dateUtils';
import { Header } from './components/Header';
import { VerticalCalendar } from './components/VerticalCalendar';
import { AddNoteModal } from './components/AddNoteModal';
import { JigsawMonthGrid } from './components/JigsawMonthGrid';
import { AuthModal } from './components/auth/AuthModal';
import { checkAuthSession, logoutUser, type UserProfile } from './services/auth';
import { HorizonSlider } from './components/layout/HorizonSlider';
import { StandaloneWeekRoll } from './components/calendar/StandaloneWeekRoll';
import { StandaloneMonthReflectionsRoll } from './components/radar/StandaloneMonthReflectionsRoll';
import { NoteFolioModal } from './components/common/NoteFolioModal';

export function App() {
  const {
    notes,
    weekNotes,
    monthNotes,
    drawings,
    circledDates,
    settings,
    addNote,
    toggleStrikeNote,
    removeNote,
    updateNote,
    acceptNoteRevision,
    reorderNotes,
    moveNoteToDate,
    addWeekNote,
    toggleStrikeWeekNote,
    removeWeekNote,
    updateWeekNote,
    reorderWeekNotes,
    moveWeekNoteToWeek,
    addMonthNote,
    toggleStrikeMonthNote,
    removeMonthNote,
    updateMonthNote,
    reorderMonthNotes,
    moveMonthNoteToMonth,
    addDrawing,
    removeDrawing,
    removeDrawings,
    toggleCircleDate,
    cycleCircleColor,
    updateSettings,
    exportBackup,
    importBackupFile,
    undo,
    redo,
    canUndo,
    canRedo,
    syncStatus,
    lastSyncedAt,
    forceSync,
    rehydrateRemoteCalendar,
    clearCalendarState,
  } = useCalendarState();

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [unclaimedCount, setUnclaimedCount] = useState(0);
  const [isFirstSetup, setIsFirstSetup] = useState(false);

  useEffect(() => {
    checkAuthSession().then((res) => {
      if (res.authenticated && res.user) {
        setCurrentUser(res.user);
      } else {
        setUnclaimedCount(res.unclaimedCount);
        setIsFirstSetup(Boolean(res.isFirstSetup));
        if (res.isFirstSetup || res.unclaimedCount > 0) {
          setIsAuthModalOpen(true);
        }
      }
    });
  }, []);

  const handleAuthSuccess = async (user: UserProfile) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);
    await rehydrateRemoteCalendar();
  };

  const handleLogout = async () => {
    await logoutUser();
    setCurrentUser(null);
    clearCalendarState();
    const session = await checkAuthSession();
    setUnclaimedCount(session.unclaimedCount);
    setIsFirstSetup(Boolean(session.isFirstSetup));
  };

  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [scrollTargetDate, setScrollTargetDate] = useState<{ dateString: string; key: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Active long-form note folio state
  const [activeFolioNote, setActiveFolioNote] = useState<{
    id: string;
    content: string;
    title: string;
    subtitle?: string;
    type: 'daily' | 'week' | 'month';
  } | null>(null);

  const handleOpenFolio = useCallback(
    (noteId: string) => {
      const daily = notes.find((n) => n.id === noteId);
      if (daily) {
        setActiveFolioNote({
          id: daily.id,
          content: daily.content,
          title: `Note: ${daily.parentDates.join(', ')}`,
          subtitle: 'Daily Timeline Note',
          type: 'daily',
        });
        return;
      }

      const week = weekNotes.find((w) => w.id === noteId);
      if (week) {
        setActiveFolioNote({
          id: week.id,
          content: week.content,
          title: `Weekly Note: ${week.parentWeeks.join(', ')}`,
          subtitle: 'Weekly Scratch Pad',
          type: 'week',
        });
        return;
      }

      const month = monthNotes.find((m) => m.id === noteId);
      if (month) {
        setActiveFolioNote({
          id: month.id,
          content: month.content,
          title: `Month Horizon: ${month.parentMonths.join(', ')}`,
          subtitle: 'Monthly Reflection & Goals',
          type: 'month',
        });
        return;
      }
    },
    [notes, weekNotes, monthNotes]
  );

  const handleSaveFolio = useCallback(
    (newContent: string) => {
      if (!activeFolioNote) return;
      if (activeFolioNote.type === 'daily') {
        updateNote(activeFolioNote.id, newContent);
      } else if (activeFolioNote.type === 'week') {
        updateWeekNote(activeFolioNote.id, newContent);
      } else if (activeFolioNote.type === 'month') {
        updateMonthNote(activeFolioNote.id, newContent);
      }
    },
    [activeFolioNote, updateNote, updateWeekNote, updateMonthNote]
  );

  // Responsive Layout detection & mobile horizon state
  const {
    isMobile,
    isCompact,
    activePanel,
    setActivePanel,
    radarCompactView,
    setRadarCompactView,
    isKeyboardOpen,
  } = useResponsiveLayout();

  const [targetWeekKey, setTargetWeekKey] = useState<string | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);

  // Dynamic bidirectional window of weeks snapped around current week
  const [calendarWindow, setCalendarWindow] = useState({
    weeksBefore: 26, // starts at ~6 months in the past
    weeksAfter: 52,  // starts at ~12 months in the future
  });

  const centerDate = useMemo(() => new Date(), []);
  const dates = useMemo(() => {
    return generateDateRangeSnapped(
      centerDate,
      calendarWindow.weeksBefore,
      calendarWindow.weeksAfter,
      settings.weekStartsOn
    );
  }, [centerDate, calendarWindow.weeksBefore, calendarWindow.weeksAfter, settings.weekStartsOn]);

  const handleLoadEarlierWeeks = useCallback(() => {
    setCalendarWindow((prev) => ({
      ...prev,
      weeksBefore: prev.weeksBefore + 26,
    }));
  }, []);

  const handleLoadLaterWeeks = useCallback(() => {
    setCalendarWindow((prev) => ({
      ...prev,
      weeksAfter: prev.weeksAfter + 26,
    }));
  }, []);

  const scrollToDate = useCallback(
    (dateString: string) => {
      const targetDate = parseDateKey(dateString);
      if (!isNaN(targetDate.getTime())) {
        const now = new Date();
        const diffDays = Math.round((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.floor(diffDays / 7);

        // Auto-expand range if target date is outside current loaded range
        if (diffWeeks < -calendarWindow.weeksBefore) {
          const needed = Math.abs(diffWeeks) + 26;
          setCalendarWindow((prev) => ({ ...prev, weeksBefore: Math.max(prev.weeksBefore, needed) }));
        } else if (diffWeeks > calendarWindow.weeksAfter) {
          const needed = diffWeeks + 26;
          setCalendarWindow((prev) => ({ ...prev, weeksAfter: Math.max(prev.weeksAfter, needed) }));
        }
      }

      setScrollTargetDate({ dateString, key: Date.now() });
    },
    [calendarWindow.weeksBefore, calendarWindow.weeksAfter]
  );

  const handleScrollDeck = useCallback(() => {
    if (!deckRef.current || !isMobile) return;
    const scrollLeft = deckRef.current.scrollLeft;
    const panelWidth = deckRef.current.clientWidth;
    if (panelWidth === 0) return;
    const panelIndex = Math.round(scrollLeft / panelWidth);
    const panels: HorizonPanel[] = ['day', 'week', 'months', 'reflections'];
    const newPanel = panels[panelIndex];
    if (newPanel && newPanel !== activePanel) {
      setActivePanel(newPanel);
    }
  }, [isMobile, activePanel, setActivePanel]);

  const handlePanelChange = useCallback(
    (panel: HorizonPanel) => {
      setActivePanel(panel);
      if (deckRef.current && isMobile) {
        const panels: HorizonPanel[] = ['day', 'week', 'months', 'reflections'];
        const idx = panels.indexOf(panel);
        if (idx !== -1) {
          deckRef.current.scrollTo({
            left: idx * deckRef.current.clientWidth,
            behavior: 'smooth',
          });
        }
      }
    },
    [isMobile, setActivePanel]
  );

  const handleSelectDateFromMonths = useCallback(
    (dateKey: string) => {
      scrollToDate(dateKey);
      if (isMobile) {
        handlePanelChange('day');
      }
    },
    [scrollToDate, isMobile, handlePanelChange]
  );

  const handleOpenWeekScratchPad = useCallback(
    (weekKey: string) => {
      setTargetWeekKey(weekKey);
      handlePanelChange('week');
    },
    [handlePanelChange]
  );

  const handleJumpToToday = () => {
    const todayStr = formatDateKey(new Date());
    scrollToDate(todayStr);
    if (isMobile) {
      handlePanelChange('day');
    }
  };

  // Global hotkeys (Undo/Redo, Tool switching, navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs/textareas or contenteditable elements
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)
      ) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;

      // Undo: Cmd+Z / Ctrl+Z (without shift)
      if (isMod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Cmd+Shift+Z / Ctrl+Shift+Z or Ctrl+Y
      if (
        (isMod && (e.key === 'z' || e.key === 'Z') && e.shiftKey) ||
        (isMod && (e.key === 'y' || e.key === 'Y'))
      ) {
        e.preventDefault();
        redo();
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
      } else if (e.key === 'a' || e.key === 'A') {
        updateSettings({ activeTool: 'arrow' });
      } else if (e.key === 'e' || e.key === 'E') {
        updateSettings({ activeTool: 'eraser' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [updateSettings, undo, redo]);

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
        onExportBackup={exportBackup}
        onImportBackup={importBackupFile}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        onForceSync={forceSync}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onLogout={handleLogout}
        isMobile={isMobile}
      />

      {/* Main Container: Mobile Horizon Deck OR Desktop/Laptop Roll */}
      {isMobile ? (
        <div className="flex-1 relative flex flex-col overflow-hidden">
          {/* Mobile Horizon Deck: 4 Horizontal Panning Surfaces with CSS Scroll-Snap */}
          <div
            ref={deckRef}
            onScroll={handleScrollDeck}
            className="flex-1 w-full flex overflow-x-auto overflow-y-hidden select-none scroll-smooth pb-14"
            style={{
              scrollSnapType: 'x mandatory',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Panel 0: Day Timeline */}
            <section
              className="w-full flex-none h-full flex flex-col overflow-hidden"
              style={{ scrollSnapAlign: 'start', minWidth: '100%' }}
            >
              <VerticalCalendar
                dates={dates}
                notes={notes}
                weekNotes={weekNotes}
                drawings={drawings}
                circledDates={circledDates}
                settings={settings}
                onLoadEarlierWeeks={handleLoadEarlierWeeks}
                onLoadLaterWeeks={handleLoadLaterWeeks}
                onToggleStrike={toggleStrikeNote}
                onRemoveNote={removeNote}
                onUpdateNote={updateNote}
                onAcceptNoteRevision={acceptNoteRevision}
                onReorderNotes={reorderNotes}
                onMoveNoteToDate={moveNoteToDate}
                onAddQuickNote={(date, text, parentDates, colorTag) => addNote(text, parentDates || [date], colorTag)}
                onAddWeekNote={addWeekNote}
                onToggleStrikeWeekNote={toggleStrikeWeekNote}
                onRemoveWeekNote={removeWeekNote}
                onUpdateWeekNote={updateWeekNote}
                onReorderWeekNotes={reorderWeekNotes}
                onMoveWeekNoteToWeek={moveWeekNoteToWeek}
                onAddDrawing={addDrawing}
                onRemoveDrawing={removeDrawing}
                onRemoveDrawings={removeDrawings}
                onToggleCircleDate={toggleCircleDate}
                onCycleCircleColor={cycleCircleColor}
                onCloseTool={() => updateSettings({ activeTool: 'select' })}
                onJumpToDateRequested={(d) => scrollToDate(d)}
                scrollTargetDate={scrollTargetDate}
                scrollRef={scrollRef}
                hideWeekPanel={true}
                onOpenWeekScratchPad={handleOpenWeekScratchPad}
              />
            </section>

            {/* Panel 1: Week Scratch Pad */}
            <section
              className="w-full flex-none h-full flex flex-col overflow-hidden"
              style={{ scrollSnapAlign: 'start', minWidth: '100%' }}
            >
              <StandaloneWeekRoll
                dates={dates}
                weekNotes={weekNotes}
                settings={settings}
                onAddWeekNote={addWeekNote}
                onToggleStrikeWeekNote={toggleStrikeWeekNote}
                onRemoveWeekNote={removeWeekNote}
                onUpdateWeekNote={updateWeekNote}
                onAcceptNoteRevision={acceptNoteRevision}
                onReorderWeekNotes={reorderWeekNotes}
                onMoveWeekNoteToWeek={moveWeekNoteToWeek}
                onJumpToDateRequested={(d) => {
                  scrollToDate(d);
                  handlePanelChange('day');
                }}
                scrollTargetWeekKey={targetWeekKey}
                onLoadEarlierWeeks={handleLoadEarlierWeeks}
                onLoadLaterWeeks={handleLoadLaterWeeks}
              />
            </section>

            {/* Panel 2: Continuous Months */}
            <section
              className="w-full flex-none h-full flex flex-col overflow-hidden"
              style={{ scrollSnapAlign: 'start', minWidth: '100%' }}
            >
              <div className="flex-1 overflow-hidden flex justify-center">
                <JigsawMonthGrid
                  onSelectDate={handleSelectDateFromMonths}
                  notes={notes}
                  monthNotes={monthNotes}
                  drawings={drawings}
                  circledDates={circledDates}
                  weekStartsOn={settings.weekStartsOn}
                  onJumpToToday={handleJumpToToday}
                  onAddMonthNote={addMonthNote}
                  onToggleStrikeMonthNote={toggleStrikeMonthNote}
                  onRemoveMonthNote={removeMonthNote}
                  onUpdateMonthNote={updateMonthNote}
                  onAcceptNoteRevision={acceptNoteRevision}
                  onReorderMonthNotes={reorderMonthNotes}
                  onMoveMonthNoteToMonth={moveMonthNoteToMonth}
                  scrollTargetDate={scrollTargetDate}
                  onAddDrawing={addDrawing}
                  onRemoveDrawing={removeDrawing}
                  onRemoveDrawings={removeDrawings}
                  onToggleCircleDate={toggleCircleDate}
                  onCycleCircleColor={cycleCircleColor}
                  settings={settings}
                  isCompact={true}
                  compactView="grid"
                  className="w-full max-w-[340px] border-none bg-transparent"
                />
              </div>
            </section>

            {/* Panel 3: Monthly Reflections */}
            <section
              className="w-full flex-none h-full flex flex-col overflow-hidden"
              style={{ scrollSnapAlign: 'start', minWidth: '100%' }}
            >
              <StandaloneMonthReflectionsRoll
                monthNotes={monthNotes}
                settings={settings}
                onAddMonthNote={addMonthNote}
                onToggleStrikeMonthNote={toggleStrikeMonthNote}
                onRemoveMonthNote={removeMonthNote}
                onUpdateMonthNote={updateMonthNote}
                onAcceptNoteRevision={acceptNoteRevision}
              />
            </section>
          </div>

          {/* Tactile Bottom Horizon Slider */}
          <HorizonSlider
            activePanel={activePanel}
            onChangePanel={handlePanelChange}
            isKeyboardOpen={isKeyboardOpen}
          />
        </div>
      ) : (
        /* Desktop & Laptop Layout: Infinite Vertical Roll (Left) + Months (Right) */
        <div className="flex-1 relative flex overflow-hidden">
          {/* Infinite Vertical Calendar View */}
          <main className="flex-1 relative flex flex-col overflow-hidden min-w-0">
            <VerticalCalendar
              dates={dates}
              notes={notes}
              weekNotes={weekNotes}
              drawings={drawings}
              circledDates={circledDates}
              settings={settings}
              onLoadEarlierWeeks={handleLoadEarlierWeeks}
              onLoadLaterWeeks={handleLoadLaterWeeks}
              onToggleStrike={toggleStrikeNote}
              onRemoveNote={removeNote}
              onUpdateNote={updateNote}
              onAcceptNoteRevision={acceptNoteRevision}
              onReorderNotes={reorderNotes}
              onMoveNoteToDate={moveNoteToDate}
              onAddQuickNote={(date, text, parentDates, colorTag) => addNote(text, parentDates || [date], colorTag)}
              onAddWeekNote={addWeekNote}
              onToggleStrikeWeekNote={toggleStrikeWeekNote}
              onRemoveWeekNote={removeWeekNote}
              onUpdateWeekNote={updateWeekNote}
              onReorderWeekNotes={reorderWeekNotes}
              onMoveWeekNoteToWeek={moveWeekNoteToWeek}
              onAddDrawing={addDrawing}
              onRemoveDrawing={removeDrawing}
              onRemoveDrawings={removeDrawings}
              onToggleCircleDate={toggleCircleDate}
              onCycleCircleColor={cycleCircleColor}
              onCloseTool={() => updateSettings({ activeTool: 'select' })}
              onJumpToDateRequested={(d) => scrollToDate(d)}
              scrollTargetDate={scrollTargetDate}
              scrollRef={scrollRef}
              hideWeekPanel={false}
              onOpenFolio={handleOpenFolio}
            />
          </main>

          {/* Continuous Months Calendar & Reflections */}
          {isSidebarOpen && (
            <JigsawMonthGrid
              onSelectDate={(dateKey) => scrollToDate(dateKey)}
              notes={notes}
              monthNotes={monthNotes}
              drawings={drawings}
              circledDates={circledDates}
              weekStartsOn={settings.weekStartsOn}
              onJumpToToday={handleJumpToToday}
              onAddMonthNote={addMonthNote}
              onToggleStrikeMonthNote={toggleStrikeMonthNote}
              onRemoveMonthNote={removeMonthNote}
              onUpdateMonthNote={updateMonthNote}
              onAcceptNoteRevision={acceptNoteRevision}
              onReorderMonthNotes={reorderMonthNotes}
              onMoveMonthNoteToMonth={moveMonthNoteToMonth}
              scrollTargetDate={scrollTargetDate}
              onAddDrawing={addDrawing}
              onRemoveDrawing={removeDrawing}
              onRemoveDrawings={removeDrawings}
              onToggleCircleDate={toggleCircleDate}
              onCycleCircleColor={cycleCircleColor}
              settings={settings}
              isCompact={isCompact}
              compactView={radarCompactView}
              onCompactViewChange={setRadarCompactView}
              onOpenFolio={handleOpenFolio}
            />
          )}
        </div>
      )}

      {/* Add Note Modal */}
      <AddNoteModal
        isOpen={isAddNoteOpen}
        onClose={() => setIsAddNoteOpen(false)}
        onSave={(content, parentDates, colorTag) => addNote(content, parentDates, colorTag)}
      />

      {/* Distraction-Free Note Folio Modal */}
      {activeFolioNote && (
        <NoteFolioModal
          key={activeFolioNote.id}
          isOpen={Boolean(activeFolioNote)}
          onClose={() => setActiveFolioNote(null)}
          initialContent={activeFolioNote.content}
          title={activeFolioNote.title}
          subtitle={activeFolioNote.subtitle}
          onSave={handleSaveFolio}
        />
      )}

      {/* Auth & Migration Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
        unclaimedCount={unclaimedCount}
        isFirstSetup={isFirstSetup}
      />
    </div>
  );
}

export default App;
