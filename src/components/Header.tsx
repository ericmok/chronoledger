import type React from 'react';
import { 
  Calendar as CalendarIcon, 
  Circle as CircleIcon, 
  MoveRight as ArrowIcon, 
  PenTool, 
  MousePointer, 
  Eraser, 
  Compass, 
  Eye,
  EyeOff
} from 'lucide-react';
import type { CalendarSettings, DrawingTool } from '../types/calendar';


interface HeaderProps {
  settings: CalendarSettings;
  onUpdateSettings: (partial: Partial<CalendarSettings>) => void;
  onJumpToToday: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenAddNote: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  onJumpToToday,
  isSidebarOpen,
  onToggleSidebar,
  onOpenAddNote,
}) => {

  const tools: { id: DrawingTool; label: string; icon: React.ReactNode; shortcut: string; hint: string }[] = [
    { id: 'select', label: 'Select / Notes', icon: <MousePointer className="w-4 h-4" />, shortcut: 'V', hint: 'Browse and edit typed notes' },
    { id: 'pencil', label: 'Pencil', icon: <PenTool className="w-4 h-4" />, shortcut: 'P', hint: 'Pencil: Sketch freely in margins and notes' },
    { id: 'circle', label: 'Circle Date', icon: <CircleIcon className="w-4 h-4" />, shortcut: 'C', hint: 'Circle Date: Drag over date numbers to ring them' },
    { id: 'arrow', label: 'Timeline Arrow', icon: <ArrowIcon className="w-4 h-4" />, shortcut: 'A', hint: 'Timeline Arrow: Drag between two dates to link them' },
    { id: 'eraser', label: 'Eraser', icon: <Eraser className="w-4 h-4" />, shortcut: 'E', hint: 'Eraser: Paint over pencil strokes to erase them' },
  ];

  const inkColors = [
    { name: 'Graphite', hex: '#2B2C30' },
    { name: 'Red Pencil', hex: '#D23B38' },
    { name: 'Cobalt Ink', hex: '#1D4ED8' },
    { name: 'Amber Marker', hex: '#D97706' },
  ];

  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F5]/95 backdrop-blur-sm border-b border-[#E5DFD5] px-4 py-2.5 flex items-center justify-between shadow-xs">
      {/* Left: Branding & Today Button */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-serif text-lg font-semibold tracking-tight text-[#2B2C30]">
          <span className="text-xl">🕮</span>
          <span className="hidden sm:inline">ChronoLedger</span>
        </div>

        <button
          onClick={onJumpToToday}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-md bg-[#F2EDE4] hover:bg-[#EAE3D6] text-[#2B2C30] border border-[#DDD6C8] transition-colors"
          title="Jump to current date"
        >
          <Compass className="w-3.5 h-3.5 text-[#D23B38]" />
          <span>Today</span>
        </button>

        <button
          onClick={onOpenAddNote}
          className="px-2.5 py-1 text-xs font-sans font-medium rounded-md bg-[#2B2C30] hover:bg-[#404147] text-[#FAF8F5] transition-colors"
        >
          + New Note
        </button>
      </div>

      {/* Center: Analog Drawing Tools */}
      <div className="flex items-center gap-1 bg-[#F2EDE4] p-1 rounded-lg border border-[#DDD6C8]">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => onUpdateSettings({ activeTool: t.id })}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-all ${
              settings.activeTool === t.id
                ? 'bg-[#FAF8F5] text-[#2B2C30] shadow-xs border border-[#D5CDC0]'
                : 'text-[#6B6C72] hover:text-[#2B2C30] hover:bg-[#EAE3D6]/50'
            }`}
            title={`${t.label} (${t.shortcut}) — ${t.hint}`}
          >
            {t.icon}
            <span className="hidden md:inline">{t.label}</span>
          </button>
        ))}

        {/* Color Palette (visible when drawing tool active) */}
        {settings.activeTool !== 'select' && settings.activeTool !== 'eraser' && (
          <div className="flex items-center gap-1 pl-2 ml-1 border-l border-[#DDD6C8]">
            {inkColors.map((c) => (
              <button
                key={c.hex}
                onClick={() => onUpdateSettings({ inkColor: c.hex })}
                className={`w-4 h-4 rounded-full transition-transform ${
                  settings.inkColor === c.hex ? 'scale-125 ring-2 ring-offset-1 ring-[#2B2C30]' : 'opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right: Grid View & View Preferences */}
      <div className="flex items-center gap-2">
        {/* Toggle Show Struck / Ledger View */}
        <button
          onClick={() => onUpdateSettings({ showStruckItems: !settings.showStruckItems })}
          className="p-1.5 text-[#6B6C72] hover:text-[#2B2C30] rounded-md hover:bg-[#F2EDE4] transition-colors"
          title={settings.showStruckItems ? 'Ledger View (Showing struck items)' : 'Clean View (Hiding struck items)'}
        >
          {settings.showStruckItems ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-[#A19D94]" />}
        </button>

        {/* Week Start Toggle */}
        <button
          onClick={() => onUpdateSettings({ weekStartsOn: settings.weekStartsOn === 0 ? 1 : 0 })}
          className="px-2 py-1 text-[11px] font-mono rounded-md hover:bg-[#F2EDE4] text-[#6B6C72] border border-[#E5DFD5] transition-colors"
          title="Toggle week start day (Sunday vs. Monday)"
        >
          {settings.weekStartsOn === 0 ? 'Sun Start' : 'Mon Start'}
        </button>

        {/* Continuous Jigsaw Month Radar Toggle */}
        <button
          onClick={onToggleSidebar}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
            isSidebarOpen
              ? 'bg-[#2B2C30] text-[#FAF8F5] border-[#2B2C30]'
              : 'bg-[#F2EDE4] hover:bg-[#EAE3D6] text-[#2B2C30] border-[#DDD6C8]'
          }`}
          title="Toggle Continuous Jigsaw Month Radar"
        >
          <CalendarIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Radar</span>
        </button>

      </div>
    </header>
  );
};
