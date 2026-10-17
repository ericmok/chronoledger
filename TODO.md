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
7. **Right-Aligned Leading Badge Anchor (`annotationUtils.ts`, `NoteCard.tsx`)**:
   - Leading annotation badge replaces the resting note bullet on the left.
   - Badge is right-aligned against the bullet column with dot on the right (`[ tag • ]`), perfectly aligning with resting bullets on untagged notes.
   - Note body text starts at the primary text column, ensuring 100% vertical text alignment across all notes and clean multi-line wrapping.
   - Full support for interactive resolution toggling (`[ ~~tag~~ ⊘ ]`) and hover drag handles (`:::`).
   - Integrated across Day, Week, and Month note forms and columns.
