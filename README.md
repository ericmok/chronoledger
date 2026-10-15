# ChronoLedger

> **Tactile, continuous analog calendar & visual ledger designed for clarity, flow, and focus.**

ChronoLedger blends the continuous spatial awareness of physical wall scrolls and stationery planners with modern digital flexibility. It reimagines traditional grid calendars into an infinite vertical timeline paired with an interconnected month jigsaw radar and freeform margin markup tools.

---

## ✨ Features

- **Infinite Vertical Timeline**: Continuous paper roll displaying months and weeks without artificial page boundaries. Seamlessly scroll across months and years.
- **Continuous Jigsaw Month Radar**: A connected spatial month overview on the right sidebar for long-range planning, jump navigation, and multi-month visualization.
- **Three-Tier Note Hierarchy**:
  - **Day Notes**: Padded quick-entry inputs and sticky note items attached directly to dates.
  - **Week Notes**: Dedicated weekly focus objectives with quick-entry headers and container double-click.
  - **Month Notes**: Long-term monthly notes anchored in the margin gutter and jigsaw radar.
- **Visual Revision Diffs**:
  - Double-click any note to edit in-place.
  - Deleted words are struck through in low-opacity red ink.
  - Newly added words appear in green.
  - Completely emptied notes display as crossed-out tasks with a deleted status tag.
- **Freeform Margin & Markup Tools**:
  - **Pencil (`P`)**: Natural pressure-sensitive freehand sketching in margins and across days using RoughJS and Perfect-Freehand.
  - **Circle Date (`C`)**: Hand-drawn style circular highlights to ring milestone dates.
  - **Timeline Arrow (`A`)**: Drag between two dates across days or weeks to visually link projects and deadlines.
  - **Continuous Painting Eraser (`E`)**: Real-time hit-testing eraser that lets you brush naturally over strokes to remove them.
- **Full History Engine (Undo / Redo)**:
  - `⌘Z` / `Ctrl+Z` to undo actions (note deletions, edits, strikethroughs, sketches, erasures).
  - `⌘⇧Z` / `Ctrl+Shift+Z` / `Ctrl+Y` to redo.
  - Native browser undo is fully preserved when typing inside text boxes.
- **Embedded SQLite Database Auto-Sync (`data/chronoledger.sqlite`)**:
  - Live atomic synchronization between browser and disk-persisted SQLite database.
  - High-performance WAL (Write-Ahead Logging) mode and transactional batch writes.
  - Offline-first dual-layer storage: instant browser `localStorage` plus debounced background SQLite commit.
  - Tactile visual sync status badge in the header indicating live sync state and timestamp.
- **Zero-Dependency Production Server & Docker Support**:
  - Ready for local deployment or containerized hosting with Docker and Docker Compose.
  - Built-in zero-dependency Node.js HTTP server.
  - Full JSON backup export and import for data portability and privacy.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `⌘Z` / `Ctrl+Z` | Undo last action (delete, edit, strike, drawing) |
| `⌘⇧Z` / `Ctrl+Shift+Z` / `Ctrl+Y` | Redo action |
| `T` | Jump to Today |
| `M` | Toggle Month Radar Sidebar |
| `V` | Select / Note Pointer Tool |
| `P` | Pencil Sketching Tool |
| `C` | Circle Date Tool |
| `A` | Timeline Arrow Tool |
| `E` | Continuous Painting Eraser |

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### Development

```bash
# Clone the repository
git clone git@github.com:ericmok/chronoledger.git
cd chronoledger

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```bash
npm run build
```

### Running the Standalone Production Server

ChronoLedger comes with a lightweight, zero-dependency Node.js static server:

```bash
npm start
# Server listens on port 3000 (or PORT env variable)
```

### Docker Deployment

```bash
docker compose up -d
```

Access the app on `http://localhost:3000`.

---

## 🛠️ Architecture

- **React 19 & TypeScript**: Fully typed component hierarchy with modular separation:
  - `src/components/VerticalCalendar.tsx`: Infinite timeline canvas.
  - `src/components/DayRow.tsx`: Date row with weekday badges, today highlighting, and note list.
  - `src/components/WeekFocusPanel.tsx`: Dedicated week ledger and objectives.
  - `src/components/JigsawMonthGrid.tsx`: Interlocking month grid radar.
  - `src/components/DrawingCanvas.tsx`: SVG vector layer for RoughJS sketches, arrows, and circles.
- **Storage & Database Layer**:
  - `server/db.js`: Embedded SQLite database driver powered by Node's built-in `node:sqlite`. Provides WAL mode, transactional writes, and schema tables (`notes`, `week_notes`, `month_notes`, `drawings`, `settings`, `metadata`).
  - `src/services/storage.ts`: Dual-layer storage manager handling instant `localStorage` caching, REST API communication, and JSON backup export/import.
- **State Management**:
  - `src/hooks/useCalendarState.ts`: History stack snapshots, mutation debouncing, tool configuration, and live SQLite database synchronization.

---

## 🛡️ Data Persistence & Safeguards

ChronoLedger implements a multi-tier, zero-loss persistence and synchronization architecture designed to keep user notes, goals, and margin sketches safe at all times:

### 1. Dual-Layer Storage
- **Tier 1 (Instant Local Storage)**: Every note addition, edit, strikethrough, or sketch is written synchronously to browser `localStorage`. You never lose work if the network drops or the tab closes abruptly.
- **Tier 2 (Embedded SQLite with WAL)**: Mutations are debounced (600ms) and committed atomically to an embedded SQLite database at `data/chronoledger.sqlite` using Node's native `node:sqlite` engine with Write-Ahead Logging (`PRAGMA journal_mode = WAL;`).

### 2. Non-Destructive Safe Merging (`safeMerge`)
- During application startup / hydration, the client does **not** blindly overwrite local notes with remote data.
- Instead, collections are merged non-destructively:
  - Items existing only in local storage are preserved and queued to sync to SQLite.
  - Items existing only in SQLite are adopted.
  - Items existing in both sources resolve conflicts using the newest `updatedAt` / `createdAt` timestamp.
- This ensures offline edits or notes entered before sync initialization are never dropped.

### 3. Emergency Recovery Snapshots
- Before any remote sync transaction runs during hydration, ChronoLedger automatically saves an emergency pre-sync snapshot to `chrono_ledger_recovery_snapshot_v1` in browser storage.
- **Console Disaster Recovery**: If you ever need to restore your pre-sync state immediately, open the browser developer console and run:
  ```javascript
  __chronoledger_restore_snapshot()
  ```
  This immediately recovers all notes, drawings, and settings from the recovery snapshot.

### 4. Backup Export & Import
- Use the **Export** button in the header to download an unencrypted, fully portable JSON snapshot (`chronoledger-backup-YYYY-MM-DD.json`).
- Use the **Import** button to restore from any backup file at any time.

---

## 📄 License

MIT
