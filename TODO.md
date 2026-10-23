# ChronoLedger Roadmap & Feature Backlog

## 🏹 Feature: Cross-Horizon Semantic Arrows & Unified Connector Overlay

### Overview
Enable drawn arrows to connect notes across different temporal horizons (Day ↔ Week, and Day ↔ Month). Implement **Non-Destructive Association**: when a note is moved across horizons (e.g., from a Day into a Month reflection), any arrows attached to it are **not destroyed**; they enter a **Suspended / Dormant** state in the database and automatically reconnect when the note returns to the execution timeline.

---

### Implementation Scope & Mechanics

1. **Non-Destructive Arrow Lifecycle**
   - **Active (Connected)**: Both endpoints live in the active timeline (Day or Week). The arrow dynamically renders a curved Rough.js Bézier line with anchor dots pinned to `[data-note-id]`.
   - **Suspended (Dormant)**: When a connected note moves to Month Notes (or outside the timeline canvas):
     - The drawing record remains safely persisted in SQLite and client state (`drawings: DrawingElement[]`).
     - In the timeline UI: The arrow gracefully steps aside (hidden, or rendered as a subtle dashed margin stub `↗ [Oct Goals]`).
   - **Re-Activation (Restoration)**: When the note is moved back from Month into the timeline (e.g. into Thursday or the Week scratchpad), `resolveEndpoint` re-finds the card via `[data-note-id]`. The arrow **instantly re-awakens and snaps to the note's new date/position**.
   - **Permanent Deletion**: An arrow is only deleted if explicitly painted over with the **Eraser tool** or if either connected note is permanently deleted with the **Trash icon**.

2. **The "Hybrid Overlay" Architecture**
   - **Local In-Pane SVGs (Freehand Ink)**: Freehand sketches, scribbles, and highlights remain inside each local scroll container (`VerticalCalendar` and `JigsawMonthGrid`), ensuring 100% GPU hardware-accelerated 120 FPS scrolling with zero lag.
   - **Global Connector Layer (Semantic Arrows)**: A single lightweight SVG overlay at the root of `App.tsx` (`pointer-events-none`) dedicated to rendering inter-card arrows across pane boundaries.

3. **Key Technical Challenges to Address**
   - **Scroll Desync / Rubber-Banding**: Compositor thread scrolling runs ahead of the main JavaScript thread by ~1 frame (16ms). Mitigate with `requestAnimationFrame` dampening and CSS `transform: translate3d`.
   - **DOM Virtualization Fallback**: When an arrow's target note is scrolled out of view (~10 weeks away), the note is unmounted from the DOM. The overlay must calculate fallback coordinates using virtualizer index offsets (`getYForDate`) and clamp/clip the arrow cleanly at the viewport edge.
   - **DOM Scoping in `DrawingOverlay.tsx`**: Replace global `document.querySelector('[data-note-id]')` with container-scoped queries (`svgRef.current.closest('[data-calendar-container]')`) to prevent timeline arrows from erroneously linking into the sidebar or open modals.
   - **Tagging `WeekFocusPanel`**: Add `data-week-panel="true"` and `data-date-string={weekBlock.startDate.dateString}` to allow the arrow tool to hit-test and anchor directly into weekly scratchpad notes.
   - **Visual Ergonomics**: Prevent cross-pane "spiderweb clutter" by rendering arrows in subtle graphite pencil tint (`#A19D94`), dimming lines when not focused, and highlighting at full opacity on card hover.

---

## 📋 High-Priority Feature: Global Annotation Search & To-Do Aggregator

### Overview
Enable users to search, filter, and aggregate all notes with semantic annotations (`@todo`, `@wait`, `@important`, `@celebrate`, `@explore`, `@thought`, `@time`) across the entire timeline (daily, weekly, and monthly notes).

---

### Implementation Scope

1. **Spotlight / Command Palette (`Cmd+K` or `/`)**
   - Universal omni-search modal triggered by `Cmd+K` or `/`.
   - Real-time search query matching note text and tags.
   - Quick filter chips inside search modal: `[ 🟢 To-Dos ]`, `[ 🔴 Important ]`, `[ 🟠 Waiting ]`, `[ 🟡 Celebrations ]`, `[ 🟣 Ideas ]`.
   - Keyboard navigation (`↑`/`↓` to highlight, `Enter` to select).
   - Selecting a search result automatically scrolls the vertical calendar or month radar to jump directly to that date.

2. **Top Navigation Tag Filter Bar**
   - Clickable filter pills in the calendar header:
     `[ All ]` `[ 🔴 Important (3) ]` `[ 🟢 To-Dos (6) ]` `[ 🟠 Waiting (2) ]` `[ 🟡 Celebrations (1) ]`
   - Shows live counts of uncompleted annotated items.
   - Clicking a filter isolates or highlights matching days/notes on the infinite timeline.

3. **The "Task & Waiting-For Ledger" Drawer (`T` / `W` hotkey)**
   - Slide-over panel accessible from the edge or via hotkey:
     - **Active To-Dos**: Chronological list of all active `@todo` tasks across the calendar.
     - **Waiting-For Ledger**: Dedicated list of all `@wait` / `@await` notes to track external dependencies.
     - **Ideas & Research**: Quick backlog of all `@explore` / `@idea` notes.
   - Interactive checklist: strike through or complete items directly from the drawer without losing scroll position.
   - One-click "Jump to Date" button on each list entry.

---

### Technical Architecture
- **Query Engine**: Use existing `parseNoteContent()` from `src/utils/annotationUtils.ts`.
- **Zero Schema Changes**: Queries operate directly on existing in-memory state (`notes`, `weekNotes`, `monthNotes`) in `src/hooks/useCalendarState.ts`.
- **Navigation**: Leverage `scrollToDate(targetDate)` from virtualizer in `VerticalCalendar.tsx` and `JigsawMonthGrid.tsx`.

---

## ✅ Completed Foundation: Semantic Annotation System

1. **Category Registry & Parser (`src/utils/annotationUtils.ts`)**:
   - 9 core categories: `@important`, `@wait`, `@celebrate`, `@todo`, `@explore`, `@thought`, `@time`, `@failed`, `@skipped`.
   - Zero-schema migration: Plain string storage (`content`) maintains 100% backward/forward compatibility.
2. **Micro-Badges with `@` Concealment (`NoteCard.tsx`)**:
   - Conceals `@` in badge pills for clean reading while preserving raw `@` in editor inputs.
3. **Universal Resolution (`~~@tag~~`)**:
   - Clicking any micro-badge toggles its resolved state in place (`@tag` $\leftrightarrow$ `~~@tag~~`).
   - Whole-note strikethrough automatically resolves all contained annotations.
4. **CommonMark Backslash Escaping**:
   - `\@tag` escapes the badge, consumed on render to produce plain `@tag` without a badge.
   - Raw `\@tag` is preserved in storage so the edit input loads `\@tag` losslessly.
   - `\\@tag` escapes the backslash, producing `\` + badge.
5. **Notable Dots with Graphite Pencil Slash (`DayRow.tsx`, `ContinuousRadarGrid.tsx`)**:
   - Date gutter dots track active (solid) and resolved (45° diagonal pencil slash) counts.
   - Resting note bullet mirrors resolution state.
6. **Autocomplete & Quick-Tag Bar (`AnnotationAutocomplete.tsx`, `useAnnotationInput.ts`)**:
   - Keyboard-navigable popup on typing `@` with time suggestions (`@4` $\to$ `@4:00pm`).
7. **Solid High-Contrast Label Chips & Re-Unified Left Slot (`annotationUtils.ts`, `NoteCard.tsx`)**:
   - Saturated category backgrounds with bold white text (`#FFFFFF`) and micro-rounded corners.
   - Removed internal badge dots to eliminate double-dot visual clutter.
   - Standardized Left Slot across all notes: resting bullet (`•`) at rest, drag handle (`:::`) on hover.
   - Restored full natural width across DayRow, WeekFocusPanel, and MonthNotesColumn without gutter offsets.
   - Interactive resolution toggling (`@tag` $\leftrightarrow$ `~~@tag~~`), turning chips into muted oatmeal with strikethrough and applying a 45° pencil slash to the anchor bullet.
8. **Fused Leading Badge Anchor & Multi-Line Alignment System (`NoteCard.tsx`, `annotationUtils.ts`)**:
   - Fuses the anchor bullet dot directly inside the solid rectangle of leading annotations (`[ • TAG ]`).
   - Line 1 negative margin outdent (`-ml-5` in comfortable, `-ml-4` in minimal) anchors the badge flush at $x = 0$.
   - Second and subsequent lines of multi-line notes wrap cleanly to the content baseline ($x = 20\text{px}$), remaining perfectly collinear with untagged notes while leaving the $0..20\text{px}$ bullet column strictly reserved.
   - Hovering over the leading badge transitions the inner dot directly into a reorder grip handle (`[ ::: TAG ]`) with `cursor-grab`.
   - Middle/inline annotations (`seg.isLeading === false`) render as snug inline chips without negative margins or dots.
   - Calibrated warm, softer mid-tone backgrounds, borderless flat finish (`border-none`, `outline-none`, `ring-0`), and subtle `+` prefix diff cues on revision.
