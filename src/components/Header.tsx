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
    // Rigid flex sibling header. flex-none ensures exactly 48px height.
    <header className="flex-none shrink-0 w-full z-30 h-12 border-b border-canvas-border bg-canvas/95 backdrop-blur-sm text-ink px-3 sm:px-4 flex items-center justify-between transition-colors">
      {/* Left: Branding, Today & New */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="flex items-center gap-2 text-sm sm:text-base font-bold tracking-tight text-ink font-ui">
          <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" />
          <span className="hidden sm:inline">ChronoLedger</span>
        </div>

        <button
          type="button"
          onClick={onJumpToToday}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-btn border border-canvas-border bg-canvas-subtle hover:bg-canvas-subtle-hover text-ink transition-colors cursor-pointer"
          title="Jump to current date"
        >
          <Compass className="w-3.5 h-3.5 text-accent" />
          <span>Today</span>
        </button>

        <button
          type="button"
          onClick={onOpenAddNote}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded-btn bg-accent hover:bg-accent-hover text-accent-fg transition-colors cursor-pointer"
          title="Create new note"
        >
          <span>+ New</span>
        </button>
      </div>

      {/* Mobile Compact Tool Switcher */}
      <div className="flex md:hidden items-center gap-1 shrink-0 font-mono">
        {onOpenSearch && (
          <button
            type="button"
            onClick={onOpenSearch}
            className="p-1 border border-canvas-border bg-canvas-subtle text-ink-secondary hover:text-ink rounded-btn transition-colors cursor-pointer"
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
          className={`flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium rounded-btn transition-all border cursor-pointer ${
            settings.activeTool !== 'select'
              ? 'bg-accent text-accent-fg border-accent'
              : 'bg-canvas-subtle text-ink border-canvas-border'
          }`}
          title={`Active tool: ${settings.activeTool} (Tap to change)`}
        >
          {tools.find((t) => t.id === settings.activeTool)?.icon}
          <span className="capitalize text-[11px] hidden sm:inline">{settings.activeTool}</span>
          {settings.activeTool !== 'select' && settings.activeTool !== 'eraser' && (
            <span
              className="w-2 h-2 rounded-badge border border-white/50 shrink-0 ml-0.5"
              style={{ backgroundColor: settings.inkColor }}
            />
          )}
        </button>
      </div>

      {/* Desktop Center: Drawing Tools */}
      <div className="hidden md:flex items-center gap-1 p-0.5 border border-canvas-border bg-canvas-subtle rounded-btn shrink-0 text-xs font-ui">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onUpdateSettings({ activeTool: t.id })}
            className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-btn transition-colors cursor-pointer border ${
              settings.activeTool === t.id
                ? 'bg-accent text-accent-fg border-accent'
                : 'text-ink-secondary hover:text-ink hover:bg-canvas-subtle-hover border-transparent'
            }`}
            title={`${t.label} (${t.shortcut}) — ${t.hint}`}
          >
            {t.icon}
            <span className="text-[11px] font-bold">{t.shortcut}</span>
            <span className="hidden xl:inline text-[11px]">{t.id}</span>
          </button>
        ))}

        {/* Color Palette (visible when drawing tool active) */}
        {settings.activeTool !== 'select' && settings.activeTool !== 'eraser' && (
          <div className="flex items-center gap-1 pl-1.5 ml-1 border-l border-canvas-border">
            {inkColors.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => onUpdateSettings({ inkColor: c.hex })}
                className={`w-3.5 h-3.5 rounded-badge border transition-transform cursor-pointer ${
                  settings.inkColor === c.hex
                    ? 'scale-110 border-ink ring-1 ring-accent'
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
        <div className="hidden sm:flex items-center gap-0.5 p-0.5 border border-canvas-border bg-canvas-subtle rounded-btn shrink-0">
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={`flex items-center gap-1 px-1.5 py-1 text-xs rounded-btn transition-colors ${
                canUndo
                  ? 'text-ink hover:bg-canvas-subtle-hover cursor-pointer'
                  : 'text-ink-strike opacity-35 cursor-not-allowed'
              }`}
              title="Undo (⌘Z)"
            >
              <Undo className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[10px] font-mono">Undo</span>
            </button>
          )}

          {onRedo && (
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={`flex items-center gap-1 px-1.5 py-1 text-xs rounded-btn transition-colors ${
                canRedo
                  ? 'text-ink hover:bg-canvas-subtle-hover cursor-pointer'
                  : 'text-ink-strike opacity-35 cursor-not-allowed'
              }`}
              title="Redo (⌘⇧Z)"
            >
              <Redo className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[10px] font-mono">Redo</span>
            </button>
          )}
        </div>
      )}

      {/* Right: Controls & View Preferences */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 font-mono">
        {/* Mobile: Direct User / Auth Action & More Menu Trigger */}
        <div className="flex md:hidden items-center gap-1.5 font-mono">
          {currentUser ? (
            <button
              type="button"
              onClick={onOpenAccountSettings}
              className="flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium bg-canvas-subtle text-ink border border-canvas-border hover:bg-canvas-subtle-hover rounded-btn transition-colors cursor-pointer max-w-[120px]"
              title={`Account & Settings (${currentUser.email})`}
            >
              <User className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate">{currentUser.email.split('@')[0]}</span>
            </button>
          ) : onOpenAuthModal ? (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1 px-2 py-1 text-xs font-mono font-medium bg-accent text-accent-fg border border-accent hover:bg-accent-hover rounded-btn transition-colors cursor-pointer"
              title="Sign In / Register"
            >
              <User className="w-3.5 h-3.5 text-accent-fg shrink-0" />
              <span>Sign In</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-1.5 text-ink-secondary hover:text-ink bg-canvas-subtle hover:bg-canvas-subtle-hover border border-canvas-border rounded-btn transition-colors cursor-pointer"
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
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono border border-canvas-border bg-canvas-subtle hover:bg-canvas-subtle-hover text-ink-secondary hover:text-ink rounded-btn transition-colors cursor-pointer"
              title={
                !currentUser
                  ? 'Guest Mode: Local storage only. Click to sign in.'
                  : syncStatus === 'synced'
                  ? `SQLite Synced ${lastSyncedAt ? `(${new Date(lastSyncedAt).toLocaleTimeString()})` : ''}. Click to re-sync.`
                  : syncStatus === 'syncing'
                  ? 'Syncing changes to SQLite database...'
                  : 'Offline (Saved in browser). Click to retry sync.'
              }
            >
              {syncStatus === 'syncing' ? (
                <RefreshCw className="w-3 h-3 text-accent animate-spin" />
              ) : (
                <Database className="w-3 h-3 text-accent" />
              )}
              <span className="hidden xl:inline">
                {!currentUser
                  ? 'Guest'
                  : syncStatus === 'synced'
                  ? 'Synced'
                  : syncStatus === 'syncing'
                  ? 'Syncing...'
                  : 'Offline'}
              </span>
            </button>
          )}

          {/* User Account / Auth Pill */}
          {currentUser ? (
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono border border-canvas-border bg-canvas-subtle text-ink rounded-btn">
              <button
                type="button"
                onClick={onOpenAccountSettings}
                className="flex items-center gap-1.5 hover:text-accent transition-colors cursor-pointer"
                title={`Account & Security Settings (${currentUser.email})`}
              >
                <User className="w-3.5 h-3.5 text-accent shrink-0" />
                <span className="max-w-[120px] truncate font-medium">
                  {currentUser.email.split('@')[0]}
                </span>
              </button>
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="ml-0.5 text-ink-secondary hover:text-accent p-0.5 transition-colors cursor-pointer"
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
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-medium border border-accent bg-accent text-accent-fg hover:bg-accent-hover rounded-btn transition-colors cursor-pointer"
              title="Sign in or register"
            >
              <User className="w-3 h-3 text-accent-fg" />
              <span>Sign In</span>
            </button>
          ) : null}

          {/* Backup / Export */}
          {onExportBackup && (
            <button
              type="button"
              onClick={onExportBackup}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono border border-canvas-border bg-canvas-subtle hover:bg-canvas-subtle-hover text-ink-secondary hover:text-ink rounded-btn transition-colors cursor-pointer"
              title="Download full JSON backup of notes & drawings"
            >
              <Download className="w-3 h-3 text-ink-secondary" />
              <span className="hidden xl:inline">Export</span>
            </button>
          )}

          {/* Restore / Import */}
          {onImportBackup && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono border border-canvas-border bg-canvas-subtle hover:bg-canvas-subtle-hover text-ink-secondary hover:text-ink rounded-btn transition-colors cursor-pointer"
                title="Import JSON backup file"
              >
                <Upload className="w-3 h-3 text-ink-secondary" />
                <span className="hidden xl:inline">Import</span>
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
            className="p-1.5 border border-canvas-border bg-canvas-subtle text-ink-secondary hover:text-ink hover:bg-canvas-subtle-hover rounded-btn transition-colors cursor-pointer"
            title={settings.showStruckItems ? 'Showing struck items' : 'Hiding struck items'}
          >
            {settings.showStruckItems ? <Eye className="w-4 h-4 text-accent" /> : <EyeOff className="w-4 h-4 text-ink-strike" />}
          </button>

          {/* Theme Selector Toggle */}
          <button
            type="button"
            onClick={() => onUpdateSettings({ themeMode: isLupine ? 'paper' : 'lupine' })}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono rounded-btn border border-canvas-border bg-canvas-subtle hover:bg-canvas-subtle-hover text-ink transition-colors cursor-pointer"
            title={`Active Theme: ${settings.themeMode || 'paper'}. Click to toggle.`}
          >
            <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
            <span className="capitalize">{settings.themeMode || 'paper'}</span>
          </button>

          {/* Week Start Toggle */}
          <button
            type="button"
            onClick={() => onUpdateSettings({ weekStartsOn: settings.weekStartsOn === 0 ? 1 : 0 })}
            className="px-2 py-1 text-[11px] font-mono border border-canvas-border bg-canvas-subtle hover:bg-canvas-subtle-hover text-ink-secondary hover:text-ink rounded-btn transition-colors cursor-pointer"
            title="Toggle week start day (Sunday vs. Monday)"
          >
            {settings.weekStartsOn === 0 ? 'Sun' : 'Mon'}
          </button>

          {/* Search Trigger */}
          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono border border-canvas-border bg-canvas-subtle hover:bg-canvas-subtle-hover text-ink rounded-btn transition-colors cursor-pointer"
              title="Search notes or filter tags (⌘K)"
            >
              <Search className="w-3.5 h-3.5 text-accent" />
              <span className="hidden xl:inline">Search</span>
              <span className="hidden xl:inline text-[10px] px-1 py-0.2 border border-canvas-border bg-canvas rounded-badge text-ink-secondary">⌘K</span>
            </button>
          )}

          {/* Active Filter Pill */}
          {activeFilter && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 border border-accent/40 bg-accent/10 text-accent text-xs font-mono rounded-btn animate-in fade-in">
              <span className="font-semibold max-w-[120px] truncate">{activeFilter}</span>
              {onClearFilter && (
                <button
                  type="button"
                  onClick={onClearFilter}
                  className="p-0.5 hover:bg-accent/20 rounded-badge transition-colors cursor-pointer"
                  title="Clear filter"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Tag Prototypes Settings */}
          {onOpenTagSettings && (
            <button
              type="button"
              onClick={onOpenTagSettings}
              className="flex items-center gap-1 px-2 py-1 text-xs font-mono border border-canvas-border bg-canvas-subtle hover:bg-canvas-subtle-hover text-ink-secondary hover:text-ink rounded-btn transition-colors cursor-pointer"
              title="Tag prototypes"
            >
              <TagIcon className="w-3.5 h-3.5 text-accent" />
              <span className="hidden xl:inline">Tags</span>
            </button>
          )}

          {/* Continuous Month Calendar Toggle */}
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-btn border transition-colors cursor-pointer ${
              isSidebarOpen
                ? 'bg-accent text-accent-fg border-accent'
                : 'bg-canvas-subtle hover:bg-canvas-subtle-hover text-ink border-canvas-border'
            }`}
            title="Toggle Continuous Month Calendar"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Months</span>
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
              className="w-full max-w-lg max-h-[85vh] overflow-y-auto border-t-2 border-accent shadow-2xl p-4 flex flex-col gap-3 animate-in slide-in-from-bottom duration-200 bg-canvas text-ink font-ui rounded-box"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-canvas-border pb-2">
                <span className="font-bold text-sm text-ink flex items-center gap-1.5 font-ui">
                  <span className="w-2 h-2 rounded-full bg-accent" /> Settings
                </span>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 text-ink-secondary hover:text-ink transition-colors cursor-pointer rounded-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Theme Mode Selector Row */}
              <div className="flex items-center justify-between p-2.5 rounded-btn border border-canvas-border bg-canvas-subtle">
                <span className="text-xs font-mono font-medium">Theme</span>
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ themeMode: 'lupine' })}
                    className={`px-2.5 py-1 rounded-btn transition-colors cursor-pointer ${
                      isLupine
                        ? 'bg-accent text-accent-fg font-bold shadow-xs'
                        : 'text-ink-secondary hover:bg-canvas-subtle-hover'
                    }`}
                  >
                    Lupine
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ themeMode: 'paper' })}
                    className={`px-2.5 py-1 rounded-btn transition-colors cursor-pointer ${
                      !isLupine
                        ? 'bg-accent text-accent-fg font-bold shadow-xs'
                        : 'text-ink-secondary hover:bg-canvas-subtle-hover'
                    }`}
                  >
                    Paper
                  </button>
                </div>
              </div>

              {/* Account / Sync Row */}
              <div className="flex items-center justify-between p-2.5 rounded-btn bg-canvas-subtle border border-canvas-border">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-accent" />
                  {currentUser ? (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenAccountSettings?.();
                        setIsMobileMenuOpen(false);
                      }}
                      className="text-xs font-mono font-medium text-ink hover:underline truncate max-w-[180px] text-left cursor-pointer"
                      title="Open Account Settings"
                    >
                      {currentUser.email}
                    </button>
                  ) : (
                    <span className="text-xs font-mono font-medium text-ink-secondary truncate max-w-[200px]">
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
                      className="text-xs font-mono text-accent hover:underline font-bold cursor-pointer"
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
                      className="text-xs font-mono font-bold text-accent underline cursor-pointer"
                    >
                      Sign In
                    </button>
                  )
                )}
              </div>

              {/* Drawing Color Selector */}
              {settings.activeTool !== 'select' && settings.activeTool !== 'eraser' && (
                <div className="flex items-center justify-between p-2.5 rounded-btn bg-canvas-subtle border border-canvas-border">
                  <span className="text-xs font-mono text-ink-secondary">Color</span>
                  <div className="flex items-center gap-2">
                    {inkColors.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => onUpdateSettings({ inkColor: c.hex })}
                        className={`w-5 h-5 rounded-full transition-transform cursor-pointer ${
                          settings.inkColor === c.hex
                            ? 'scale-125 ring-2 ring-offset-1 ring-accent'
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
                    className="flex items-center justify-between p-2.5 rounded-btn border border-canvas-border bg-canvas hover:bg-canvas-subtle transition-colors cursor-pointer"
                  >
                    <span>Tag Settings</span>
                    <TagIcon className="w-3.5 h-3.5 text-ink-secondary" />
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
                    className="flex items-center justify-between p-2.5 rounded-btn border border-canvas-border bg-canvas hover:bg-canvas-subtle transition-colors cursor-pointer"
                  >
                    <span>Search Notes</span>
                    <Search className="w-3.5 h-3.5 text-ink-secondary" />
                  </button>
                )}

                {/* Show Struck Items */}
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ showStruckItems: !settings.showStruckItems })}
                  className="flex items-center justify-between p-2.5 rounded-btn border border-canvas-border bg-canvas hover:bg-canvas-subtle transition-colors cursor-pointer"
                >
                  <span>Struck Items</span>
                  {settings.showStruckItems ? <Eye className="w-3.5 h-3.5 text-accent" /> : <EyeOff className="w-3.5 h-3.5 text-ink-strike" />}
                </button>

                {/* Week Starts On */}
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ weekStartsOn: settings.weekStartsOn === 0 ? 1 : 0 })}
                  className="flex items-center justify-between p-2.5 rounded-btn border border-canvas-border bg-canvas hover:bg-canvas-subtle transition-colors cursor-pointer"
                >
                  <span>Start Day</span>
                  <span className="font-bold">{settings.weekStartsOn === 0 ? 'Sun' : 'Mon'}</span>
                </button>

                {/* Undo */}
                <button
                  type="button"
                  onClick={() => onUndo?.()}
                  disabled={!canUndo}
                  className="flex items-center justify-between p-2.5 rounded-btn border border-canvas-border bg-canvas disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <span>Undo</span>
                  <Undo className="w-3.5 h-3.5" />
                </button>

                {/* Redo */}
                <button
                  type="button"
                  onClick={() => onRedo?.()}
                  disabled={!canRedo}
                  className="flex items-center justify-between p-2.5 rounded-btn border border-canvas-border bg-canvas disabled:opacity-40 transition-colors cursor-pointer"
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
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-btn border border-canvas-border bg-canvas text-xs font-mono text-ink-secondary hover:text-ink cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export</span>
                  </button>
                )}
                {onImportBackup && (
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-btn border border-canvas-border bg-canvas text-xs font-mono text-ink-secondary hover:text-ink cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import</span>
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
