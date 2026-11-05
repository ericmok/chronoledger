# Theme & Design Token System

ChronoLedger uses a semantic design token architecture powered by CSS Custom Properties and Tailwind CSS v4 `@theme`. This system decouples visual styling (colors, typography, radii) from React component structure, enabling multiple distinct aesthetics—such as the organic **Paper Ledger** and the crisp **Lupine Console**—without branching logic (`theme === 'lupine' ? ... : ...`) in JSX.

---

## 1. Architectural Philosophy

1. **Theme-Agnostic Markup**: React components should describe *intent* (e.g. `bg-canvas`, `text-ink`, `border-canvas-border`, `rounded-box`), not literal colors (`bg-[#FAF8F5]` or `text-blue-600`).
2. **Zero-Ternary Styling**: Switching themes should never require conditional ternary expressions in component class strings. The entire UI changes automatically when the root `<html data-theme="...">` attribute changes.
3. **Geometry Inheritance**: Themes can enforce distinct structural geometries (such as 0px crisp rectangular borders in Lupine vs rounded cards in Paper) at the CSS layer without changing component markup.
4. **Universal Concise Copy**: Interface labels remain concise and consistent across all themes (`Today`, `+ New`, `Search ⌘K`, `Months`, `W44`).

---

## 2. Token Dictionary

All tokens are defined in [`src/index.css`](../src/index.css) under `:root[data-theme="..."]` and registered under `@theme`.

### Surface & Canvas Tokens
| Token Name | Tailwind Class | Role | Paper Value | Lupine Value |
| :--- | :--- | :--- | :--- | :--- |
| `--canvas-bg` | `bg-canvas` | Main application backdrop | `#FAF8F5` (Alabaster) | `#FAFAFA` (Cool Off-White) |
| `--canvas-card` | `bg-canvas-card` | Elevated cards, notes, popovers | `#FFFFFF` | `#FFFFFF` |
| `--canvas-subtle` | `bg-canvas-subtle` | Headers, gutters, input backings | `#F2EDE4` (Warm Gray) | `#F2F2F4` (Cool Slate) |
| `--canvas-subtle-hover` | `hover:bg-canvas-subtle-hover` | Hover state for subtle controls | `#EAE3D6` | `#E9ECEF` |
| `--canvas-border` | `border-canvas-border` | Dividers, separators, cell borders | `#E5DFD5` | `#CBD5E1` (Cool Slate) |
| `--canvas-border-strong` | `border-canvas-border-strong` | Active input borders, prominent dividers | `#D5CDC0` | `#94A3B8` (Medium Slate) |
| `--day-divider` | `border-day-divider` / `.timeline-day-divider` | Prominent boundary lines separating days | `#D5CDC0` (1px) | `#94A3B8` (2px) |

### Typography & Ink Tokens
| Token Name | Tailwind Class | Role | Paper Value | Lupine Value |
| :--- | :--- | :--- | :--- | :--- |
| `--ink-primary` | `text-ink` | Main body copy, headings, numbers | `#2B2C30` (Charcoal) | `#212121` (Terminal Black) |
| `--ink-secondary` | `text-ink-secondary` | Metadata, hints, week numbers | `#71727A` (Pencil Lead) | `#757575` (Muted Gray) |
| `--ink-strike` | `text-ink-strike` | Strikethroughs, empty placeholders | `#A19D94` | `#9E9E9E` |
| `--accent-primary` | `text-accent` / `bg-accent` | Primary action color, current today highlight | `#D23B38` (Seal Red) | `#3264EB` (Cobalt Blue) |
| `--accent-primary-hover` | `hover:bg-accent-hover` | Hover state for accent buttons | `#B82C29` | `#2552D0` |
| `--accent-text` | `text-accent-fg` | High-contrast text on accent backgrounds | `#FAF8F5` | `#FFFFFF` |

### Today & Focus Tokens
| Token Name | Tailwind Class | Role | Paper Value | Lupine Value |
| :--- | :--- | :--- | :--- | :--- |
| `--today-bg` | `bg-today` | Background wash for today / active week | `#FAF3EA` (Warm Tint) | `#EFF6FF` (Ice Blue) |
| `--today-border` | `border-today-border` | Highlight border for today indicators | `#D23B38` | `#3264EB` |

### Radii & Geometry Tokens
| Token Name | Tailwind Class | Role | Paper Value | Lupine Value |
| :--- | :--- | :--- | :--- | :--- |
| `--radius-box` | `rounded-box` | Containers, dialogs, cards | `0.5rem` (8px) | `0px` |
| `--radius-btn` | `rounded-btn` | Interactive buttons, pills | `0.375rem` (6px) | `0px` |
| `--radius-badge` | `rounded-badge` | Tag chips, inline pips | `0.25rem` (4px) | `0px` |

> In Lupine mode, a global CSS rule automatically collapses all `rounded-*` utility classes to `0px !important`, ensuring sharp TUI geometry even if standard Tailwind radius classes are used.

### Typography Families
| Token Name | Tailwind Class | Paper Value | Lupine Value |
| :--- | :--- | :--- | :--- |
| `--font-main` | `font-main` | Newsreader (Editorial Serif) | JetBrains Mono (Terminal Monospace) |
| `--font-ui` | `font-ui` | Inter (Clean Sans-Serif) | JetBrains Mono (Terminal Monospace) |
| `--font-mono` | `font-mono` | JetBrains Mono | JetBrains Mono |

---

## 3. Component Usage Guide

### Do's and Don'ts

```tsx
// ❌ BAD: Hardcoding hex values or switching on theme names
<div className={theme === 'lupine' ? 'bg-[#FAFAFA] text-[#212121]' : 'bg-[#FAF8F5] text-[#2B2C30]'}>
  <button className={isLupine ? 'bg-[#3264EB] text-white rounded-none' : 'bg-[#D23B38] text-white rounded-md'}>
    {isLupine ? ':save' : 'Save Note'}
  </button>
</div>

// ✅ GOOD: Semantic tokens with universal concise copy
<div className="bg-canvas text-ink border border-canvas-border rounded-box">
  <button className="bg-accent hover:bg-accent-hover text-accent-fg rounded-btn">
    Save
  </button>
</div>
```

---

## 4. How to Add a New Theme in 3 Steps

To add a new theme (for example, a dark theme like `dracula` or `nord`):

### Step 1: Define CSS Variables in `src/index.css`
Add a new `:root[data-theme="theme-name"]` block in [`src/index.css`](../src/index.css):

```css
:root[data-theme="dracula"] {
  --canvas-bg: #282A36;
  --canvas-card: #343746;
  --canvas-subtle: #44475A;
  --canvas-subtle-hover: #50546C;
  --canvas-border: #6272A4;
  --canvas-border-strong: #7A8BC2;

  --ink-primary: #F8F8F2;
  --ink-secondary: #BD93F9;
  --ink-strike: #6272A4;
  
  --accent-primary: #FF79C6;
  --accent-primary-hover: #FF92D0;
  --accent-text: #282A36;

  --today-bg: #383A59;
  --today-border: #FF79C6;

  --radius-box: 0.375rem;
  --radius-btn: 0.25rem;
  --radius-badge: 0.25rem;

  --font-main: var(--font-sans);
  --font-ui: var(--font-sans);
}
```

### Step 2: Register in Settings Type Definition
In [`src/types/calendar.ts`](../src/types/calendar.ts), update the `ThemeMode` union:
```ts
export type ThemeMode = 'paper' | 'lupine' | 'dracula';
```

### Step 3: Add to Header Selector
In [`src/components/Header.tsx`](../src/components/Header.tsx), add the new option to the theme toggle menu.

**No other components require changes.** All modals, buttons, timelines, grids, and dialogs adapt instantly.
