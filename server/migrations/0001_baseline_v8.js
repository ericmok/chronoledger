import { calculateBounds, getIsoWeek } from '../bounds.js';

/**
 * Migration 0001: Squashed Baseline (Schema Version 8)
 *
 * Consolidates all database tables, columns, indexes, and compatibility views
 * up to Schema v8 into a single declarative baseline.
 *
 * If run against a legacy database (containing obsolete parent_dates or physical
 * week_notes/month_notes tables), it transparently upgrades legacy data into the
 * unified schema.
 */

export const schemaVersion = 8;

export function up(db) {
  // 1. Detect if the database contains legacy pre-v8 tables or columns
  const tableRows = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view')").all();
  const tables = new Set(tableRows.filter((r) => r.type === 'table').map((r) => r.name));
  const hasNotesTable = tables.has('notes');
  const noteCols = hasNotesTable
    ? new Set(db.prepare('PRAGMA table_info(notes)').all().map((c) => c.name))
    : new Set();

  const isLegacy = noteCols.has('parent_dates') || tables.has('week_notes');

  // Helper to ensure column exists
  const ensureColumn = (tableName, colName, colDef) => {
    if (!tables.has(tableName)) return;
    const cols = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!cols.some((c) => c.name === colName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef};`);
    }
  };

  if (isLegacy) {
    // --- Legacy Bridge: Upgrade historical schemas (v2 through v7) into unified v8 ---

    // Ensure drawings columns (start_anchor, end_anchor, user_id, revision)
    ensureColumn('drawings', 'start_anchor', 'TEXT');
    ensureColumn('drawings', 'end_anchor', 'TEXT');
    ensureColumn('drawings', 'user_id', 'TEXT');
    ensureColumn('drawings', 'revision', 'INTEGER NOT NULL DEFAULT 1');

    // Ensure circled_dates table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS circled_dates (
        date_key TEXT PRIMARY KEY,
        user_id TEXT,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1
      );
    `);
    ensureColumn('circled_dates', 'user_id', 'TEXT');
    ensureColumn('circled_dates', 'revision', 'INTEGER NOT NULL DEFAULT 1');

    // Ensure settings columns
    ensureColumn('settings', 'user_id', 'TEXT');
    ensureColumn('settings', 'badge_theme', "TEXT DEFAULT 'solid'");

    // Synthesize anchors for legacy arrows if missing
    const legacyArrows = db
      .prepare("SELECT * FROM drawings WHERE type = 'arrow' AND (start_anchor IS NULL OR start_anchor = '')")
      .all();
    if (legacyArrows.length > 0) {
      const noteRows = noteCols.has('parent_dates')
        ? db.prepare('SELECT id, parent_dates FROM notes').all()
        : noteCols.has('targets')
        ? db.prepare('SELECT id, targets AS parent_dates FROM notes').all()
        : [];
      const notesByDate = new Map();
      for (const n of noteRows) {
        let parentDates = [];
        try { parentDates = JSON.parse(n.parent_dates || '[]'); } catch {}
        for (const d of parentDates) {
          const list = notesByDate.get(d) || [];
          list.push(n.id);
          notesByDate.set(d, list);
        }
      }

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

        const startAnchor = {
          dateString: row.anchor_start_date,
          noteId: startNotes.length > 0 ? startNotes[0] : undefined,
          xRatio: Number(startXRatio.toFixed(3)),
          yRatio: 0.5,
        };

        const endAnchor = {
          dateString: row.anchor_end_date || row.anchor_start_date,
          noteId: endNotes.length > 0 ? endNotes[0] : undefined,
          xRatio: Number(endXRatio.toFixed(3)),
          yRatio: 0.5,
        };

        updateStmt.run(JSON.stringify(startAnchor), JSON.stringify(endAnchor), row.id);
      }
    }

    // Migrate residual circle drawings to circled_dates
    const residualCircles = db.prepare("SELECT * FROM drawings WHERE type = 'circle'").all();
    if (residualCircles.length > 0) {
      const insertCircled = db.prepare(`
        INSERT OR IGNORE INTO circled_dates (date_key, user_id, color, created_at, revision)
        VALUES (?, ?, ?, ?, 1)
      `);
      for (const c of residualCircles) {
        if (c.anchor_start_date) {
          insertCircled.run(c.anchor_start_date, c.user_id || null, c.color || '#D23B38', c.created_at || new Date().toISOString());
        }
      }
      db.exec("DELETE FROM drawings WHERE type = 'circle';");
    }

    // Consolidate legacy notes, week_notes, and month_notes into notes_v2
    db.exec(`
      CREATE TABLE IF NOT EXISTS notes_v2 (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        content TEXT NOT NULL,
        original_content TEXT,
        scope TEXT NOT NULL,
        targets TEXT NOT NULL CHECK (json_valid(targets) AND json_type(targets) = 'array'),
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        is_struck INTEGER NOT NULL DEFAULT 0,
        strike_style TEXT,
        color_tag TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        revision INTEGER NOT NULL DEFAULT 1
      );
    `);

    const insertUnifiedStmt = db.prepare(`
      INSERT OR REPLACE INTO notes_v2 (id, user_id, content, original_content, scope, targets, start_at, end_at, is_struck, strike_style, color_tag, created_at, updated_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 1. Day notes
    if (hasNotesTable) {
      const existingNotes = db.prepare('SELECT * FROM notes').all();
      for (const r of existingNotes) {
        let targets = [];
        try {
          targets = JSON.parse(r.targets || r.parent_dates || '[]');
        } catch {
          targets = [];
        }
        if (!Array.isArray(targets) || targets.length === 0) {
          targets = [r.created_at ? r.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10)];
        }
        const scope = r.scope || 'day';
        const bounds = calculateBounds(scope, targets);
        insertUnifiedStmt.run(
          r.id,
          r.user_id || null,
          r.content,
          r.original_content || null,
          scope,
          JSON.stringify(targets),
          bounds.startAt,
          bounds.endAt,
          r.is_struck ? 1 : 0,
          r.strike_style || null,
          r.color_tag || null,
          r.created_at,
          r.updated_at || null,
          r.revision || 1
        );
      }
    }

    // 2. Physical week_notes table
    if (tables.has('week_notes')) {
      const existingWeekNotes = db.prepare('SELECT * FROM week_notes').all();
      for (const r of existingWeekNotes) {
        let targets = [];
        try {
          targets = JSON.parse(r.targets || r.parent_weeks || '[]');
        } catch {
          targets = [];
        }
        if (!Array.isArray(targets) || targets.length === 0) {
          targets = [getIsoWeek(new Date(r.created_at || Date.now()))];
        }
        const bounds = calculateBounds('week', targets);
        insertUnifiedStmt.run(
          r.id,
          r.user_id || null,
          r.content,
          r.original_content || null,
          'week',
          JSON.stringify(targets),
          bounds.startAt,
          bounds.endAt,
          r.is_struck ? 1 : 0,
          r.strike_style || null,
          r.color_tag || null,
          r.created_at,
          r.updated_at || null,
          r.revision || 1
        );
      }
      db.exec('DROP TABLE week_notes;');
    }

    // 3. Physical month_notes table
    if (tables.has('month_notes')) {
      const existingMonthNotes = db.prepare('SELECT * FROM month_notes').all();
      for (const r of existingMonthNotes) {
        let targets = [];
        try {
          targets = JSON.parse(r.targets || r.parent_months || '[]');
        } catch {
          targets = [];
        }
        if (!Array.isArray(targets) || targets.length === 0) {
          targets = [(r.created_at || new Date().toISOString()).slice(0, 7)];
        }
        const bounds = calculateBounds('month', targets);
        insertUnifiedStmt.run(
          r.id,
          r.user_id || null,
          r.content,
          r.original_content || null,
          'month',
          JSON.stringify(targets),
          bounds.startAt,
          bounds.endAt,
          r.is_struck ? 1 : 0,
          r.strike_style || null,
          r.color_tag || null,
          r.created_at,
          r.updated_at || null,
          r.revision || 1
        );
      }
      db.exec('DROP TABLE month_notes;');
    }

    // 4. Swap tables: drop triggers/views first to satisfy SQLite view constraints
    db.exec(`
      DROP TRIGGER IF EXISTS trg_week_notes_insert;
      DROP TRIGGER IF EXISTS trg_week_notes_delete;
      DROP TRIGGER IF EXISTS trg_month_notes_insert;
      DROP TRIGGER IF EXISTS trg_month_notes_delete;
      DROP VIEW IF EXISTS week_notes;
      DROP VIEW IF EXISTS month_notes;
      DROP TABLE IF EXISTS notes;
      ALTER TABLE notes_v2 RENAME TO notes;
    `);
  }

  // --- Declarative Schema v8 DDL (idempotent for fresh or upgraded databases) ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      content TEXT NOT NULL,
      original_content TEXT,
      scope TEXT NOT NULL,
      targets TEXT NOT NULL CHECK (json_valid(targets) AND json_type(targets) = 'array'),
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      is_struck INTEGER NOT NULL DEFAULT 0,
      strike_style TEXT,
      color_tag TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      revision INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS drawings (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      type TEXT NOT NULL,
      color TEXT NOT NULL,
      stroke_width REAL NOT NULL,
      anchor_start_date TEXT NOT NULL,
      anchor_end_date TEXT,
      start_anchor TEXT,
      end_anchor TEXT,
      start_offset TEXT NOT NULL,
      end_offset TEXT,
      points TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS circled_dates (
      date_key TEXT PRIMARY KEY,
      user_id TEXT,
      color TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1
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

    CREATE TABLE IF NOT EXISTS ledger_sequences (
      user_id TEXT PRIMARY KEY,
      current_revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deleted_records (
      id TEXT NOT NULL,
      user_id TEXT,
      entity_type TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      revision INTEGER NOT NULL,
      PRIMARY KEY (id, user_id)
    );

    INSERT OR IGNORE INTO ledger_sequences (user_id, current_revision, updated_at)
    VALUES ('__guest__', 1, datetime('now'));

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_notes_user_scope ON notes(user_id, scope);
    CREATE INDEX IF NOT EXISTS idx_notes_range ON notes(user_id, start_at, end_at);
    CREATE INDEX IF NOT EXISTS idx_notes_sync ON notes(user_id, revision);
    CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(user_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_drawings_user_id ON drawings(user_id);
    CREATE INDEX IF NOT EXISTS idx_drawings_anchor_date ON drawings(user_id, anchor_start_date);

    CREATE INDEX IF NOT EXISTS idx_circled_dates_user_id ON circled_dates(user_id);
    CREATE INDEX IF NOT EXISTS idx_circled_dates_user_key ON circled_dates(user_id, date_key);

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

    CREATE INDEX IF NOT EXISTS idx_deleted_records_sync ON deleted_records(user_id, revision);
    CREATE INDEX IF NOT EXISTS idx_deleted_records_ttl ON deleted_records(deleted_at);

    -- Backward-compatible views
    CREATE VIEW IF NOT EXISTS week_notes AS
      SELECT id, user_id, content, original_content, targets AS parent_weeks, is_struck, strike_style, color_tag, created_at, updated_at, revision
      FROM notes WHERE scope = 'week';

    CREATE VIEW IF NOT EXISTS month_notes AS
      SELECT id, user_id, content, original_content, targets AS parent_months, is_struck, strike_style, color_tag, created_at, updated_at, revision
      FROM notes WHERE scope = 'month';

    -- INSTEAD OF triggers for backward compatibility
    CREATE TRIGGER IF NOT EXISTS trg_week_notes_insert
    INSTEAD OF INSERT ON week_notes
    BEGIN
      INSERT INTO notes (id, user_id, content, original_content, scope, targets, start_at, end_at, is_struck, strike_style, color_tag, created_at, updated_at, revision)
      VALUES (NEW.id, NEW.user_id, NEW.content, NEW.original_content, 'week', NEW.parent_weeks, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NEW.is_struck, NEW.strike_style, NEW.color_tag, NEW.created_at, NEW.updated_at, COALESCE(NEW.revision, 1));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_week_notes_delete
    INSTEAD OF DELETE ON week_notes
    BEGIN
      DELETE FROM notes WHERE id = OLD.id;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_month_notes_insert
    INSTEAD OF INSERT ON month_notes
    BEGIN
      INSERT INTO notes (id, user_id, content, original_content, scope, targets, start_at, end_at, is_struck, strike_style, color_tag, created_at, updated_at, revision)
      VALUES (NEW.id, NEW.user_id, NEW.content, NEW.original_content, 'month', NEW.parent_months, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NEW.is_struck, NEW.strike_style, NEW.color_tag, NEW.created_at, NEW.updated_at, COALESCE(NEW.revision, 1));
    END;

    CREATE TRIGGER IF NOT EXISTS trg_month_notes_delete
    INSTEAD OF DELETE ON month_notes
    BEGIN
      DELETE FROM notes WHERE id = OLD.id;
    END;
  `);

  db.prepare(`
    INSERT INTO metadata (key, value) VALUES ('schema_version', '8')
    ON CONFLICT(key) DO UPDATE SET value = '8'
  `).run();
}

export function down(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_month_notes_delete;
    DROP TRIGGER IF EXISTS trg_month_notes_insert;
    DROP TRIGGER IF EXISTS trg_week_notes_delete;
    DROP TRIGGER IF EXISTS trg_week_notes_insert;
    DROP VIEW IF EXISTS month_notes;
    DROP VIEW IF EXISTS week_notes;
    DROP TABLE IF EXISTS deleted_records;
    DROP TABLE IF EXISTS ledger_sequences;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS circled_dates;
    DROP TABLE IF EXISTS drawings;
    DROP TABLE IF EXISTS notes;
    DROP TABLE IF EXISTS metadata;
  `);
}
