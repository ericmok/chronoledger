# ChronoLedger

A calendar and personal ledger that treats time as a continuous surface rather than discrete boxes.

---

Most digital tools divide time into pages: a month grid, a week column, an isolated day view. When a month ends, the next begins on an empty screen, disconnecting today from yesterday. When an entry is revised, the previous thought vanishes without a trace.

ChronoLedger approaches scheduling and note-keeping more like a paper scroll or an open ledger book. Days flow vertically without page turns. Notes carry light annotations that settle quietly into the margin. When an entry is edited, the older words remain crossed out in soft ink until you choose to clean the revision.

![ChronoLedger Demo Screenshot](docs/assets/chronoledger-demo.png)

---

## Observations on the Design

### The Continuous Timeline
Days and weeks follow one another down the page. Rather than flipping between separate calendar screens, you scroll through time as an unbroken column. Subtle separator lines mark seven-day weeks, giving structure to the flow without partitioning it.

### The Month Radar
Along the right margin sits an interlocking jigsaw grid of months. It provides long-range orientation, allowing you to sense the shape of the year and jump between seasons without losing your place on the timeline.

### Seasonal Palettes
As the calendar rolls through the year, the interface gently transitions through four muted seasonal palettes:
- **Spring (March – May)**: Faint sage and mint greens.
- **Summer (June – August)**: Warm ambers and pale yellows.
- **Autumn (September – November)**: Soft terracotta and rust tones.
- **Winter (December – February)**: Muted slate blues and cool grays.

These ambient tints appear in the radar and section headers, giving a quiet sense of the passing year.

### Notes Across Horizons
Plans naturally exist at different scales:
- **Daily Notes**: Observations, tasks, and appointments attached directly to a date.
- **Weekly Focus**: Notes that belong to a seven-day span rather than a single afternoon.
- **Monthly Reflections**: Broader themes and ongoing intentions set beside the month radar.

All notes carry a subtle grip icon on hover for reordering.

### Plaintext Annotations
Typing `@` anywhere in a note opens an autocomplete menu for common categories drawing from a canonical palette:
- `@todo`: Actionable items (Green).
- `@important`: High-priority items that warrant bolder weight (Red).
- `@wait`: Things dependent on someone else or an external blocker (Orange).
- `@celebrate`: Gatherings, birthdays, and milestones (Yellow).
- `@explore`: Research or open questions (Purple).
- `@thought`: Ideas, observations, and reflections (Blue).
- `@4:00pm` / `@10:30am`: Scheduled times and appointments (Teal).
- `@failed`: Unsuccessful or rejected tasks (Muted Red).
- `@skipped`: Tasks left behind or postponed (Light Gray).
- Custom tags (e.g., `@reading`, `@finance`) receive a neutral gray chip and dynamic contrast text.

Leading tags fuse into the left margin of the note card, absorbing the bullet dot so the text aligns cleanly. Clicking any badge toggles its resolution (`@todo` $\leftrightarrow$ `~~@todo~~`), rendering the tag in a warm muted tone without disturbing the sentence.

### Visible Revisions and the Ledger Metaphor
In an ink notebook, corrections are crossed out with a single stroke, preserving the context of earlier plans. ChronoLedger follows this habit:
- Editing a note strikes through deleted words in muted red and highlights new words in soft green.
- Newly added tags tilt slightly ($-3^\circ$) like a taped paper label rather than using jarring `+` symbols.
- Deleted tags are displayed with reduced opacity and a strikethrough, without unnecessary minus signs.
- When a note is hovered or focused, a small eraser icon button appears beside the revisions, allowing you to clean the scribbles and finalize the text whenever you are ready.

*A detailed explanation of anchor fusing, diff algorithms, and tag semantics can be found in [docs/ANNOTATIONS_AND_DIFFS.md](docs/ANNOTATIONS_AND_DIFFS.md).*

### Marginalia and Hand-Drawn Marks
Some thoughts are best recorded informally:
- **Pencil (`P`)**: Freehand sketching in the margins and across days using pressure-sensitive ink lines.
- **Timeline Arrow (`A`)**: Drawing curved lines between dates to indicate spans, deadlines, or dependencies.
- **Circled Dates**: Double-clicking any date number draws a hand-drawn circle around it, resembling pen on paper.
- **Eraser (`E`)**: Gently brushing over sketched marks to lift them from the page.

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `⌘Z` / `Ctrl+Z` | Undo last action |
| `⌘⇧Z` / `Ctrl+Shift+Z` | Redo action |
| `T` | Return to Today |
| `M` | Toggle Month Radar sidebar |
| `V` | Pointer / select tool |
| `P` | Pencil tool |
| `A` | Timeline arrow tool |
| `E` | Eraser tool |

---

## Architecture and Persistence

The application is written with React 19 and TypeScript, using Tailwind CSS and TanStack Virtual for smooth rendering across long timelines.

### Dual-Layer Storage
1. **Local Storage**: Every edit, note, and drawing is written immediately to browser storage so work is not lost if a tab closes.
2. **Embedded SQLite**: Changes are synchronized in the background to an embedded SQLite database (`data/chronoledger.sqlite`) using Node's built-in `node:sqlite` engine with Write-Ahead Logging (`WAL`).

### Backup and Portability
The header includes simple **Export** and **Import** options for saving and restoring your calendar as a plain JSON file.

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm

### Development
```bash
git clone git@github.com:ericmok/chronoledger.git
cd chronoledger
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building
```bash
npm run build
```

### Running Locally with the Built-in Server
```bash
npm start
# Server listens on port 3000 (or PORT env variable)
```

### Docker
```bash
docker compose up -d
```

Visit `http://localhost:3000`.

---

## License

MIT
