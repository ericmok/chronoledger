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
    drawingRows = db.prepare('SELECT * FROM drawings WHERE user_id = ? ORDER BY created_at ASC').all(userId);
    circledRows = db.prepare('SELECT * FROM circled_dates WHERE user_id = ? ORDER BY created_at ASC').all(userId);
    settingsRow = db.prepare('SELECT * FROM settings WHERE user_id = ? OR id = ?').get(userId, userId);
  } else {
    noteRows = db.prepare('SELECT * FROM notes WHERE user_id IS NULL ORDER BY rowid ASC').all();
    weekNoteRows = db.prepare('SELECT * FROM week_notes WHERE user_id IS NULL ORDER BY rowid ASC').all();
    monthNoteRows = db.prepare('SELECT * FROM month_notes WHERE user_id IS NULL ORDER BY rowid ASC').all();
    drawingRows = db.prepare('SELECT * FROM drawings WHERE user_id IS NULL ORDER BY created_at ASC').all();
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    ...extraHeaders,
  };
  res.writeHead(statusCode, headers);
  res.end(payload);
}

/**
 * Handles incoming HTTP requests for `/api/*`.
 * Dispatches auth, session, and calendar requests with full multi-user support.
 */
export function handleApiRequest(req, res, db = getDatabase()) {
  const origin = req.headers['origin'] || '*';

  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  return false;
}
