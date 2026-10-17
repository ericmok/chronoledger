# Annotations, Anchor Fusing, and Revisions

> A technical overview of how ChronoLedger parses tags, aligns leading badges, and calculates word-level revisions.

---

## 1. Background and Intent

When writing in a paper notebook, ink has weight and permanence. If we change our mind about a sentence, we draw a thin pen line through it and write the new phrasing above. The older thought is not eradicated; it sits quietly beside the new one, providing context for why our plans changed.

Similarly, checking off a task is an acknowledgment of progress, not an editorial correction. When you finish an errand, the words were not mistaken—their status simply shifted from open to resolved.

In early iterations of ChronoLedger, these two ideas became entangled:
- Toggling a tag from active to resolved (`@todo` to `~~@todo~~`) was passed through the text diffing algorithm as if the user had deleted one word and written another.
- The diff engine concluded that `@todo` was removed and `~~@todo~~` was inserted, rendering the tag twice: once in red ink with a strike, and once in green.
- Adding a tag to the beginning of an existing sentence failed to align with the margin, because the note card could not determine whether the tag belonged to the prose or served as the note's anchor.

To resolve this, we separated the note into two conceptual layers:
1. **The Anchor Slot**: The leading tag (if one exists) that sets the tone and identity of the note, resting directly at the left margin ($x = 0$).
2. **The Body Text**: The remaining prose and any inline tags, which participate in the word-level diffing engine.

Status transitions (`@tag` $\leftrightarrow$ `~~@tag~~`) are treated as lifecycle events rather than textual revisions. They never trigger diff indicators, duplicate badges, or mark notes as edited.

---

## 2. Terminology

To keep descriptions clear across components, we use the following definitions:

| Term | Context | Meaning |
| :--- | :--- | :--- |
| **Annotation** | Conceptual | The general system of categorizing notes through typed metadata chips and gutter indicators. |
| **Tag** | Text Syntax | The raw text typed in markdown (e.g., `@todo`, `@wait`, `@important`, `@4:00pm`). |
| **Anchor Tag** | Position | A tag that appears at the very beginning of a note, before any sentence prose. |
| **Inline Tag** | Position | A tag placed within or at the end of the prose (e.g., `Discuss agenda @meeting with @alice`). |
| **Anchor Badge** | UI Component | The chip rendered at the left margin ($x = 0$) that incorporates the note's resting bullet dot and hover drag handle. |
| **Inline Badge** | UI Component | A chip rendered naturally within the flow of a sentence. It does not carry a drag handle or negative margins. |
| **Notable Dot** | Timeline Gutter | The small colored dot alongside the calendar date number, reflecting the presence of active or resolved annotations on that day. |

---

## 3. Data Representation

Notes are represented simply as markdown strings, accompanied by an optional record of their previous content:

```typescript
export interface NoteItem {
  id: string;
  content: string;             // Current raw markdown (e.g., "@todo Prepare summary @project")
  originalContent?: string;    // Pre-revision markdown snapshot for diff rendering; undefined when diffs are cleared
  isStruck: boolean;           // Entire note strikeout (e.g., canceled or completed thought)
  parentDates: string[];       // Date keys (YYYY-MM-DD)
  colorTag?: string;           // Optional fallback tint
  createdAt: string;
  updatedAt: string;
}
```

### Markdown Serialization

- **Active Tag**: `@<tagname>` (e.g., `@todo`, `@wait`, `@10:30am`).
- **Resolved Tag**: `~~@<tagname>~~` (wrapped in CommonMark strikethrough markers).
- **Escaped Tag**: `\@<tagname>` (preceded by a backslash). In reading mode, the backslash is omitted and the tag renders as plain text `@tagname` without a badge. In editing mode, the backslash returns so the markdown remains intact.
- **Whole-Note Strikethrough**: When `isStruck` is true, a graphite pencil line is drawn across the entire note, and all internal annotations are displayed in their resolved state.

---

## 4. Anchor Fusing at the Margin

### The Layout Consideration

Every note on the timeline aligns to an exact horizontal coordinate ($x = 0$):
- An untagged note displays a small bullet dot (`•`). On hover, this dot transforms into a subtle grip icon (`:::`) for reordering.
- A tagged note displays a category chip. If this chip were rendered *after* the bullet dot, the line would be pushed inward, creating an irregular left margin and visual distraction.

### The Anchor Splitter

The helper `splitNoteAnchorAndBody` divides the note into its leading anchor and its prose:

```typescript
export interface SplitNoteResult {
  anchor: ParsedAnnotation | null;
  bodyText: string;
}
```

```
+-----------------------------------------------------------------------------+
| Raw String: "@todo Review manuscript draft"                                 |
+-----------------------------------------------------------------------------+
       |
       +---> splitNoteAnchorAndBody()
               |
               +--- Anchor:   { tag: "todo", color: Sage (#83C5BE), isLeading: true }
               |              Rendered at x = 0 with negative left margin (-ml-5)
               |              Embeds bullet dot and hover drag handle.
               |
               +--- BodyText: "Review manuscript draft"
                              Rendered as flowing prose.
                              Compared against originalContent.bodyText in diffs.
```

### Practical Rules for Anchor Badges

1. **Embedded Bullet**: The bullet dot sits inside the left edge of the anchor badge rather than beside it.
2. **Reordering Grip**: Hovering over the anchor badge reveals the reordering grip in place of the bullet.
3. **Negative Margin**: The badge uses `-ml-5` (or `-ml-4` in compact mode) so that its internal bullet aligns precisely where an untagged note's bullet would rest.
4. **No Addition Prefix**: When a user adds a tag to the start of an untagged note, the anchor badge fuses quietly into the margin. It does not display a `+` symbol, as its presence at $x = 0$ already communicates the note's category.

---

## 5. Semantic Diffs in the Note Body

### Resolving vs. Editing

A typical string difference algorithm compares characters directly:
$$\text{"@todo"} \neq \text{"~~@todo~~"}$$

To prevent task resolution from being mistaken for a rewrite, the diff engine treats these two tokens as semantically equivalent during comparison:

```typescript
function stripTagResolution(token: string): string {
  if (!token) return '';
  const match = token.match(/^(?:~~)?(@[a-zA-Z0-9]+(?:[:.-][a-zA-Z0-9]+)*(?:[ap]m)?)(?:~~)?$/i);
  return match ? match[1].toLowerCase() : token;
}

function areTokensEquivalent(t1: string, t2: string): boolean {
  if (t1 === t2) return true;
  const s1 = stripTagResolution(t1);
  const s2 = stripTagResolution(t2);
  if (s1.startsWith('@') && s2.startsWith('@')) {
    return s1 === s2;
  }
  return false;
}
```

When walking back through the Longest Common Subsequence matrix, if two tokens are equivalent, the engine records an `unchanged` chunk and uses the **newer token's text**:

```typescript
if (i > 0 && j > 0 && areTokensEquivalent(oldTokens[i - 1], newTokens[j - 1])) {
  rawChunks.push({ type: 'unchanged', value: newTokens[j - 1] });
  i--;
  j--;
}
```

Because the token is marked `unchanged`, clicking `@todo` to mark it resolved updates the text in place without producing an added or deleted chunk. The note remains clean and does not display an edit badge.

---

## 6. How Diffs Appear in Notes

When the prose of a note is altered (`originalContent.bodyText` differs from `current.bodyText`), changes are displayed inline:

| Action | Example | Visual Result |
| :--- | :--- | :--- |
| **Word Added** | `milk` $\to$ `cold milk` | `cold` appears in soft green with a faint background. |
| **Word Deleted** | `buy whole milk` $\to$ `buy milk` | `whole` appears with a muted red strikethrough line at 60% opacity. |
| **Inline Tag Added** | `Call Sam` $\to$ `Call Sam @urgent` | The tag renders as a standard badge preceded by a gentle `+` (`[ + URGENT ]`). |
| **Inline Tag Deleted** | `Call Sam @urgent` $\to$ `Call Sam` | The tag renders with its category color, strikethrough line, and 50% opacity. **No minus (`−`) sign** is added; the strikethrough alone communicates removal. |
| **Anchor Replaced** | `@todo Write letter` $\to$ `@wait Write letter` | `@wait` fuses at $x = 0$, and `@todo` appears at the start of the body diff as a struck-through, dimmed badge. |

---

## 7. Tinted Paper Wash and Color Harmony

In early versions, badges were rendered as solid web chips with bright, saturated fills and stark white lettering. On an ivory parchment background, these heavy blocks broke the quiet rhythm of the page, drawing attention away from the words. Furthermore, when an item was resolved, its badge was turned completely gray, erasing any memory of which category it belonged to.

To restore harmony with the rest of the ledger:

1. **Shared Palette with Note Bullets**:
   The semantic tag categories now derive directly from the ledger's note accent palette (`NOTE_ACCENT_COLORS`):
   - `@todo`: Sage (`#83C5BE`)
   - `@wait`: Terracotta (`#E29578`)
   - `@celebrate`: Warm Ochre (`#E9C46A`)
   - `@explore`: Lavender (`#9B5DE5`)
   - `@thought`: Steel Blue (`#457B9D`)
   - `@important`: Desert Crimson (`#D23B38`)
   - `@time`: Muted Slate (`#71727A`)

2. **Tinted Paper Wash Aesthetic**:
   Instead of an opaque solid pill, each badge is rendered as a delicate watercolor wash—a pale, translucent tint resting gently on the paper—paired with deep, legible ink lettering of that same hue. The bullet dot at the margin remains rendered in the rich accent color, creating a clear visual anchor.

3. **Warmer, Less Saturated Resolved States**:
   When an annotation is resolved (`~~@tag~~`), it does not dissolve into a generic gray void. Instead, it retains its category hue, dialed slightly warmer, lighter, and less saturated. Accompanied by a gentle strikethrough and a graphite pencil slash across its bullet dot, the badge feels settled and complete while preserving its semantic meaning.

---

## 8. Cleaning and Finalizing Revisions

In keeping with the ledger metaphor, edits remain visible so you can review what changed. When you are ready to settle the note into its final wording:

```
[ Note Text with Diffs ]  [ ⌫ Eraser (revealed on hover / focus) ]
```

1. A small **Eraser** button appears beside the revisions when the note is moused over or receives keyboard focus.
2. Clicking it triggers `acceptNoteRevision(noteId)` in `useCalendarState`.
3. The note's `originalContent` field is cleared (`undefined`).
4. The revision diffs lift away, leaving only the clean, finalized prose.

This callback is passed consistently through daily rows, weekly panels, and monthly columns:
- `App.tsx`
  - `VerticalCalendar` $\to$ `DayRow` $\to$ `NoteItemComponent` $\to$ `NoteCard`
  - `VerticalCalendar` $\to$ `WeekFocusPanel` $\to$ `NoteCard`
  - `JigsawMonthGrid` $\to$ `MonthNotesColumn` $\to$ `NoteCard`

---

## 9. Considerations for Parameterized Tags

As notes grow more nuanced, tags may carry optional parameters:
```markdown
@todo[home] Clean attic
@reading[author="Calvino", status="in-progress"]
@exercise[energy=low]
```

The parsing structure accommodates this without disrupting current layout behavior:
1. **Token Boundaries**: The tokenizer regex will encompass bracketed clauses `(?:\[[^\]]*\])?` within the tag token.
2. **Equivalence Checking**: `areTokensEquivalent` will compare primary tag names while allowing parameter changes to highlight as diffs if desired.
3. **Anchor Consistency**: The anchor splitter evaluates the first token of the note regardless of bracketed attributes, preserving bullet fusion and drag handle placement at $x = 0$.
