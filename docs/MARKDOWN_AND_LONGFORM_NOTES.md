# Markdown & Long-Form Content in ChronoLedger

> **ChronoLedger Design Specification**  
> **Status**: Production Architecture  
> **Focus**: Rich text typography, independent interactive checklists, 5-line progressive disclosure folding, and spacious analog writing surfaces.

---

## 1. Design Vision & Philosophy

ChronoLedger is built upon the permanence, tactile texture, and intentionality of physical stationery. While short notes and micro-badges (`@todo`, `@important`, `@wait`, `@celebrate`, `@time`) excel at fast daily capture, deep planning and reflection demand structured, long-form prose:

- Multi-paragraph journal entries and reflections.
- Meeting notes with hierarchical headings (`## Topics`), blockquotes, and lists.
- Multi-step checklists (`- [ ]`, `- [x]`) within actionable tasks.
- Technical snippets in monospace code blocks.
- External reference links (`[spec](https://...)`).

The challenge in ChronoLedger is enabling rich long-form content **without disrupting the analog rhythm of the infinite timeline or breaking the strict geometric baselines of the calendar grid**.

---

## 2. Architecture: Hybrid AST Lexer & React Renderer

Rather than importing heavyweight markdown bundles (`react-markdown`, `remark`, `rehype`) or risking subtle parsing bugs with hand-rolled regular expressions, ChronoLedger adopts a **hybrid tokenization architecture**:

```
+-----------------------------------------------------------------------------+
| Raw Note Markdown Content (e.g. from SQLite content TEXT)                   |
+-----------------------------------------------------------------------------+
                                       |
                                       v
                              parseMarkdown(content)
                                       |
                                       v
                       marked.lexer(content, { gfm: true })
                                       |
                                       v
                       Token AST Stream (headings, lists, ...)
                                       |
                                       v
                             MarkdownRenderer.tsx
         +-----------------------------+-----------------------------+
         |                             |                             |
         v                             v                             v
   Newsreader Serif            JetBrains Mono               Interactive Lists
(Headings & Blockquotes)     (Code blocks & spans)      (- [ ] / - [x] checkboxes)
         |                             |                             |
         +-----------------------------+-----------------------------+
                                       |
                                       v
                             parseNoteContent()
               (Semantic @tags, ~~@resolved~~, and \@escapes)
```

### Key Technical Properties:
1. **Zero Runtime Vulnerabilities**: `marked` operates strictly as an AST tokenizer (`marked.lexer`); it never outputs unescaped HTML strings, eliminating XSS vulnerabilities.
2. **First-Class Tag Preservation**: Text leaf nodes pass through ChronoLedger's native `parseNoteContent()` parser, ensuring `@todo`, `@important`, and `~~@resolved~~` tags render as rich chips seamlessly.
3. **Typography**:
   - Headings & blockquotes render in **Newsreader** serif (`font-serif`).
   - Code blocks and spans render in **JetBrains Mono** (`font-mono text-[11px]`).
   - Body prose renders in **Inter** (`font-sans leading-relaxed`).

---

## 3. Fused Leading Badge Anchor & Line 1 Inline Flow

ChronoLedger's signature **Fused Leading Badge Anchor** layout (see [`ANNOTATIONS_AND_DIFFS.md`](./ANNOTATIONS_AND_DIFFS.md)) aligns every note to an exact horizontal coordinate ($x = 20\text{px}$ via `pl-5` in comfortable density):
- An untagged note displays a small bullet dot (`•`) at $x = 0$..$20\text{px}$.
- A tagged note fuses its category chip directly into the left margin at $x = 0$ with negative margin `-ml-5 mr-1.5`, embedding the resting bullet inside the badge chip.

```
x = 0px              x = 20px                                        x = 65px
  |                     |                                               |
  +---------------------+-----------------------------------------------+
  | [ • @todo ]         |                                Review PR      |  <- Line 1
  |                     | draft and verify all test suites before       |  <- Line 2 (wraps to pl-5)
  |                     | deploying to staging.                         |  <- Line 3 (wraps to pl-5)
  +---------------------+-----------------------------------------------+
```

### Preserving Fused Inline Flow with Markdown
To prevent block-level line breaks from forcing the prose onto Line 2 underneath the badge:
1. `NoteCard.tsx` passes `anchorNode` directly to `<MarkdownRenderer leadingAnchor={anchorNode} ... />`.
2. Inside `MarkdownRenderer.tsx`, the very first block (`index === 0`) injects `leadingAnchor` into its line box.
3. For paragraphs, `index === 0` renders as an inline `<span className="inline leading-relaxed">{leadingAnchor}{children}</span>`.
4. Subsequent paragraphs (`index > 0`) render as block elements with `mt-1.5` paragraph spacing.
5. In revision diff mode (`hasEdits`), the anchor badge and inline diff chunks sit together inside `<span className="inline whitespace-pre-wrap">`.

---

## 4. Interactive Checklists (Decoupled from `@todo`)

Task lists (`- [ ]` and `- [x]`) render as interactive tactile checkboxes in read mode:

```markdown
@todo Version 2.0 Launch Checklist
- [x] Merge pull request #42
- [ ] Run end-to-end regression tests
- [ ] Deploy release artifacts
```

### Behavioral Rules:
1. **Strict Independence**: Checking or unchecking subtasks **never** modifies or auto-resolves the note's `@todo` anchor tag. The `@todo` category tag represents the overall note's status and is toggled independently.
2. **Instant In-Place Toggle**: Clicking a checkbox updates the note in-place via `toggleTaskItemByIndex()`, immediately saving to state and SQLite storage without entering edit mode.
3. **Undoable Snapshots**: Checklist toggles push an undoable snapshot to `useCalendarState`'s history stack (`Cmd+Z` reverts accidental clicks).

---

## 5. 5-Line Progressive Disclosure Folding

Long notes on the timeline fold after **5 rendered lines** (or $>320$ characters) to preserve vertical calendar rhythm:

```
+-------------------------------------------------------------------------+
| [ • @todo ] Launch Product Feature                                      |
| We are preparing for the upcoming quarterly launch.                     |
| The architecture review highlighted critical security updates.          |
| - [x] Run penetration tests on staging servers                          |
| - [ ] Finalize customer migration guide                                 |
| ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ [ Parchment Fade Gradient ] ~ ~ ~ ~ ~ ~ ~ ~ ~ |
| [ ▾ Show 6 more lines ]                               [ ⤢ Open Folio ]  |
+-------------------------------------------------------------------------+
```

### Folding Mechanics:
- **Collapsed (Default)**: Container is constrained to `max-h-[140px] overflow-hidden` with a bottom parchment gradient fade (`bg-gradient-to-t from-[#FAF8F5] via-[#FAF8F5]/85 to-transparent`).
- **Pill Button**: Displays `▾ Show more (+N lines)`.
- **Expanded**: Clicking expands to full height with `▴ Show less`.
- **Dynamic Measurement**: Triggers `onSizeChange()` which notifies `@tanstack/react-virtual` to measure and adjust row heights smoothly without scroll jumps.

---

## 6. Spacious Writing Surfaces & Smart Keybindings

All note creation surfaces have been redesigned for spacious, comfortable writing:
- **Removed Static Tag Bar**: Redundant static tag buttons were removed across all forms (`DayNoteInlineForm`, `WeekNoteInlineForm`, `MonthNoteInlineForm`, `AddNoteModal`), reclaiming vertical space.
- **Auto-Growing Textareas**: Textareas dynamically expand from `min-h-[85px]` up to `360px` as the user types (`autoResizeTextarea`).
- **Inline Card Editing**: Double-clicking or clicking edit on `NoteCard` transforms into a multi-line auto-growing textarea rather than a flat `<input>`.

### Smart Markdown Keybindings:
- `Enter`: Creates a new line. Automatically continues lists (`- [ ] `, `- `, `* `, `1. `). Pressing Enter on an empty list prefix terminates the list.
- `Cmd+Enter` / `Ctrl+Enter`: Saves and submits the note.
- `Tab`: Indents list items by 2 spaces (`Shift+Tab` outdents).
- `Escape`: Cancels editing and reverts changes.

---

## 7. The Note Folio Writing Desk

For long-form writing, journaling, and deep reflection, every note can be opened in the **Note Folio Desk** modal (`⤢` button on hover):
- **Three View Modes**: Split View (editor + live preview), Edit Only, or Preview Only.
- **Markdown Toolbar**: Instant formatting buttons for Bold, Italic, Strikethrough, Heading 1/2, Checklists, Bullet Lists, Blockquotes, and Code Blocks.
- **Writing Telemetry**: Real-time word count, paragraph count, and estimated reading time.
- **Shortcuts**: `Cmd+Enter` to save, `Esc` to close.
