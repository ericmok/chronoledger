import type React from 'react';
import { Calendar, PenLine, CalendarDays, Sparkles } from 'lucide-react';
import type { HorizonPanel } from '../../hooks/useResponsiveLayout';

export interface HorizonSliderProps {
  activePanel: HorizonPanel;
  onChangePanel: (panel: HorizonPanel) => void;
  isKeyboardOpen?: boolean;
}

export const HorizonSlider: React.FC<HorizonSliderProps> = ({
  activePanel,
  onChangePanel,
  isKeyboardOpen = false,
}) => {
  if (isKeyboardOpen) return null;

  const panels: { id: HorizonPanel; label: string; icon: React.ReactNode }[] = [
    { id: 'day', label: 'Day', icon: <Calendar className="w-3.5 h-3.5" /> },
    { id: 'week', label: 'Week', icon: <PenLine className="w-3.5 h-3.5" /> },
    { id: 'months', label: 'Months', icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { id: 'reflections', label: 'Reflections', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  return (
    <nav
      aria-label="Horizon Navigation"
      className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 max-w-[94vw] w-fit select-none animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <div className="flex items-center gap-1 p-1 bg-[#2B2C30]/95 text-[#FAF8F5] rounded-full shadow-lg backdrop-blur-md border border-[#404147]">
        {panels.map((p) => {
          const isActive = activePanel === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChangePanel(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#FAF8F5] text-[#2B2C30] shadow-sm font-bold'
                  : 'text-[#A19D94] hover:text-[#FAF8F5] hover:bg-[#404147]/60'
              }`}
            >
              {p.icon}
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
