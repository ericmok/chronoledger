# ChronoLedger Roadmap & Feature Backlog

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
