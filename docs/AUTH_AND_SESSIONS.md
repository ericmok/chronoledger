# Authentication, Multi-Tenant Sessions, and Note Migration

> A technical specification and architectural guide for ChronoLedger's guest sandbox, multi-user authentication, dual-mode sessions, and zero-loss data migration.

---

## 1. Background and Philosophy

ChronoLedger is designed as a **local-first, tactile analog calendar**. Because users value instantaneous flow without upfront friction, the application does not impose a mandatory registration wall. Anyone can visit the site and immediately start handwriting notes, sketching arrows in margins, and circling milestone dates.

However, as soon as a user desires multi-device synchronization (e.g. accessing their calendar on a phone, iPad, or another computer), data must be secured behind authenticated credentials.

This creates a dual requirement:
1. **Guest Mode (Local-First Sandbox)**: Unauthenticated visitors can create notes, circle dates, and explore the app with all data persisted strictly in browser `localStorage`.
2. **Account Protection (Private Multi-Tenant Ledger)**: Once a user registers or logs in, their notes are stored in the server's SQLite database (`data/chronoledger.sqlite`), scoped by their `user_id`. When they log out, private notes are immediately wiped from the screen and local storage to prevent data leakage on shared computers.

---

## 2. Session Lifecycle & State Machine

The following flowchart illustrates every state transition—from first-time visitor to authenticated sync, guest note promotion, and protected logout:

```mermaid
flowchart TD
    Start(["User Opens Website (/)"]) --> CheckSession{"Check Session<br>(GET /api/auth/me)"}

    %% Branch 1: Logged In
    CheckSession -- "200 OK (Valid Session)" --> LoggedInEntry["Entry: Authenticated User<br>(STORAGE_KEYS.IS_AUTHENTICATED = 'true')"]
    LoggedInEntry --> FetchRemote["GET /api/calendar (from SQLite)"]
    FetchRemote --> RenderUserNotes["Render Private Ledger on Timeline"]
    RenderUserNotes --> LiveSync["Active Mode: Debounced SQLite Auto-Sync (ILS)"]

    %% Branch 2: Not Logged In
    CheckSession -- "401 / No Session" --> CheckLocal{"Local Storage Has<br>Existing Data?"}
    
    CheckLocal -- "Empty (1st Time Guest or Post-Logout)" --> SeedDemo["Auto-Seed Starter Notes<br>(from createDefaultNotes relative to Today)"]
    CheckLocal -- "Has Guest Notes" --> LoadGuest["Load Existing Guest Sandbox<br>(Starter notes + user scratch notes)"]
    
    SeedDemo --> GuestCanvas["Guest Mode: Header shows [ 🗄️ Guest ]"]
    LoadGuest --> GuestCanvas
    
    GuestCanvas --> GuestEdits{"Guest Action"}
    GuestEdits -- "Strikes / Edits / Moves Demo Note" --> PromoteNote["Promotion-at-Interaction:<br>Immediately assigned persistent ID<br>(e.g. note-1729... / wnote-1729...)"]
    GuestEdits -- "Draws Arrow Targeting Demo Note" --> PromoteTarget["Promote Target Note Instantly<br>& Bind Arrow Anchor to New ID"]
    GuestEdits -- "Creates New Note / Drawing" --> NewUserItem["Assigned fresh ID<br>(e.g. note-1729...)"]
    GuestEdits -- "Leaves Demo Note Untouched" --> UntouchedNote["Retains demo-* ID<br>(demo-1, wnote-1, mnote-1)"]

    PromoteNote --> GuestCanvas
    PromoteTarget --> GuestCanvas
    NewUserItem --> GuestCanvas
    UntouchedNote --> GuestCanvas

    %% Transition: Guest Decides to Log In
    GuestCanvas --> TriggerLogin["User clicks 'Sign In' or 'Sign Up'"]
    TriggerLogin --> AuthSuccess{"Auth Successful?"}
    
    AuthSuccess -- "Yes" --> FilterLocal["Step 1: One-Step Migration Filter (!isDemoId)<br>• Discard all unpromoted demo-* IDs<br>• Preserve all promoted & user-authored notes<br>• Preserve drawing anchors pointing to promoted IDs"]
    FilterLocal --> SafeMerge["Step 2: safeMerge(FilteredGuestNotes, UserAccountNotes)<br>or Seed SQLite if remote account is brand new"]
    SafeMerge --> PushServer["Step 3: Save Merged Ledger & Reset dirtyQueueRef"]
    PushServer --> RenderUserNotes

    %% Transition: User Logs Out
    LiveSync --> TriggerLogout["User clicks 'Sign Out'"]
    TriggerLogout --> LogoutActions["1. Revoke session on server<br>2. Remove IS_AUTHENTICATED flag<br>3. clearCalendarState() wipes private data<br>4. Re-seed fresh demo notes for guest sandbox"]
    LogoutActions --> GuestCanvas
```

---

## 3. The 6 User Entry Points

ChronoLedger deterministically handles six entry points:

| Entry Point | Client State | System Action |
| :--- | :--- | :--- |
| **1. First-Time Visitor** | No cookies, empty `localStorage` | Boots in **Guest Mode**. Seeds initial starter notes from `createDefaultNotes()` relative to Today. Header displays `[ 🗄️ Guest ]` and `[ Sign In ]`. |
| **2. Returning Guest** | No cookies, existing `localStorage` | Restores local scratchpad. Demo notes that were never touched retain `demo-*` IDs and will be dropped on login. Any struck, edited, or newly created items are already promoted to real IDs and preserved locally. |
| **3. Returning Authenticated User** | Valid 30-day session cookie | Seamlessly boots into private account. Calls `GET /api/calendar` to fetch the user's private ledger from SQLite. If the user account has 0 notes, it cleanly displays an empty ledger with zero demo notes. Header displays `[ 👤 email ]` and `[ 🗄️ SQLite ]`. |
| **4. Expired Session** | Cookie >30 days old or revoked | `/api/auth/me` returns `401`. App preserves unsynced in-progress text in local storage and sets status to `[ ⚠️ Re-auth ]`, allowing one-click re-authentication without losing work. |
| **5. Account Switcher** | User logs out of Alice, logs into Bob | Logging out of Alice completely wipes memory and user storage, returning the client to the pristine guest demo playground. Logging into Bob loads only Bob's private notes—guaranteeing zero cross-account data leakage. |
| **6. Multi-Device Stale State** | Edited note on iPhone; laptop woke from sleep | When laptop tab regains focus (`visibilitychange`), it pulls incremental deltas (`GET /api/calendar/delta?since=R`) from SQLite rather than overwriting with stale sleep memory. |

---

## 4. The Demo Note Protocol: Promotion-at-Interaction & Zero-Pollution Migration

When a guest explores the application, the calendar displays sample notes (e.g., *"Tokyo Design Offsite"*, *"Review architecture plan"*). If that guest subsequently registers or logs into an existing account, **their personal account must not be polluted with un-touched sample notes**. At the same time, if the guest actively struck a demo note, revised its text, rescheduled it, or drew an arrow to it, **that work must be preserved in their permanent account**.

To achieve this without complex heuristics, fragile text-diffing, or broken drawing anchors, ChronoLedger implements **Promotion-at-Interaction**:

### 4.1 Pristine Demo Blueprints (`isDemoId`)
All starter notes generated by `createDefaultNotes()`, `createDefaultWeekNotes()`, and `createDefaultMonthNotes()` carry known blueprint IDs (`demo-1` through `demo-7`, `wnote-1` through `wnote-3`, `mnote-1`, `mnote-2`). The `isDemoId(id)` helper provides an O(1) test to identify unpromoted demo blueprints.

### 4.2 Promotion at Moment of Interaction
Instead of attempting post-hoc string archaeology on login, note mutators promote demo notes **the instant the user interacts with them**:
* **Striking a Note (`toggleStrikeNote`)**: When a guest clicks strike on a demo note, it is immediately assigned a collision-resistant permanent user ID: `note-${Date.now()}-${random}` with `isStruck: true`.
* **Editing Content (`updateNote`)**: When text, parent dates, or color tags are modified, the note is converted to a permanent note ID.
* **Moving Horizons or Dates (`moveNoteScope`, `moveNoteToDate`)**: Rescheduling or dragging across Day $\leftrightarrow$ Week $\leftrightarrow$ Month instantly promotes the note.
* **Deletion (`removeNote`)**: Deleting a demo note simply removes it from state without staging a tombstone to the server (since SQLite never knew about it).

### 4.3 Zero-Dangling Drawing Anchors (`updateDrawingAnchorsOnPromotion` & `addDrawing`)
Connecting an arrow to a demo note weaves it into the user's personal thought graph:
* When `addDrawing` creates an arrow targeting a demo note (`startAnchor.noteId` or `endAnchor.noteId`), the target note is **immediately promoted** to a permanent note, and the arrow's anchor is bound directly to the newly generated ID.
* If a note was already targeted by an existing drawing and subsequently promoted, `updateDrawingAnchorsOnPromotion` automatically re-points the drawing's anchors so references never become orphaned.

### 4.4 The 1-Step Migration Gate at Login
When the user registers or logs in, migration becomes a trivial filter:
```typescript
// Drop all unpromoted demo blueprints; keep all promoted and user-authored notes
const activeLocalNotes = currentStateRef.current.notes
  .filter((n) => !isDemoId(n.id) && !serverDeletedIds.has(n.id));
```
* Untouched demo notes evaporate in a single operation.
* Promoted notes and newly created notes merge cleanly into the user's SQLite account via `safeMerge`.
* `dirtyQueueRef.current = createEmptyDirtyQueue()` is cleared so stale guest operations never leak into incremental delta syncs.

### 4.5 Auto-Reseeding Gated by `STORAGE_KEYS.IS_AUTHENTICATED` (Option 1)
To ensure guests always experience a welcoming, interactive ledger while authenticated users with 0 notes never see demo notes:
* `storage.loadNotes()`, `loadWeekNotes()`, and `loadMonthNotes()` check `STORAGE_KEYS.IS_AUTHENTICATED`.
* **In Guest Mode (`!isAuthenticated`)**: Empty storage automatically re-seeds fresh default demo notes relative to Today.
* **For Authenticated Users (`isAuthenticated`)**: Empty storage returns `[]`. There is zero visual flash of sample notes on refresh or initial account boot.
* **On Logout**: `handleLogout` revokes the session, removes `IS_AUTHENTICATED`, and resets local storage to fresh demo notes for the next guest visitor.

---

## 5. Dual-Mode Authentication (Web + Rust / Native Clients)

To support web browsers alongside future native clients (e.g. a Rust desktop client, iOS SwiftUI app, or CLI scripts), the backend implements **Dual-Mode Authentication**:

```mermaid
flowchart LR
    subgraph Clients
        Web["Web Browser (React)"]
        Rust["Desktop / Native (Rust, iOS, CLI)"]
    end

    subgraph AuthEndpoint["POST /api/auth/login"]
        Web --> AuthEndpoint
        Rust --> AuthEndpoint
    end

    AuthEndpoint --> Response["Response:<br>1. Set-Cookie: session_token=... (for Web)<br>2. JSON: { token, user } (for Native)"]

    subgraph Resource["GET /api/calendar"]
        Web -->|"Cookie: session_token=..."| Resource
        Rust -->|"Authorization: Bearer <token>"| Resource
    end
```

### Server Token Resolver
On every API request (`/api/*`), `server/auth.js` checks:
1. `Authorization: Bearer <token>` header (used by Rust, iOS, and curl).
2. If omitted, falls back to the `Cookie: session_token=<token>` header (used by web browsers).

Session tokens are stored in the database as **SHA-256 hashes** (`token_hash`), ensuring that a database dump does not reveal usable session tokens. Passwords are encrypted using **Argon2id**.

---

## 6. Database Schema (Schema v4)

In `data/chronoledger.sqlite`, tables are partitioned by `user_id`:

```sql
-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Sessions Table (multi-device support)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name TEXT,
  client_type TEXT,
  ip_address TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- Calendar Tables with user_id
ALTER TABLE notes ADD COLUMN user_id TEXT;
ALTER TABLE week_notes ADD COLUMN user_id TEXT;
ALTER TABLE month_notes ADD COLUMN user_id TEXT;
ALTER TABLE drawings ADD COLUMN user_id TEXT;
ALTER TABLE circled_dates ADD COLUMN user_id TEXT;
ALTER TABLE settings ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_week_notes_user_id ON week_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_month_notes_user_id ON month_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_drawings_user_id ON drawings(user_id);
CREATE INDEX IF NOT EXISTS idx_circled_dates_user_id ON circled_dates(user_id);
```

### User-Scoped Read and Write Queries
Instead of global table wipes, all writes are isolated to the active session's `user_id`:
```sql
DELETE FROM notes WHERE user_id = :userId;
INSERT INTO notes (id, user_id, content, ...) VALUES (:id, :userId, :content, ...);
```

---

## 7. Edge Cases and Defensive Mitigations

### A. The "Deleted Demo Note" Trap
* **Issue**: A guest deletes 5 demo notes, then logs into their existing account. If a deletion event were recorded, would it delete 5 notes from their account?
* **Mitigation**: Deletion in guest mode only removes the item from the local array. Merging only evaluates existing non-demo items. Account notes are never deleted by guest actions.

### B. Concurrency & Stale Tab Overwriting
* **Issue**: A user edits their calendar on their phone at 2:00 PM. Their laptop had a browser tab open from 1:00 PM. When they open their laptop, an auto-sync could push the stale 1:00 PM state and overwrite the phone's 2:00 PM edit.
* **Mitigation**: On `document.visibilitychange` (`state === 'visible'`), the browser calls `rehydrateRemoteCalendar()` to pull the latest remote timestamp before any local mutation can schedule a push.

### C. Drawings & Circled Dates in Guest Mode
* **Rule**: Because ChronoLedger does not ship with placeholder demo drawings or demo circles, **any drawing stroke or circled date created in guest mode is genuine user work**. All local drawings and circled dates are preserved and merged upon login.

### D. Logout Privacy Wipe
* **Rule**: Clicking **Sign Out** immediately:
  1. Revokes the session token in SQLite via `POST /api/auth/logout`.
  2. Calls `clearCalendarState()`, resetting in-memory notes, week notes, drawings, and circled dates to empty arrays.
  3. Clears `localStorage` and removes `chrono_ledger_recovery_snapshot_v1`.
  4. Returns the UI to a clean Guest state.

### E. Password Change & Device Invalidation
* **Endpoint**: `POST /api/auth/change-password`
* **Rule**: When a user changes their password:
  1. The server verifies their `currentPassword` using Argon2id.
  2. The new password is validated (minimum 6 characters) and hashed with Argon2id.
  3. `users.password_hash` is updated atomically.
  4. **Multi-device Invalidation**: All other sessions in `sessions` table are deleted (`user_id = ? AND token_hash != ?`), forcing lost, stolen, or remote devices to re-authenticate. The active session remains authenticated.
  5. Endpoints are protected by a sliding-window rate limiter (10 attempts/min).

### F. Personal Access Tokens (PAT) & MCP Tooling
* **Endpoints**: `GET /api/auth/tokens`, `POST /api/auth/tokens`, `DELETE /api/auth/tokens/:id`
* **Rule**: AI agents (Claude Desktop, Antigravity, Cursor) and CLI tooling authenticate via Personal Access Tokens (`cal_pat_...`) passed as Bearer tokens or via `CHRONOLEDGER_TOKEN` environment variables.
* **Security Standards**:
  - LLMs never prompt users for primary passwords.
  - Raw tokens are returned only once upon creation; only SHA-256 hashes are persisted at rest in `api_tokens`.
  - Tokens can be revoked individually from the Account & Security Settings UI without changing master passwords.
