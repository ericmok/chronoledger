import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  registerUser,
  loginUser,
  logoutUser,
  authenticateRequest,
  getUserCount,
  getUnclaimedCount,
  createSessionCookie,
  clearSessionCookie,
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DEFAULT_DB_PATH = process.env.DATABASE_PATH || path.join(DEFAULT_DATA_DIR, 'chronoledger.sqlite');

let cachedDb = null;

/**
 * Initializes and returns the SQLite database connection.
 * Sets up WAL mode and creates required tables if they don't exist.
 */
export function getDatabase(dbPath = DEFAULT_DB_PATH) {
  if (cachedDb) return cachedDb;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Performance and durability configuration
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Schema creation
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      content TEXT NOT NULL,
      original_content TEXT,
      parent_dates TEXT NOT NULL,
      is_struck INTEGER NOT NULL DEFAULT 0,
      strike_style TEXT,
      color_tag TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS week_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      content TEXT NOT NULL,
      original_content TEXT,
      parent_weeks TEXT NOT NULL,
      is_struck INTEGER NOT NULL DEFAULT 0,
      strike_style TEXT,
      color_tag TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS month_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      content TEXT NOT NULL,
      original_content TEXT,
      parent_months TEXT NOT NULL,
      is_struck INTEGER NOT NULL DEFAULT 0,
      strike_style TEXT,
      color_tag TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS drawings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT NOT NULL,
      color TEXT NOT NULL,
      stroke_width REAL NOT NULL,
      anchor_start_date TEXT NOT NULL,
      anchor_end_date TEXT,
      start_offset TEXT NOT NULL,
      end_offset TEXT,
      points TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS circled_dates (
      date_key TEXT PRIMARY KEY,
      user_id TEXT,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      user_id TEXT,
      week_starts_on INTEGER NOT NULL DEFAULT 0,
      show_struck_items INTEGER NOT NULL DEFAULT 1,
      active_tool TEXT NOT NULL DEFAULT 'select',
      ink_color TEXT NOT NULL DEFAULT '#2B2C30',
      badge_theme TEXT DEFAULT 'solid',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_name TEXT,
      client_type TEXT,
      ip_address TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  migrateDatabase(db);

  cachedDb = db;
  return db;
}

/**
 * Automatically applies schema migrations in a disciplined, transactional, and idempotent manner.
 */
export function migrateDatabase(db) {
  // Ensure table columns exist
  const columns = db.prepare('PRAGMA table_info(drawings)').all();
  const columnNames = new Set(columns.map((c) => c.name));

  if (!columnNames.has('start_anchor')) {
    db.exec('ALTER TABLE drawings ADD COLUMN start_anchor TEXT;');
  }
  if (!columnNames.has('end_anchor')) {
    db.exec('ALTER TABLE drawings ADD COLUMN end_anchor TEXT;');
  }

  // Ensure circled_dates table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS circled_dates (
      date_key TEXT PRIMARY KEY,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const metaRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get('schema_version');
  const currentVersion = Number(metaRow?.value) || 1;

  if (currentVersion < 2) {
    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Fetch notes to correlate dates with existing note IDs
      const noteRows = db.prepare('SELECT id, parent_dates FROM notes').all();
      const notesByDate = new Map();
      for (const n of noteRows) {
        const parentDates = JSON.parse(n.parent_dates || '[]');
        for (const d of parentDates) {
          const list = notesByDate.get(d) || [];
          list.push(n.id);
          notesByDate.set(d, list);
        }
      }

      // 2. Fetch legacy arrows lacking start_anchor
      const legacyArrows = db
        .prepare("SELECT * FROM drawings WHERE type = 'arrow' AND (start_anchor IS NULL OR start_anchor = '')")
        .all();

      const updateStmt = db.prepare(`
        UPDATE drawings
        SET start_anchor = ?, end_anchor = ?
        WHERE id = ?
      `);

      const BASELINE_COL_LEFT = 204;
      const BASELINE_COL_WIDTH = 468;

      for (const row of legacyArrows) {
        const startOffset = JSON.parse(row.start_offset || '{"x":0,"y":0}');
        const endOffset = row.end_offset ? JSON.parse(row.end_offset) : startOffset;

        const startXRatio = Math.max(0.05, Math.min(0.95, (startOffset.x - BASELINE_COL_LEFT) / BASELINE_COL_WIDTH));
        const endXRatio = Math.max(0.05, Math.min(0.95, (endOffset.x - BASELINE_COL_LEFT) / BASELINE_COL_WIDTH));

        const startNotes = notesByDate.get(row.anchor_start_date) || [];
        const endNotes = notesByDate.get(row.anchor_end_date) || [];

        const startNoteId = startNotes.length > 0 ? startNotes[0] : undefined;
        const endNoteId = endNotes.length > 0 ? endNotes[0] : undefined;

        const startAnchor = {
          dateString: row.anchor_start_date,
          noteId: startNoteId,
          xRatio: Number(startXRatio.toFixed(3)),
          yRatio: 0.5,
        };

        const endAnchor = {
          dateString: row.anchor_end_date || row.anchor_start_date,
          noteId: endNoteId,
          xRatio: Number(endXRatio.toFixed(3)),
          yRatio: 0.5,
        };

        updateStmt.run(JSON.stringify(startAnchor), JSON.stringify(endAnchor), row.id);
      }

      db.prepare(`
        INSERT INTO metadata (key, value) VALUES ('schema_version', '2')
        ON CONFLICT(key) DO UPDATE SET value = '2'
      `).run();

      db.exec('COMMIT;');
      console.log(`[DB Migration] Applied schema v2: migrated ${legacyArrows.length} arrows with semantic anchors.`);
    } catch (err) {
      db.exec('ROLLBACK;');
      console.error('[DB Migration Error schema v2]:', err);
      throw err;
    }
  }

  // Schema v3: Migrate legacy circle drawings to first-class circled_dates table
  if (currentVersion < 3) {
    db.exec('BEGIN TRANSACTION;');
    try {
      const legacyCircles = db.prepare("SELECT * FROM drawings WHERE type = 'circle'").all();
      const insertCircled = db.prepare(`
        INSERT OR REPLACE INTO circled_dates (date_key, color, created_at)
        VALUES (?, ?, ?)
      `);

      for (const c of legacyCircles) {
        if (c.anchor_start_date) {
          insertCircled.run(c.anchor_start_date, c.color || '#D23B38', c.created_at || new Date().toISOString());
        }
      }

      db.exec("DELETE FROM drawings WHERE type = 'circle';");

      db.prepare(`
        INSERT INTO metadata (key, value) VALUES ('schema_version', '3')
        ON CONFLICT(key) DO UPDATE SET value = '3'
      `).run();

      db.exec('COMMIT;');
      console.log(`[DB Migration] Applied schema v3: migrated ${legacyCircles.length} legacy circle drawings to circled_dates.`);
    } catch (err) {
      db.exec('ROLLBACK;');
      console.error('[DB Migration Error schema v3]:', err);
      throw err;
    }
  }

  // Schema v4: Multi-user auth, sessions, and user_id scoping
  if (currentVersion < 4) {
    db.exec('BEGIN TRANSACTION;');
    try {
      // 1. Ensure users and sessions tables exist
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL COLLATE NOCASE,
          password_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

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
        CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
      `);

      // 2. Helper to add user_id column to existing data tables
      const addColumnIfNotExists = (tableName, colName, colDef) => {
        const tableCols = db.prepare(`PRAGMA table_info(${tableName})`).all();
        const existingNames = new Set(tableCols.map((c) => c.name));
        if (!existingNames.has(colName)) {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef};`);
        }
      };

      addColumnIfNotExists('notes', 'user_id', 'TEXT');
      addColumnIfNotExists('week_notes', 'user_id', 'TEXT');
      addColumnIfNotExists('month_notes', 'user_id', 'TEXT');
      addColumnIfNotExists('drawings', 'user_id', 'TEXT');
      addColumnIfNotExists('circled_dates', 'user_id', 'TEXT');
      addColumnIfNotExists('settings', 'user_id', 'TEXT');
      addColumnIfNotExists('settings', 'badge_theme', "TEXT DEFAULT 'solid'");

      // 3. Create indices on user_id for high-speed scoped queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
        CREATE INDEX IF NOT EXISTS idx_week_notes_user_id ON week_notes(user_id);
        CREATE INDEX IF NOT EXISTS idx_month_notes_user_id ON month_notes(user_id);
        CREATE INDEX IF NOT EXISTS idx_drawings_user_id ON drawings(user_id);
        CREATE INDEX IF NOT EXISTS idx_circled_dates_user_id ON circled_dates(user_id);
      `);

      db.prepare(`
        INSERT INTO metadata (key, value) VALUES ('schema_version', '4')
        ON CONFLICT(key) DO UPDATE SET value = '4'
      `).run();

      db.exec('COMMIT;');
      console.log('[DB Migration] Applied schema v4: multi-user auth and sessions initialized.');
    } catch (err) {
      db.exec('ROLLBACK;');
      console.error('[DB Migration Error schema v4]:', err);
      throw err;
    }
  }

  if (currentVersion < 5) {
    db.exec('BEGIN TRANSACTION;');
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_drawings_anchor_date ON drawings(user_id, anchor_start_date);
        CREATE INDEX IF NOT EXISTS idx_circled_dates_user_key ON circled_dates(user_id, date_key);
        CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_week_notes_created_at ON week_notes(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_month_notes_created_at ON month_notes(user_id, created_at);
      `);

      db.prepare(`
        INSERT INTO metadata (key, value) VALUES ('schema_version', '5')
        ON CONFLICT(key) DO UPDATE SET value = '5'
      `).run();

      db.exec('COMMIT;');
      console.log('[DB Migration] Applied schema v5: multi-year date and timestamp indexes created.');
    } catch (err) {
      db.exec('ROLLBACK;');
      console.error('[DB Migration Error schema v5]:', err);
      throw err;
    }
  }

  // Schema v6: Permanently purge residual drawings of type 'circle' to prevent zombie circle resurrection
  if (currentVersion < 6) {
    db.exec('BEGIN TRANSACTION;');
    try {
      const residualCircles = db.prepare("SELECT * FROM drawings WHERE type = 'circle'").all();
      const insertCircled = db.prepare(`
        INSERT OR IGNORE INTO circled_dates (date_key, user_id, color, created_at)
        VALUES (?, ?, ?, ?)
      `);
      for (const c of residualCircles) {
        if (c.anchor_start_date) {
          insertCircled.run(c.anchor_start_date, c.user_id || null, c.color || '#D23B38', c.created_at || new Date().toISOString());
        }
      }
      db.exec("DELETE FROM drawings WHERE type = 'circle';");

      db.prepare(`
        INSERT INTO metadata (key, value) VALUES ('schema_version', '6')
        ON CONFLICT(key) DO UPDATE SET value = '6'
      `).run();

      db.exec('COMMIT;');
      console.log(`[DB Migration] Applied schema v6: permanently purged ${residualCircles.length} residual circle drawings.`);
    } catch (err) {
      db.exec('ROLLBACK;');
      console.error('[DB Migration Error schema v6]:', err);
      throw err;
    }
  }
}

/**
 * Reads calendar data from SQLite, optionally filtered by user_id.
 * If userId is null, returns legacy unassigned data.
 */
export function getCalendarData(db = getDatabase(), userId = null) {
  let noteRows, weekNoteRows, monthNoteRows, drawingRows, circledRows, settingsRow;

  if (userId) {
    noteRows = db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY rowid ASC').all(userId);
    weekNoteRows = db.prepare('SELECT * FROM week_notes WHERE user_id = ? ORDER BY rowid ASC').all(userId);
    monthNoteRows = db.prepare('SELECT * FROM month_notes WHERE user_id = ? ORDER BY rowid ASC').all(userId);
    drawingRows = db.prepare("SELECT * FROM drawings WHERE user_id = ? AND type != 'circle' ORDER BY created_at ASC").all(userId);
    circledRows = db.prepare('SELECT * FROM circled_dates WHERE user_id = ? ORDER BY created_at ASC').all(userId);
    settingsRow = db.prepare('SELECT * FROM settings WHERE user_id = ? OR id = ?').get(userId, userId);
  } else {
    noteRows = db.prepare('SELECT * FROM notes WHERE user_id IS NULL ORDER BY rowid ASC').all();
    weekNoteRows = db.prepare('SELECT * FROM week_notes WHERE user_id IS NULL ORDER BY rowid ASC').all();
    monthNoteRows = db.prepare('SELECT * FROM month_notes WHERE user_id IS NULL ORDER BY rowid ASC').all();
    drawingRows = db.prepare("SELECT * FROM drawings WHERE user_id IS NULL AND type != 'circle' ORDER BY created_at ASC").all();
    circledRows = db.prepare('SELECT * FROM circled_dates WHERE user_id IS NULL ORDER BY created_at ASC').all();
    settingsRow = db.prepare("SELECT * FROM settings WHERE user_id IS NULL OR id = 'default'").get();
  }

  const metaRows = db.prepare('SELECT * FROM metadata').all();

  const notes = noteRows.map((r) => ({
    id: r.id,
    content: r.content,
    originalContent: r.original_content || undefined,
    parentDates: JSON.parse(r.parent_dates || '[]'),
    isStruck: Boolean(r.is_struck),
    strikeStyle: r.strike_style || undefined,
    colorTag: r.color_tag || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at || undefined,
  }));

  const weekNotes = weekNoteRows.map((r) => ({
    id: r.id,
    content: r.content,
    originalContent: r.original_content || undefined,
    parentWeeks: JSON.parse(r.parent_weeks || '[]'),
    isStruck: Boolean(r.is_struck),
    strikeStyle: r.strike_style || undefined,
    colorTag: r.color_tag || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at || undefined,
  }));

  const monthNotes = monthNoteRows.map((r) => ({
    id: r.id,
    content: r.content,
    originalContent: r.original_content || undefined,
    parentMonths: JSON.parse(r.parent_months || '[]'),
    isStruck: Boolean(r.is_struck),
    strikeStyle: r.strike_style || undefined,
    colorTag: r.color_tag || undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at || undefined,
  }));

  const drawings = drawingRows.map((r) => ({
    id: r.id,
    type: r.type,
    color: r.color,
    strokeWidth: r.stroke_width,
    anchorStartDate: r.anchor_start_date,
    anchorEndDate: r.anchor_end_date || undefined,
    startAnchor: r.start_anchor ? JSON.parse(r.start_anchor) : undefined,
    endAnchor: r.end_anchor ? JSON.parse(r.end_anchor) : undefined,
    startOffset: JSON.parse(r.start_offset || '{"x":0,"y":0}'),
    endOffset: r.end_offset ? JSON.parse(r.end_offset) : undefined,
    points: JSON.parse(r.points || '[]'),
    createdAt: r.created_at,
  }));

  const circledDates = {};
  for (const r of circledRows) {
    circledDates[r.date_key] = { color: r.color, createdAt: r.created_at };
  }

  let settings = null;
  if (settingsRow) {
    settings = {
      weekStartsOn: settingsRow.week_starts_on,
      showStruckItems: Boolean(settingsRow.show_struck_items),
      activeTool: settingsRow.active_tool,
      inkColor: settingsRow.ink_color,
      badgeTheme: settingsRow.badge_theme || 'solid',
    };
  }

  const metaMap = {};
  for (const m of metaRows) {
    metaMap[m.key] = m.value;
  }

  const hasData =
    notes.length > 0 ||
    weekNotes.length > 0 ||
    monthNotes.length > 0 ||
    drawings.length > 0 ||
    Object.keys(circledDates).length > 0;

  return {
    notes,
    weekNotes,
    monthNotes,
    drawings,
    circledDates,
    settings,
    syncedAt: metaMap['last_synced_at'] || null,
    schemaVersion: Number(metaMap['schema_version']) || 4,
    hasData,
  };
}

/**
 * Saves calendar data into SQLite within a single atomic transaction, scoped by user_id.
 */
export function saveCalendarData(db = getDatabase(), data, userId = null) {
  if (!data) throw new Error('No calendar data provided');

  db.exec('BEGIN TRANSACTION;');
  try {
    // 1. Day Notes
    if (Array.isArray(data.notes)) {
      if (userId) {
        db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId);
      } else {
        db.exec('DELETE FROM notes WHERE user_id IS NULL;');
      }

      const insertNote = db.prepare(`
        INSERT INTO notes (id, user_id, content, original_content, parent_dates, is_struck, strike_style, color_tag, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const n of data.notes) {
        insertNote.run(
          n.id,
          userId || null,
          n.content || '',
          n.originalContent || null,
          JSON.stringify(n.parentDates || []),
          n.isStruck ? 1 : 0,
          n.strikeStyle || null,
          n.colorTag || null,
          n.createdAt || new Date().toISOString(),
          n.updatedAt || null
        );
      }
    }

    // 2. Week Notes
    if (Array.isArray(data.weekNotes)) {
      if (userId) {
        db.prepare('DELETE FROM week_notes WHERE user_id = ?').run(userId);
      } else {
        db.exec('DELETE FROM week_notes WHERE user_id IS NULL;');
      }

      const insertWeekNote = db.prepare(`
        INSERT INTO week_notes (id, user_id, content, original_content, parent_weeks, is_struck, strike_style, color_tag, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const wn of data.weekNotes) {
        insertWeekNote.run(
          wn.id,
          userId || null,
          wn.content || '',
          wn.originalContent || null,
          JSON.stringify(wn.parentWeeks || []),
          wn.isStruck ? 1 : 0,
          wn.strikeStyle || null,
          wn.colorTag || null,
          wn.createdAt || new Date().toISOString(),
          wn.updatedAt || null
        );
      }
    }

    // 3. Month Notes
    if (Array.isArray(data.monthNotes)) {
      if (userId) {
        db.prepare('DELETE FROM month_notes WHERE user_id = ?').run(userId);
      } else {
        db.exec('DELETE FROM month_notes WHERE user_id IS NULL;');
      }

      const insertMonthNote = db.prepare(`
        INSERT INTO month_notes (id, user_id, content, original_content, parent_months, is_struck, strike_style, color_tag, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const mn of data.monthNotes) {
        insertMonthNote.run(
          mn.id,
          userId || null,
          mn.content || '',
          mn.originalContent || null,
          JSON.stringify(mn.parentMonths || []),
          mn.isStruck ? 1 : 0,
          mn.strikeStyle || null,
          mn.colorTag || null,
          mn.createdAt || new Date().toISOString(),
          mn.updatedAt || null
        );
      }
    }

    // 4. Drawings
    if (Array.isArray(data.drawings)) {
      if (userId) {
        db.prepare('DELETE FROM drawings WHERE user_id = ?').run(userId);
      } else {
        db.exec('DELETE FROM drawings WHERE user_id IS NULL;');
      }

      const insertDrawing = db.prepare(`
        INSERT INTO drawings (id, user_id, type, color, stroke_width, anchor_start_date, anchor_end_date, start_offset, end_offset, points, created_at, start_anchor, end_anchor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const d of data.drawings) {
        if (d.type === 'circle') continue;
        insertDrawing.run(
          d.id,
          userId || null,
          d.type || 'freehand',
          d.color || '#2B2C30',
          d.strokeWidth || 2,
          d.anchorStartDate || '',
          d.anchorEndDate || null,
          JSON.stringify(d.startOffset || { x: 0, y: 0 }),
          d.endOffset ? JSON.stringify(d.endOffset) : null,
          JSON.stringify(d.points || []),
          d.createdAt || new Date().toISOString(),
          d.startAnchor ? JSON.stringify(d.startAnchor) : null,
          d.endAnchor ? JSON.stringify(d.endAnchor) : null
        );
      }
    }

    // 5. Circled Dates
    if (data.circledDates && typeof data.circledDates === 'object') {
      if (userId) {
        db.prepare('DELETE FROM circled_dates WHERE user_id = ?').run(userId);
      } else {
        db.exec('DELETE FROM circled_dates WHERE user_id IS NULL;');
      }

      const insertCircled = db.prepare(`
        INSERT INTO circled_dates (date_key, user_id, color, created_at)
        VALUES (?, ?, ?, ?)
      `);
      const entries = Array.isArray(data.circledDates)
        ? data.circledDates
        : Object.entries(data.circledDates).map(([k, v]) => ({
            dateKey: k,
            color: typeof v === 'string' ? v : (v.color || '#D23B38'),
            createdAt: (v && v.createdAt) || new Date().toISOString(),
          }));
      for (const c of entries) {
        insertCircled.run(c.dateKey, userId || null, c.color || '#D23B38', c.createdAt || new Date().toISOString());
      }
    }

    // 6. Settings
    if (data.settings) {
      const s = data.settings;
      const settingsId = userId || 'default';
      const upsertSettings = db.prepare(`
        INSERT INTO settings (id, user_id, week_starts_on, show_struck_items, active_tool, ink_color, badge_theme, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          user_id = excluded.user_id,
          week_starts_on = excluded.week_starts_on,
          show_struck_items = excluded.show_struck_items,
          active_tool = excluded.active_tool,
          ink_color = excluded.ink_color,
          badge_theme = excluded.badge_theme,
          updated_at = excluded.updated_at
      `);
      upsertSettings.run(
        settingsId,
        userId || null,
        s.weekStartsOn ?? 0,
        s.showStruckItems ? 1 : 0,
        s.activeTool || 'select',
        s.inkColor || '#2B2C30',
        s.badgeTheme || 'solid',
        new Date().toISOString()
      );
    }

    const setMeta = db.prepare(`
      INSERT INTO metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const now = new Date().toISOString();
    setMeta.run('last_synced_at', now);
    setMeta.run('schema_version', '4');

    db.exec('COMMIT;');
    return { ok: true, syncedAt: now };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

/**
 * Incrementally applies granular updates and deletions within an atomic transaction.
 * Does NOT drop or re-insert untouched existing records.
 */
export function saveCalendarDelta(db = getDatabase(), delta, userId = null) {
  if (!delta) throw new Error('No delta provided');

  db.exec('BEGIN TRANSACTION;');
  try {
    const now = new Date().toISOString();

    // 1. Day Notes
    if (delta.notes) {
      if (Array.isArray(delta.notes.delete) && delta.notes.delete.length > 0) {
        const deleteStmt = userId
          ? db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
          : db.prepare('DELETE FROM notes WHERE id = ? AND user_id IS NULL');
        for (const id of delta.notes.delete) {
          if (userId) deleteStmt.run(id, userId);
          else deleteStmt.run(id);
        }
      }

      if (Array.isArray(delta.notes.upsert)) {
        const upsertNote = db.prepare(`
          INSERT INTO notes (id, user_id, content, original_content, parent_dates, is_struck, strike_style, color_tag, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            content = excluded.content,
            original_content = excluded.original_content,
            parent_dates = excluded.parent_dates,
            is_struck = excluded.is_struck,
            strike_style = excluded.strike_style,
            color_tag = excluded.color_tag,
            updated_at = excluded.updated_at
        `);
        for (const n of delta.notes.upsert) {
          upsertNote.run(
            n.id,
            userId || null,
            n.content || '',
            n.originalContent || null,
            JSON.stringify(n.parentDates || []),
            n.isStruck ? 1 : 0,
            n.strikeStyle || null,
            n.colorTag || null,
            n.createdAt || now,
            n.updatedAt || now
          );
        }
      }
    }

    // 2. Week Notes
    if (delta.weekNotes) {
      if (Array.isArray(delta.weekNotes.delete) && delta.weekNotes.delete.length > 0) {
        const deleteStmt = userId
          ? db.prepare('DELETE FROM week_notes WHERE id = ? AND user_id = ?')
          : db.prepare('DELETE FROM week_notes WHERE id = ? AND user_id IS NULL');
        for (const id of delta.weekNotes.delete) {
          if (userId) deleteStmt.run(id, userId);
          else deleteStmt.run(id);
        }
      }

      if (Array.isArray(delta.weekNotes.upsert)) {
        const upsertWeekNote = db.prepare(`
          INSERT INTO week_notes (id, user_id, content, original_content, parent_weeks, is_struck, strike_style, color_tag, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            content = excluded.content,
            original_content = excluded.original_content,
            parent_weeks = excluded.parent_weeks,
            is_struck = excluded.is_struck,
            strike_style = excluded.strike_style,
            color_tag = excluded.color_tag,
            updated_at = excluded.updated_at
        `);
        for (const wn of delta.weekNotes.upsert) {
          upsertWeekNote.run(
            wn.id,
            userId || null,
            wn.content || '',
            wn.originalContent || null,
            JSON.stringify(wn.parentWeeks || []),
            wn.isStruck ? 1 : 0,
            wn.strikeStyle || null,
            wn.colorTag || null,
            wn.createdAt || now,
            wn.updatedAt || now
          );
        }
      }
    }

    // 3. Month Notes
    if (delta.monthNotes) {
      if (Array.isArray(delta.monthNotes.delete) && delta.monthNotes.delete.length > 0) {
        const deleteStmt = userId
          ? db.prepare('DELETE FROM month_notes WHERE id = ? AND user_id = ?')
          : db.prepare('DELETE FROM month_notes WHERE id = ? AND user_id IS NULL');
        for (const id of delta.monthNotes.delete) {
          if (userId) deleteStmt.run(id, userId);
          else deleteStmt.run(id);
        }
      }

      if (Array.isArray(delta.monthNotes.upsert)) {
        const upsertMonthNote = db.prepare(`
          INSERT INTO month_notes (id, user_id, content, original_content, parent_months, is_struck, strike_style, color_tag, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            content = excluded.content,
            original_content = excluded.original_content,
            parent_months = excluded.parent_months,
            is_struck = excluded.is_struck,
            strike_style = excluded.strike_style,
            color_tag = excluded.color_tag,
            updated_at = excluded.updated_at
        `);
        for (const mn of delta.monthNotes.upsert) {
          upsertMonthNote.run(
            mn.id,
            userId || null,
            mn.content || '',
            mn.originalContent || null,
            JSON.stringify(mn.parentMonths || []),
            mn.isStruck ? 1 : 0,
            mn.strikeStyle || null,
            mn.colorTag || null,
            mn.createdAt || now,
            mn.updatedAt || now
          );
        }
      }
    }

    // 4. Drawings
    if (delta.drawings) {
      if (Array.isArray(delta.drawings.delete) && delta.drawings.delete.length > 0) {
        const deleteStmt = userId
          ? db.prepare('DELETE FROM drawings WHERE id = ? AND user_id = ?')
          : db.prepare('DELETE FROM drawings WHERE id = ? AND user_id IS NULL');
        for (const id of delta.drawings.delete) {
          if (userId) deleteStmt.run(id, userId);
          else deleteStmt.run(id);
        }
      }

      if (Array.isArray(delta.drawings.upsert)) {
        const upsertDrawing = db.prepare(`
          INSERT INTO drawings (id, user_id, type, color, stroke_width, anchor_start_date, anchor_end_date, start_anchor, end_anchor, start_offset, end_offset, points, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            color = excluded.color,
            stroke_width = excluded.stroke_width,
            anchor_start_date = excluded.anchor_start_date,
            anchor_end_date = excluded.anchor_end_date,
            start_anchor = excluded.start_anchor,
            end_anchor = excluded.end_anchor,
            start_offset = excluded.start_offset,
            end_offset = excluded.end_offset,
            points = excluded.points
        `);
        for (const d of delta.drawings.upsert) {
          if (d.type === 'circle') continue;
          upsertDrawing.run(
            d.id,
            userId || null,
            d.type,
            d.color,
            d.strokeWidth,
            d.anchorStartDate,
            d.anchorEndDate || null,
            d.startAnchor ? JSON.stringify(d.startAnchor) : null,
            d.endAnchor ? JSON.stringify(d.endAnchor) : null,
            JSON.stringify(d.startOffset || { x: 0, y: 0 }),
            d.endOffset ? JSON.stringify(d.endOffset) : null,
            JSON.stringify(d.points || []),
            d.createdAt || now
          );
        }
      }
    }

    // 5. Circled Dates
    if (delta.circledDates) {
      if (Array.isArray(delta.circledDates.delete) && delta.circledDates.delete.length > 0) {
        const deleteStmt = userId
          ? db.prepare('DELETE FROM circled_dates WHERE date_key = ? AND user_id = ?')
          : db.prepare('DELETE FROM circled_dates WHERE date_key = ? AND user_id IS NULL');
        for (const dateKey of delta.circledDates.delete) {
          if (userId) deleteStmt.run(dateKey, userId);
          else deleteStmt.run(dateKey);
        }
      }

      if (delta.circledDates.upsert && typeof delta.circledDates.upsert === 'object') {
        const upsertCircle = db.prepare(`
          INSERT INTO circled_dates (date_key, user_id, color, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(date_key) DO UPDATE SET
            color = excluded.color
        `);
        for (const [dateKey, val] of Object.entries(delta.circledDates.upsert)) {
          upsertCircle.run(dateKey, userId || null, val.color, now);
        }
      }
    }

    // 6. Settings
    if (delta.settings && typeof delta.settings === 'object') {
      const s = delta.settings;
      const targetId = userId || 'default';
      const existingSettings = db.prepare('SELECT id FROM settings WHERE user_id = ? OR id = ?').get(targetId, targetId);

      if (existingSettings) {
        db.prepare(`
          UPDATE settings
          SET week_starts_on = COALESCE(?, week_starts_on),
              show_struck_items = COALESCE(?, show_struck_items),
              active_tool = COALESCE(?, active_tool),
              ink_color = COALESCE(?, ink_color),
              badge_theme = COALESCE(?, badge_theme),
              updated_at = ?
          WHERE id = ? OR user_id = ?
        `).run(
          s.weekStartsOn !== undefined ? s.weekStartsOn : null,
          s.showStruckItems !== undefined ? (s.showStruckItems ? 1 : 0) : null,
          s.activeTool || null,
          s.inkColor || null,
          s.badgeTheme || null,
          now,
          targetId,
          targetId
        );
      } else {
        db.prepare(`
          INSERT INTO settings (id, user_id, week_starts_on, show_struck_items, active_tool, ink_color, badge_theme, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          targetId,
          userId || null,
          s.weekStartsOn ?? 0,
          s.showStruckItems ? 1 : 0,
          s.activeTool || 'select',
          s.inkColor || '#2B2C30',
          s.badgeTheme || 'solid',
          now
        );
      }
    }

    const setMeta = db.prepare(`
      INSERT INTO metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    setMeta.run('last_synced_at', now);

    db.exec('COMMIT;');
    return { ok: true, syncedAt: now };
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Failed to save calendar delta:', err);
    throw err;
  }
}

function readRequestBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        req.destroy();
        reject(new Error('Payload exceeds maximum allowed size'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON payload: ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

function sendJsonResponse(req, res, statusCode, data, extraHeaders = {}) {
  const payload = JSON.stringify(data);
  const origin = req.headers['origin'] || '*';
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders,
  };
  res.writeHead(statusCode, headers);
  res.end(payload);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkTagMatch(content, isStruck, targetTag, status) {
  const cleanTag = targetTag.replace(/^@/, '').toLowerCase();
  // Active tag: matches @tag not preceded by escaping backslash
  const activeRegex = new RegExp(`(^|[^\\\\])@${escapeRegex(cleanTag)}(?![a-zA-Z0-9_:-])`, 'i');
  // Resolved tag: matches ~~@tag~~ not preceded by escaping backslash
  const resolvedRegex = new RegExp(`(^|[^\\\\])~~@${escapeRegex(cleanTag)}~~`, 'i');

  const hasActive = activeRegex.test(content);
  const hasResolved = resolvedRegex.test(content);

  if (!hasActive && !hasResolved) {
    return false;
  }

  if (status === 'open') {
    return !isStruck && hasActive;
  }
  if (status === 'completed') {
    return isStruck || hasResolved;
  }
  return true;
}

function checkStatusMatch(content, isStruck, status) {
  if (status === 'open') {
    return !isStruck;
  }
  if (status === 'completed') {
    return Boolean(isStruck) || /(?:^|[^\\])~~@[a-zA-Z0-9_:-]+~~/.test(content);
  }
  return true;
}

export function findNoteById(db, noteId, userId) {
  let day, week, month;
  if (userId) {
    day = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(noteId, userId);
    if (day) return { row: day, table: 'notes', targetCol: 'parent_dates', scope: 'day' };

    week = db.prepare('SELECT * FROM week_notes WHERE id = ? AND user_id = ?').get(noteId, userId);
    if (week) return { row: week, table: 'week_notes', targetCol: 'parent_weeks', scope: 'week' };

    month = db.prepare('SELECT * FROM month_notes WHERE id = ? AND user_id = ?').get(noteId, userId);
    if (month) return { row: month, table: 'month_notes', targetCol: 'parent_months', scope: 'month' };
  } else {
    day = db.prepare('SELECT * FROM notes WHERE id = ? AND user_id IS NULL').get(noteId);
    if (day) return { row: day, table: 'notes', targetCol: 'parent_dates', scope: 'day' };

    week = db.prepare('SELECT * FROM week_notes WHERE id = ? AND user_id IS NULL').get(noteId);
    if (week) return { row: week, table: 'week_notes', targetCol: 'parent_weeks', scope: 'week' };

    month = db.prepare('SELECT * FROM month_notes WHERE id = ? AND user_id IS NULL').get(noteId);
    if (month) return { row: month, table: 'month_notes', targetCol: 'parent_months', scope: 'month' };
  }
  return null;
}

function formatUnifiedNote(row, scope, targetCol) {
  let targets = [];
  try {
    targets = JSON.parse(row[targetCol] || '[]');
  } catch {
    targets = [];
  }

  return {
    id: row.id,
    scope,
    content: row.content,
    originalContent: row.original_content || null,
    targets,
    isStruck: Boolean(row.is_struck),
    strikeStyle: row.strike_style || null,
    colorTag: row.color_tag || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at || null,
  };
}

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Handles incoming HTTP requests for `/api/*`.
 * Dispatches auth, session, calendar, and granular note requests with full multi-user support.
 */
export function handleApiRequest(req, res, db = getDatabase()) {
  const origin = req.headers['origin'] || '*';

  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return true;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 2. Health check
  if (pathname === '/api/health' && req.method === 'GET') {
    const session = authenticateRequest(req, db);
    const data = getCalendarData(db, session?.userId || null);
    sendJsonResponse(req, res, 200, {
      status: 'ok',
      engine: 'sqlite',
      databasePath: DEFAULT_DB_PATH,
      authenticated: Boolean(session),
      user: session ? { id: session.userId, email: session.email } : null,
      counts: {
        notes: data.notes.length,
        weekNotes: data.weekNotes.length,
        monthNotes: data.monthNotes.length,
        drawings: data.drawings.length,
        circledDates: Object.keys(data.circledDates || {}).length,
      },
      lastSyncedAt: data.syncedAt,
      uptime: process.uptime(),
    });
    return true;
  }

  // 3. Auth: GET /api/auth/me
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    const unclaimedCount = getUnclaimedCount(db);

    if (session) {
      sendJsonResponse(req, res, 200, {
        authenticated: true,
        user: {
          id: session.userId,
          email: session.email,
          createdAt: session.userCreatedAt,
        },
        device: {
          name: session.deviceName,
          type: session.clientType,
        },
        totalUsers,
        unclaimedCount,
      });
    } else {
      sendJsonResponse(req, res, 200, {
        authenticated: false,
        user: null,
        totalUsers,
        unclaimedCount,
        isFirstSetup: totalUsers === 0,
      });
    }
    return true;
  }

  // 4. Auth: POST /api/auth/register
  if (pathname === '/api/auth/register' && req.method === 'POST') {
    readRequestBody(req)
      .then(async (body) => {
        const ip = req.socket?.remoteAddress;
        const result = await registerUser(db, {
          email: body.email,
          password: body.password,
          clientName: body.clientName,
          clientType: body.clientType,
          ipAddress: ip,
        });

        const isSecure = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https';
        const cookieHeader = createSessionCookie(result.token, isSecure);

        sendJsonResponse(
          req,
          res,
          201,
          {
            ok: true,
            token: result.token,
            user: result.user,
            migratedCount: result.migratedCount,
          },
          { 'Set-Cookie': cookieHeader }
        );
      })
      .catch((err) => {
        sendJsonResponse(req, res, 400, { ok: false, error: err.message });
      });
    return true;
  }

  // 5. Auth: POST /api/auth/login
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    readRequestBody(req)
      .then(async (body) => {
        const ip = req.socket?.remoteAddress;
        const result = await loginUser(db, {
          email: body.email,
          password: body.password,
          clientName: body.clientName,
          clientType: body.clientType,
          ipAddress: ip,
        });

        if (!result) {
          sendJsonResponse(req, res, 401, { ok: false, error: 'Invalid email or password' });
          return;
        }

        const isSecure = req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https';
        const cookieHeader = createSessionCookie(result.token, isSecure);

        sendJsonResponse(
          req,
          res,
          200,
          {
            ok: true,
            token: result.token,
            user: result.user,
          },
          { 'Set-Cookie': cookieHeader }
        );
      })
      .catch((err) => {
        sendJsonResponse(req, res, 400, { ok: false, error: err.message });
      });
    return true;
  }

  // 6. Auth: POST /api/auth/logout
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const session = authenticateRequest(req, db);
    if (session?.token) {
      logoutUser(db, session.token);
    }
    const clearCookie = clearSessionCookie();
    sendJsonResponse(req, res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
    return true;
  }

  // 7. Calendar Data GET
  if (pathname === '/api/calendar' && req.method === 'GET') {
    try {
      const session = authenticateRequest(req, db);
      const totalUsers = getUserCount(db);

      if (!session) {
        // If no user has registered yet, allow initial read of unassigned legacy data
        if (totalUsers === 0) {
          const data = getCalendarData(db, null);
          sendJsonResponse(req, res, 200, {
            ...data,
            isFirstSetup: true,
            requiresAuth: true,
          });
          return true;
        }
        sendJsonResponse(req, res, 401, { error: 'Authentication required' });
        return true;
      }

      const data = getCalendarData(db, session.userId);
      sendJsonResponse(req, res, 200, data);
    } catch (err) {
      console.error('SQLite Read Error:', err);
      sendJsonResponse(req, res, 500, { error: 'Failed to read SQLite database' });
    }
    return true;
  }

  // 8. Calendar Data POST (Atomic sync)
  if (pathname === '/api/calendar' && req.method === 'POST') {
    readRequestBody(req)
      .then((payload) => {
        const session = authenticateRequest(req, db);
        const totalUsers = getUserCount(db);

        if (!session) {
          if (totalUsers === 0) {
            const result = saveCalendarData(db, payload, null);
            sendJsonResponse(req, res, 200, result);
            return;
          }
          sendJsonResponse(req, res, 401, { error: 'Authentication required' });
          return;
        }

        const result = saveCalendarData(db, payload, session.userId);
        sendJsonResponse(req, res, 200, result);
      })
      .catch((err) => {
        console.error('SQLite Write Error:', err);
        sendJsonResponse(req, res, 500, { error: 'Failed to write to SQLite database', details: err.message });
      });
    return true;
  }

  // 8b. Incremental Calendar Delta POST (Batch Delta Sync)
  if (pathname === '/api/calendar/delta' && req.method === 'POST') {
    readRequestBody(req)
      .then((payload) => {
        const session = authenticateRequest(req, db);
        const totalUsers = getUserCount(db);

        if (!session) {
          if (totalUsers === 0) {
            const result = saveCalendarDelta(db, payload, null);
            sendJsonResponse(req, res, 200, result);
            return;
          }
          sendJsonResponse(req, res, 401, { error: 'Authentication required' });
          return;
        }

        const result = saveCalendarDelta(db, payload, session.userId);
        sendJsonResponse(req, res, 200, result);
      })
      .catch((err) => {
        console.error('SQLite Delta Write Error:', err);
        sendJsonResponse(req, res, 500, { error: 'Failed to write delta to SQLite database', details: err.message });
      });
    return true;
  }

  // 8c. Granular Drawings API: POST /api/drawings, POST /api/drawings/batch-delete, DELETE /api/drawings/:id
  if (pathname === '/api/drawings' || pathname.startsWith('/api/drawings/')) {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;

    if (pathname === '/api/drawings' && req.method === 'POST') {
      readRequestBody(req)
        .then((drawing) => {
          if (!drawing || !drawing.id || !drawing.type || !drawing.anchorStartDate) {
            sendJsonResponse(req, res, 400, { error: 'id, type, and anchorStartDate are required' });
            return;
          }
          saveCalendarDelta(db, { drawings: { upsert: [drawing] } }, userId);
          sendJsonResponse(req, res, 201, drawing);
        })
        .catch((err) => sendJsonResponse(req, res, 400, { error: err.message }));
      return true;
    }

    if (pathname === '/api/drawings/batch-delete' && req.method === 'POST') {
      readRequestBody(req)
        .then((body) => {
          const ids = Array.isArray(body?.ids) ? body.ids : [];
          if (ids.length === 0) {
            sendJsonResponse(req, res, 400, { error: 'ids array is required' });
            return;
          }
          saveCalendarDelta(db, { drawings: { delete: ids } }, userId);
          sendJsonResponse(req, res, 200, { ok: true, deletedCount: ids.length });
        })
        .catch((err) => sendJsonResponse(req, res, 400, { error: err.message }));
      return true;
    }

    const drawingIdMatch = pathname.match(/^\/api\/drawings\/([^/]+)$/);
    if (drawingIdMatch && req.method === 'DELETE') {
      const drawingId = decodeURIComponent(drawingIdMatch[1]);
      saveCalendarDelta(db, { drawings: { delete: [drawingId] } }, userId);
      sendJsonResponse(req, res, 200, { ok: true, deletedId: drawingId });
      return true;
    }
  }

  // 8d. Granular Circled Dates API: PUT /api/circled-dates/:dateKey, DELETE /api/circled-dates/:dateKey
  const circleDateMatch = pathname.match(/^\/api\/circled-dates\/([^/]+)$/);
  if (circleDateMatch) {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;
    const dateKey = decodeURIComponent(circleDateMatch[1]);

    if (req.method === 'PUT') {
      readRequestBody(req)
        .then((body) => {
          const color = body?.color || '#D23B38';
          saveCalendarDelta(db, { circledDates: { upsert: { [dateKey]: { color } } } }, userId);
          sendJsonResponse(req, res, 200, { ok: true, dateKey, color });
        })
        .catch((err) => sendJsonResponse(req, res, 400, { error: err.message }));
      return true;
    }

    if (req.method === 'DELETE') {
      saveCalendarDelta(db, { circledDates: { delete: [dateKey] } }, userId);
      sendJsonResponse(req, res, 200, { ok: true, deletedDateKey: dateKey });
      return true;
    }
  }

  // 8e. Settings Partial Update: PATCH /api/settings
  if (pathname === '/api/settings' && req.method === 'PATCH') {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;

    readRequestBody(req)
      .then((settings) => {
        saveCalendarDelta(db, { settings }, userId);
        sendJsonResponse(req, res, 200, { ok: true, settings });
      })
      .catch((err) => sendJsonResponse(req, res, 400, { error: err.message }));
    return true;
  }

  // 9. Granular Note CRUD: /api/notes and /api/notes/:id
  if (pathname === '/api/notes' || pathname.startsWith('/api/notes/')) {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);

    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;

    // A. Query & Filter: GET /api/notes
    if (pathname === '/api/notes' && req.method === 'GET') {
      const scopeParam = parsedUrl.searchParams.get('scope') || 'all';
      const dateParam = parsedUrl.searchParams.get('date');
      const startDateParam = parsedUrl.searchParams.get('start_date');
      const endDateParam = parsedUrl.searchParams.get('end_date');
      const weekParam = parsedUrl.searchParams.get('week');
      const monthParam = parsedUrl.searchParams.get('month');
      const tagParam = parsedUrl.searchParams.get('tag');
      const statusParam = parsedUrl.searchParams.get('status') || 'all';
      const qParam = parsedUrl.searchParams.get('q');
      const limit = Math.max(1, Math.min(500, parseInt(parsedUrl.searchParams.get('limit') || '50', 10)));
      const offset = Math.max(0, parseInt(parsedUrl.searchParams.get('offset') || '0', 10));

      let results = [];

      if (scopeParam === 'day' || scopeParam === 'all') {
        const rows = userId
          ? db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC').all(userId)
          : db.prepare('SELECT * FROM notes WHERE user_id IS NULL ORDER BY created_at DESC').all();
        for (const r of rows) {
          results.push(formatUnifiedNote(r, 'day', 'parent_dates'));
        }
      }

      if (scopeParam === 'week' || scopeParam === 'all') {
        const rows = userId
          ? db.prepare('SELECT * FROM week_notes WHERE user_id = ? ORDER BY created_at DESC').all(userId)
          : db.prepare('SELECT * FROM week_notes WHERE user_id IS NULL ORDER BY created_at DESC').all();
        for (const r of rows) {
          results.push(formatUnifiedNote(r, 'week', 'parent_weeks'));
        }
      }

      if (scopeParam === 'month' || scopeParam === 'all') {
        const rows = userId
          ? db.prepare('SELECT * FROM month_notes WHERE user_id = ? ORDER BY created_at DESC').all(userId)
          : db.prepare('SELECT * FROM month_notes WHERE user_id IS NULL ORDER BY created_at DESC').all();
        for (const r of rows) {
          results.push(formatUnifiedNote(r, 'month', 'parent_months'));
        }
      }

      let filtered = results.filter((note) => {
        // 1. Date filter (for day notes)
        if (dateParam) {
          // Exact single date takes precedence
          if (note.scope === 'day' && !note.targets.includes(dateParam)) return false;
          if (note.scope !== 'day' && scopeParam !== 'all') return false;
        } else if (startDateParam || endDateParam) {
          // Date range filter (supports closed [startDate, endDate] or open-ended ranges)
          if (note.scope === 'day') {
            const inRange = note.targets.some((d) => {
              if (startDateParam && d < startDateParam) return false;
              if (endDateParam && d > endDateParam) return false;
              return true;
            });
            if (!inRange) return false;
          } else if (scopeParam !== 'all') {
            return false;
          }
        }

        if (weekParam) {
          if (note.scope === 'week' && !note.targets.includes(weekParam)) return false;
          if (note.scope !== 'week' && scopeParam !== 'all') return false;
        }

        if (monthParam) {
          if (note.scope === 'month' && !note.targets.includes(monthParam)) return false;
          if (note.scope !== 'month' && scopeParam !== 'all') return false;
        }

        if (qParam && !note.content.toLowerCase().includes(qParam.toLowerCase())) {
          return false;
        }

        if (tagParam) {
          if (!checkTagMatch(note.content, note.isStruck, tagParam, statusParam)) {
            return false;
          }
        } else if (statusParam !== 'all') {
          if (!checkStatusMatch(note.content, note.isStruck, statusParam)) {
            return false;
          }
        }

        return true;
      });

      filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const total = filtered.length;
      const paged = filtered.slice(offset, offset + limit);

      sendJsonResponse(req, res, 200, {
        total,
        limit,
        offset,
        notes: paged,
      });
      return true;
    }

    // B. Create Note: POST /api/notes
    if (pathname === '/api/notes' && req.method === 'POST') {
      readRequestBody(req)
        .then((body) => {
          const scope = body.scope || 'day';
          if (!['day', 'week', 'month'].includes(scope)) {
            sendJsonResponse(req, res, 400, { error: 'scope must be day, week, or month' });
            return;
          }
          if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
            sendJsonResponse(req, res, 400, { error: 'content is required and must be non-empty' });
            return;
          }

          const content = body.content.trim();
          const now = new Date();
          let targets = Array.isArray(body.targets) ? body.targets : [];

          if (targets.length === 0) {
            if (scope === 'day') {
              const y = now.getFullYear();
              const m = String(now.getMonth() + 1).padStart(2, '0');
              const d = String(now.getDate()).padStart(2, '0');
              targets = [`${y}-${m}-${d}`];
            } else if (scope === 'week') {
              targets = [getIsoWeek(now)];
            } else if (scope === 'month') {
              const y = now.getFullYear();
              const m = String(now.getMonth() + 1).padStart(2, '0');
              targets = [`${y}-${m}`];
            }
          }

          const prefix = scope === 'week' ? 'week-note' : scope === 'month' ? 'month-note' : 'note';
          const id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const createdAt = now.toISOString();
          const isStruck = body.isStruck ? 1 : 0;
          const strikeStyle = body.strikeStyle || null;
          const colorTag = body.colorTag || null;
          const originalContent = body.originalContent || null;

          if (scope === 'day') {
            db.prepare(`
              INSERT INTO notes (id, user_id, content, original_content, parent_dates, is_struck, strike_style, color_tag, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, userId, content, originalContent, JSON.stringify(targets), isStruck, strikeStyle, colorTag, createdAt, null);
          } else if (scope === 'week') {
            db.prepare(`
              INSERT INTO week_notes (id, user_id, content, original_content, parent_weeks, is_struck, strike_style, color_tag, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, userId, content, originalContent, JSON.stringify(targets), isStruck, strikeStyle, colorTag, createdAt, null);
          } else {
            db.prepare(`
              INSERT INTO month_notes (id, user_id, content, original_content, parent_months, is_struck, strike_style, color_tag, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(id, userId, content, originalContent, JSON.stringify(targets), isStruck, strikeStyle, colorTag, createdAt, null);
          }

          sendJsonResponse(req, res, 201, {
            id,
            scope,
            content,
            originalContent,
            targets,
            isStruck: Boolean(isStruck),
            strikeStyle,
            colorTag,
            createdAt,
            updatedAt: null,
          });
        })
        .catch((err) => {
          sendJsonResponse(req, res, 400, { error: err.message });
        });
      return true;
    }

    // C. Quick Strike Toggle: POST /api/notes/:id/toggle-strike
    const toggleStrikeMatch = pathname.match(/^\/api\/notes\/([^/]+)\/toggle-strike$/);
    if (toggleStrikeMatch && req.method === 'POST') {
      const noteId = decodeURIComponent(toggleStrikeMatch[1]);
      const found = findNoteById(db, noteId, userId);
      if (!found) {
        sendJsonResponse(req, res, 404, { error: `Note not found with id: ${noteId}` });
        return true;
      }

      const nextStruck = found.row.is_struck ? 0 : 1;
      const now = new Date().toISOString();

      db.prepare(`UPDATE ${found.table} SET is_struck = ?, updated_at = ? WHERE id = ?`).run(nextStruck, now, noteId);

      sendJsonResponse(req, res, 200, {
        id: noteId,
        scope: found.scope,
        isStruck: Boolean(nextStruck),
        updatedAt: now,
      });
      return true;
    }

    // D. Single Note ID operations: GET, PATCH, DELETE /api/notes/:id
    const noteIdMatch = pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (noteIdMatch) {
      const noteId = decodeURIComponent(noteIdMatch[1]);
      const found = findNoteById(db, noteId, userId);

      if (req.method === 'GET') {
        if (!found) {
          sendJsonResponse(req, res, 404, { error: `Note not found with id: ${noteId}` });
          return true;
        }
        sendJsonResponse(req, res, 200, formatUnifiedNote(found.row, found.scope, found.targetCol));
        return true;
      }

      if (req.method === 'PATCH') {
        if (!found) {
          sendJsonResponse(req, res, 404, { error: `Note not found with id: ${noteId}` });
          return true;
        }

        readRequestBody(req)
          .then((body) => {
            const current = found.row;
            let newContent = current.content;
            let newOriginalContent = current.original_content;
            let newTargets = current[found.targetCol];
            let newIsStruck = current.is_struck;
            let newStrikeStyle = current.strike_style;
            let newColorTag = current.color_tag;

            if (typeof body.content === 'string') {
              const trimmed = body.content.trim();
              if (body.preserveDiff === true && trimmed !== current.content) {
                newOriginalContent = current.content;
              } else if (body.originalContent !== undefined) {
                newOriginalContent = body.originalContent || null;
              } else if (body.preserveDiff !== true) {
                newOriginalContent = null;
              }
              newContent = trimmed;
            }

            if (Array.isArray(body.targets)) {
              newTargets = JSON.stringify(body.targets);
            }
            if (typeof body.isStruck === 'boolean') {
              newIsStruck = body.isStruck ? 1 : 0;
            }
            if (body.strikeStyle !== undefined) {
              newStrikeStyle = body.strikeStyle || null;
            }
            if (body.colorTag !== undefined) {
              newColorTag = body.colorTag || null;
            }

            const now = new Date().toISOString();

            db.prepare(`
              UPDATE ${found.table}
              SET content = ?, original_content = ?, ${found.targetCol} = ?, is_struck = ?, strike_style = ?, color_tag = ?, updated_at = ?
              WHERE id = ?
            `).run(newContent, newOriginalContent, newTargets, newIsStruck, newStrikeStyle, newColorTag, now, noteId);

            const updatedRow = {
              ...current,
              content: newContent,
              original_content: newOriginalContent,
              [found.targetCol]: newTargets,
              is_struck: newIsStruck,
              strike_style: newStrikeStyle,
              color_tag: newColorTag,
              updated_at: now,
            };

            sendJsonResponse(req, res, 200, formatUnifiedNote(updatedRow, found.scope, found.targetCol));
          })
          .catch((err) => {
            sendJsonResponse(req, res, 400, { error: err.message });
          });
        return true;
      }

      if (req.method === 'DELETE') {
        if (!found) {
          sendJsonResponse(req, res, 404, { error: `Note not found with id: ${noteId}` });
          return true;
        }

        if (userId) {
          db.prepare(`DELETE FROM ${found.table} WHERE id = ? AND user_id = ?`).run(noteId, userId);
        } else {
          db.prepare(`DELETE FROM ${found.table} WHERE id = ? AND user_id IS NULL`).run(noteId);
        }

        sendJsonResponse(req, res, 200, { ok: true, deletedId: noteId });
        return true;
      }
    }
  }

  return false;
}
