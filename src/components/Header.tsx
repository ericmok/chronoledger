import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Calendar as CalendarIcon, 
  MoveRight as ArrowIcon, 
  PenTool, 
  MousePointer, 
  Eraser, 
  Compass, 
  Eye,
  EyeOff,
  Download,
  Upload,
  Undo,
  Redo,
  Database,
  RefreshCw,
  User,
  LogOut,
  MoreVertical,
  X,
  Tag as TagIcon,
  Search,
} from 'lucide-react';
import type { CalendarSettings, DrawingTool } from '../types/calendar';
import type { UserProfile } from '../services/auth';

interface HeaderProps {
  settings: CalendarSettings;
  onUpdateSettings: (partial: Partial<CalendarSettings>) => void;
  onJumpToToday: () => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenAddNote: () => void;
  onExportBackup?: () => void;
  onImportBackup?: (file: File) => Promise<boolean>;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  syncStatus?: 'synced' | 'syncing' | 'offline';
  lastSyncedAt?: string | null;
  onForceSync?: () => void;
  currentUser?: UserProfile | null;
  onOpenAuthModal?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenTagSettings?: () => void;
  onOpenSearch?: () => void;
  activeFilter?: string | null;
  onClearFilter?: () => void;
  onLogout?: () => void;
  isMobile?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  onJumpToToday,
  isSidebarOpen,
  onToggleSidebar,
  onOpenAddNote,
  onExportBackup,
  onImportBackup,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  syncStatus,
  lastSyncedAt,
  onForceSync,
  currentUser,
  onOpenAuthModal,
  onOpenAccountSettings,
  onOpenTagSettings,
  onOpenSearch,
  activeFilter,
  onClearFilter,
  onLogout,
  isMobile: _isMobile = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isLupine = settings.themeMode !== 'paper';

  const tools: { id: DrawingTool; label: string; icon: React.ReactNode; shortcut: string; hint: string }[] = [
    { id: 'select', label: 'Select / Notes', icon: <MousePointer className="w-4 h-4" />, shortcut: 'V', hint: 'Browse and edit typed notes' },
    { id: 'pencil', label: 'Pencil', icon: <PenTool className="w-4 h-4" />, shortcut: 'P', hint: 'Pencil: Sketch freely in margins and notes' },
    { id: 'arrow', label: 'Timeline Arrow', icon: <ArrowIcon className="w-4 h-4" />, shortcut: 'A', hint: 'Timeline Arrow: Drag between two dates to link them' },
    { id: 'eraser', label: 'Eraser', icon: <Eraser className="w-4 h-4" />, shortcut: 'E', hint: 'Eraser: Paint over pencil strokes to erase them' },
  ];

  const inkColors = isLupine
    ? [
        { name: 'Cobalt Blue', hex: '#3264EB' },
        { name: 'Lupine Violet', hex: '#5E49B0' },
        { name: 'Heather Lavender', hex: '#B378B1' },
        { name: 'Obsidian Slate', hex: '#212121' },
      ]
    : [
        { name: 'Graphite', hex: '#2B2C30' },
        { name: 'Red Pencil', hex: '#D23B38' },
        { name: 'Cobalt Ink', hex: '#1D4ED8' },
        { name: 'Amber Marker', hex: '#D97706' },
      ];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onImportBackup) {
      const success = await onImportBackup(file);
      if (success) {
        alert('Backup successfully restored!');
      } else {
        alert('Failed to restore backup. Please verify the JSON file format.');
      }
      e.target.value = '';
    }
  };

  return (
    // Rigid flex sibling header in Waybar/TUI statusline format. flex-none ensures exactly 48px height.
    <header className="flex-none shrink-0 w-full z-30 h-12 border-b border-[#E2E8F0] bg-[#FAFAFA] text-[#212121] font-mono px-3 sm:px-4 flex items-center justify-between transition-colors">
      {/* Left: TUI Command Prompt & Actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center gap-1 font-mono text-xs sm:text-sm font-bold tracking-tight text-[#212121]">
          <span className="text-[#3264EB] font-bold">~</span>
          <span className="text-[#757575]">/</span>
          <span>chrono</span>
          <span className="text-[#3264EB] font-normal animate-console-cursor">_</span>
          <span className="text-[10px] font-mono font-bold tracking-wider uppercase px-1 py-0.5 bg-[#EFF6FF] text-[#3264EB] border border-[#BFDBFE] hidden md:inline ml-1">
            CONSOLE
          </span>
        </div>

        <button
          type="button"
          onClick={onJumpToToday}
          className="flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium border border-[#E2E8F0] bg-[#F2F2F4] hover:bg-[#E9ECEF] text-[#212121] transition-colors cursor-pointer"
          title="Jump to current date (:today)"
        >
          <Compass className="w-3.5 h-3.5 text-[#3264EB]" />
          <span>:today</span>
        </button>

        <button
          type="button"
          onClick={onOpenAddNote}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium bg-[#3264EB] hover:bg-[#2552D0] text-white border border-[#2552D0] transition-colors cursor-pointer"
          title="Create new note (:new)"
        >
          <span>+ :new</span>
        </button>
      </div>

      {/* Mobile Compact Tool Switcher */}
      <div className="flex md:hidden items-center gap-1 shrink-0 font-mono">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="p-1 border border-[#E2E8F0] bg-[#F2F2F4] text-[#757575] hover:text-[#212121] transition-colors cursor-pointer"
            title="Search & Filter (⌘K)"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            const order: DrawingTool[] = ['select', 'pencil', 'arrow', 'eraser'];
            const nextIdx = (order.indexOf(settings.activeTool) + 1) % order.length;
            onUpdateSettings({ activeTool: order[nextIdx] });
          }}
          className={`flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium transition-all border cursor-pointer ${
            settings.activeTool !== 'select'
              ? 'bg-[#3264EB] text-white border-[#2552D0]'
              : 'bg-[#F2F2F4] text-[#212121] border-[#E2E8F0]'
          }`}
          title={`Active tool: ${settings.activeTool} (Tap to change)`}
        >
          {tools.find((t) => t.id === settings.activeTool)?.icon}
          <span className="capitalize text-[11px] hidden sm:inline">{settings.activeTool}</span>
          {settings.activeTool !== 'select' && settings.activeTool !== 'eraser' && (
            <span
              className="w-2 h-2 border border-white/50 shrink-0 ml-0.5"
              style={{ backgroundColor: settings.inkColor }}
            />
          )}
        </button>
      </div>

      {/* Desktop Center: Drawing Tools (TUI square command buttons) */}
      <div className="hidden md:flex items-center gap-1 p-0.5 border border-[#E2E8F0] bg-[#F2F2F4] shrink-0 font-mono text-xs">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onUpdateSettings({ activeTool: t.id })}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium transition-colors cursor-pointer border ${
              settings.activeTool === t.id
                ? 'bg-[#3264EB] text-white border-[#2552D0]'
                : 'text-[#757575] hover:text-[#212121] hover:bg-[#E9ECEF] border-transparent'
            }`}
            title={`${t.label} (${t.shortcut}) — ${t.hint}`}
          >
            {t.icon}
            <span className="text-[11px] font-bold">:{t.shortcut.toLowerCase()}</span>
            <span className="hidden xl:inline text-[11px]">{t.id}</span>
          </button>
        ))}

        {/* Color Palette (visible when drawing tool active) */}
        {settings.activeTool !== 'select' && settings.activeTool !== 'eraser' && (
          <div className="flex items-center gap-1 pl-1.5 ml-1 border-l border-[#E2E8F0]">
            {inkColors.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => onUpdateSettings({ inkColor: c.hex })}
                className={`w-3.5 h-3.5 border transition-transform cursor-pointer ${
                  settings.inkColor === c.hex
                    ? 'scale-110 border-[#212121] ring-1 ring-[#3264EB]'
                    : 'border-transparent opacity-70 hover:opacity-100'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            ))}
          </div>
        )}
      </div>

      {/* Undo & Redo History Controls */}
      {(onUndo || onRedo) && (
        <div className="hidden sm:flex items-center gap-0.5 p-0.5 border border-[#E2E8F0] bg-[#F2F2F4] shrink-0 font-mono">
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`flex items-center gap-1 px-1.5 py-1 text-xs font-mono transition-colors ${
                canUndo
                  ? 'text-[#212121] hover:bg-[#E9ECEF] cursor-pointer'
                  : 'text-[#9E9E9E] opacity-35 cursor-not-allowed'
              }`}
              title="Undo (⌘Z / :u)"
            >
              <Undo className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[10px] font-mono">:u</span>
            </button>
          )}

          {onRedo && (
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`flex items-center gap-1 px-1.5 py-1 text-xs font-mono transition-colors ${
                canRedo
                  ? 'text-[#212121] hover:bg-[#E9ECEF] cursor-pointer'
                  : 'text-[#9E9E9E] opacity-35 cursor-not-allowed'
              }`}
              title="Redo (⌘⇧Z / :r)"
            >
              <Redo className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[10px] font-mono">:r</span>
            </button>
          )}
        </div>
      )}

      {/* Right: Statusline & View Preferences */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 font-mono">
        {/* Mobile: Direct User / Auth Action & More Menu Trigger */}
        <div className="flex md:hidden items-center gap-1.5 font-mono">
          {currentUser ? (
            <button
              type="button"
              onClick={onOpenAccountSettings}
              className="flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium bg-[#F2F2F4] text-[#212121] border border-[#E2E8F0] hover:bg-[#E9ECEF] transition-colors cursor-pointer max-w-[120px]"
              title={`Account & Settings (${currentUser.email})`}
            >
              <User className="w-3.5 h-3.5 text-[#3264EB] shrink-0" />
              <span className="truncate">{currentUser.email.split('@')[0]}</span>
            </button>
          ) : onOpenAuthModal ? (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium bg-[#3264EB] text-white border border-[#2552D0] hover:bg-[#2552D0] transition-colors cursor-pointer"
              title="Sign In / Register"
            >
              <User className="w-3.5 h-3.5 text-white shrink-0" />
              <span>:login</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-1.5 text-[#757575] hover:text-[#212121] bg-[#F2F2F4] hover:bg-[#E9ECEF] border border-[#E2E8F0] transition-colors cursor-pointer"
            title="Options & Settings"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>

        {/* Desktop: Full Controls */}
        <div className="hidden md:flex items-center gap-2 font-mono">
          {/* SQLite Sync Status Indicator */}
          {syncStatus && (
            <button
              type="button"
              onClick={currentUser ? onForceSync : onOpenAuthModal}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono border border-[#E2E8F0] bg-[#F2F2F4] hover:bg-[#E9ECEF] text-[#757575] hover:text-[#212121] transition-colors cursor-pointer"
              title={
                !currentUser
                  ? 'Guest Mode: Local buffer only. Click to sign in.'
                  : syncStatus === 'synced'
                  ? `SQLite Synced ${lastSyncedAt ? `(${new Date(lastSyncedAt).toLocaleTimeString()})` : ''}. Click to re-sync.`
                  : syncStatus === 'syncing'
                  ? 'Syncing changes to SQLite database...'
                  : 'Offline (Buffer saved in browser). Click to retry sync.'
              }
            >
              {syncStatus === 'syncing' ? (
                <RefreshCw className="w-3 h-3 text-[#3264EB] animate-spin" />
              ) : syncStatus === 'synced' ? (
                <Database className="w-3 h-3 text-[#0C67DE]" />
              ) : !currentUser ? (
                <Database className="w-3 h-3 text-[#757575]" />
              ) : (
                <Database className="w-3 h-3 text-[#5E49B0] opacity-70" />
              )}
              <span className="hidden xl:inline">
                {!currentUser
                  ? 'guest'
                  : syncStatus === 'synced'
                  ? 'sqlite:ok'
                  : syncStatus === 'syncing'
                  ? 'syncing...'
                  : 'offline'}
              </span>
            </button>
          )}

          {/* User Account / Auth Pill */}
          {currentUser ? (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono border border-[#E2E8F0] bg-[#F2F2F4] text-[#212121]">
              <button
                type="button"
                onClick={onOpenAccountSettings}
                className="flex items-center gap-1.5 hover:text-[#3264EB] transition-colors cursor-pointer"
                title={`Account & Security Settings (${currentUser.email})`}
              >
                <User className="w-3.5 h-3.5 text-[#3264EB] shrink-0" />
                <span className="max-w-[120px] truncate font-medium">
                  {currentUser.email.split('@')[0]}
                </span>
              </button>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="ml-0.5 text-[#757575] hover:text-[#3264EB] p-0.5 transition-colors cursor-pointer"
                  title="Sign out of account"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              )}
            </div>
          ) : onOpenAuthModal ? (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium border border-[#2552D0] bg-[#3264EB] text-white hover:bg-[#2552D0] transition-colors cursor-pointer"
              title="Sign in or register"
            >
              <User className="w-3 h-3 text-white" />
              <span>:login</span>
            </button>
          ) : null}

          {/* Backup / Export */}
          {onExportBackup && (
            <button
              type="button"
              onClick={onExportBackup}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono border border-[#E2E8F0] bg-[#F2F2F4] hover:bg-[#E9ECEF] text-[#757575] hover:text-[#212121] transition-colors cursor-pointer"
              title="Download full JSON backup of notes & drawings"
            >
              <Download className="w-3 h-3 text-[#757575]" />
              <span className="hidden xl:inline">:export</span>
            </button>
          )}

          {/* Restore / Import */}
          {onImportBackup && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono border border-[#E2E8F0] bg-[#F2F2F4] hover:bg-[#E9ECEF] text-[#757575] hover:text-[#212121] transition-colors cursor-pointer"
                title="Import JSON backup file"
              >
                <Upload className="w-3 h-3 text-[#757575]" />
                <span className="hidden xl:inline">:import</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
            </>
          )}

          {/* Toggle Show Struck / Ledger View */}
          <button
            type="button"
            onClick={() => onUpdateSettings({ showStruckItems: !settings.showStruckItems })}
            className="p-1.5 border border-[#E2E8F0] bg-[#F2F2F4] text-[#757575] hover:text-[#212121] hover:bg-[#E9ECEF] transition-colors cursor-pointer"
            title={settings.showStruckItems ? 'Showing struck items' : 'Hiding struck items'}
          >
            {settings.showStruckItems ? <Eye className="w-4 h-4 text-[#3264EB]" /> : <EyeOff className="w-4 h-4 text-[#9E9E9E]" />}
          </button>

          {/* Week Start Toggle */}
          <button
            type="button"
            onClick={() => onUpdateSettings({ weekStartsOn: settings.weekStartsOn === 0 ? 1 : 0 })}
            className="px-2 py-1 text-[11px] font-mono border border-[#E2E8F0] bg-[#F2F2F4] hover:bg-[#E9ECEF] text-[#757575] hover:text-[#212121] transition-colors cursor-pointer"
            title="Toggle week start day (Sunday vs. Monday)"
          >
            {settings.weekStartsOn === 0 ? 'w:sun' : 'w:mon'}
          </button>

          {/* Search Trigger */}
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono border border-[#E2E8F0] bg-[#F2F2F4] hover:bg-[#E9ECEF] text-[#212121] transition-colors cursor-pointer"
              title="Search notes or filter tags (⌘K / :find)"
            >
              <Search className="w-3.5 h-3.5 text-[#3264EB]" />
              <span className="hidden xl:inline">:find</span>
              <span className="hidden xl:inline text-[10px] px-1 py-0.2 border text-[#757575] bg-white border-[#E2E8F0]">⌘K</span>
            </button>
          )}

          {/* Active Filter Pill */}
          {activeFilter && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 border border-[#BFDBFE] bg-[#EFF6FF] text-[#3264EB] text-xs font-mono animate-in fade-in">
              <span className="font-semibold max-w-[120px] truncate">{activeFilter}</span>
              {onClearFilter && (
                <button
                  type="button"
                  onClick={onClearFilter}
                  className="p-0.5 hover:bg-[#DBEAFE] transition-colors cursor-pointer"
                  title="Clear filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Tag Prototypes & Stationery Settings */}
          {onOpenTagSettings && (
            <button
              type="button"
              onClick={onOpenTagSettings}
              className="flex items-center gap-1 px-2 py-1 text-xs font-mono border border-[#E2E8F0] bg-[#F2F2F4] hover:bg-[#E9ECEF] text-[#757575] hover:text-[#212121] transition-colors cursor-pointer"
              title="Tag prototypes (:tags)"
            >
              <TagIcon className="w-3.5 h-3.5 text-[#5E49B0]" />
              <span className="hidden xl:inline">:tags</span>
            </button>
          )}

          {/* Continuous Month Calendar Toggle */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium border transition-colors cursor-pointer ${
              isSidebarOpen
                ? 'bg-[#3264EB] text-white border-[#2552D0]'
                : 'bg-[#F2F2F4] hover:bg-[#E9ECEF] text-[#212121] border-[#E2E8F0]'
            }`}
            title="Toggle Continuous Month Calendar (:months)"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">:months</span>
          </button>
        </div>
      </div>

      {/* Mobile Options Modal / Bottom Sheet: Portaled directly to document.body
          so the header's backdrop-filter does not create a containing block that traps
          and clips fixed-position modals inside the 48px header. */}
      {isMobileMenuOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end justify-center animate-in fade-in duration-150"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div
              className="w-full max-w-lg max-h-[85vh] overflow-y-auto border-t-2 border-[#3264EB] shadow-2xl p-4 flex flex-col gap-3 animate-in slide-in-from-bottom duration-200 bg-[#FAFAFA] text-[#212121] font-mono"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-2">
                <span className="font-bold text-sm font-mono text-[#212121] flex items-center gap-1.5">
                  <span className="text-[#3264EB]">&gt;</span> :settings
                </span>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 text-[#757575] hover:text-[#212121] transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Theme Mode Selector Row */}
              <div className={`flex items-center justify-between p-2.5 rounded-lg border ${
                isLupine ? 'bg-[#F2F2F4] border-[#E2E8F0]' : 'bg-[#F2EDE4]/60 border-[#E5DFD5]'
              }`}>
                <span className="text-xs font-mono font-medium">Theme Mode</span>
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ themeMode: 'lupine' })}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      isLupine
                        ? 'bg-[#3264EB] text-white font-bold shadow-xs'
                        : 'text-[#757575] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    Lupine
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ themeMode: 'paper' })}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      !isLupine
                        ? 'bg-[#2B2C30] text-[#FAF8F5] font-bold shadow-xs'
                        : 'text-[#757575] hover:bg-[#E2E8F0]'
                    }`}
                  >
                    Paper
                  </button>
                </div>
              </div>

              {/* Account / Sync Row */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F2EDE4]/60 border border-[#E5DFD5]">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[#2B2C30]" />
                  {currentUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenAccountSettings?.();
                        setIsMobileMenuOpen(false);
                      }}
                      className="text-xs font-mono font-medium text-[#2B2C30] hover:underline truncate max-w-[180px] text-left cursor-pointer"
                      title="Open Account Settings"
                    >
                      {currentUser.email}
                    </button>
                  ) : (
                    <span className="text-xs font-mono font-medium text-[#2B2C30] truncate max-w-[200px]">
                      Guest Mode (Local Only)
                    </span>
                  )}
                </div>
                {currentUser ? (
                  onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        onLogout();
                        setIsMobileMenuOpen(false);
                      }}
                      className="text-xs font-mono text-[#D23B38] hover:underline font-bold cursor-pointer"
                    >
                      Sign Out
                    </button>
                  )
                ) : (
                  onOpenAuthModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenAuthModal();
                        setIsMobileMenuOpen(false);
                      }}
                      className="text-xs font-mono font-bold text-[#2B2C30] underline cursor-pointer"
                    >
                      Sign In
                    </button>
                  )
                )}
              </div>

              {/* Drawing Color Selector */}
              {settings.activeTool !== 'select' && settings.activeTool !== 'eraser' && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F2EDE4]/60 border border-[#E5DFD5]">
                  <span className="text-xs font-mono text-[#6B6C72]">Ink Color</span>
                  <div className="flex items-center gap-2">
                    {inkColors.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => onUpdateSettings({ inkColor: c.hex })}
                        className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                          settings.inkColor === c.hex
                            ? 'scale-125 ring-2 ring-offset-1 ring-[#2B2C30]'
                            : 'opacity-70'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                {/* Tag Settings */}
                {onOpenTagSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenTagSettings();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-[#E5DFD5] bg-white/70 hover:bg-[#F2EDE4] transition-colors cursor-pointer"
                  >
                    <span>Tag Settings</span>
                    <TagIcon className="w-3.5 h-3.5 text-[#6B6C72]" />
                  </button>
                )}

                {/* Search */}
                {onOpenSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSearch();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-[#E5DFD5] bg-white/70 hover:bg-[#F2EDE4] transition-colors cursor-pointer"
                  >
                    <span>Search Notes</span>
                    <Search className="w-3.5 h-3.5 text-[#6B6C72]" />
                  </button>
                )}

                {/* Show Struck Items */}
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ showStruckItems: !settings.showStruckItems })}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[#E5DFD5] bg-white/70 hover:bg-[#F2EDE4] transition-colors cursor-pointer"
                >
                  <span>Struck Items</span>
                  {settings.showStruckItems ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-[#A19D94]" />}
                </button>

                {/* Week Starts On */}
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ weekStartsOn: settings.weekStartsOn === 0 ? 1 : 0 })}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[#E5DFD5] bg-white/70 hover:bg-[#F2EDE4] transition-colors cursor-pointer"
                >
                  <span>Start Day</span>
                  <span className="font-bold">{settings.weekStartsOn === 0 ? 'Sun' : 'Mon'}</span>
                </button>

                {/* Undo */}
                <button
                  type="button"
                  onClick={() => onUndo?.()}
                  disabled={!canUndo}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[#E5DFD5] bg-white/70 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <span>Undo</span>
                  <Undo className="w-3.5 h-3.5" />
                </button>

                {/* Redo */}
                <button
                  type="button"
                  onClick={() => onRedo?.()}
                  disabled={!canRedo}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[#E5DFD5] bg-white/70 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <span>Redo</span>
                  <Redo className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Backup & Restore */}
              <div className="flex items-center gap-2 pt-1">
                {onExportBackup && (
                  <button
                    type="button"
                    onClick={() => {
                      onExportBackup();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[#E5DFD5] bg-white/70 text-xs font-mono text-[#6B6C72] hover:text-[#2B2C30] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Backup</span>
                  </button>
                )}
                {onImportBackup && (
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-[#E5DFD5] bg-white/70 text-xs font-mono text-[#6B6C72] hover:text-[#2B2C30] cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import Backup</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
};
