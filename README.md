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

## 📄 License

MIT
