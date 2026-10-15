import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'default',
      week_starts_on INTEGER NOT NULL DEFAULT 0,
      show_struck_items INTEGER NOT NULL DEFAULT 1,
      active_tool TEXT NOT NULL DEFAULT 'select',
      ink_color TEXT NOT NULL DEFAULT '#2B2C30',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  cachedDb = db;
  return db;
}

/**
 * Reads all calendar data from the SQLite database.
 */
export function getCalendarData(db = getDatabase()) {
  const noteRows = db.prepare('SELECT * FROM notes ORDER BY rowid ASC').all();
  const weekNoteRows = db.prepare('SELECT * FROM week_notes ORDER BY rowid ASC').all();
  const monthNoteRows = db.prepare('SELECT * FROM month_notes ORDER BY rowid ASC').all();
  const drawingRows = db.prepare('SELECT * FROM drawings ORDER BY created_at ASC').all();
  const settingsRow = db.prepare('SELECT * FROM settings WHERE id = ?').get('default');
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
    startOffset: JSON.parse(r.start_offset || '{"x":0,"y":0}'),
    endOffset: r.end_offset ? JSON.parse(r.end_offset) : undefined,
    points: JSON.parse(r.points || '[]'),
    createdAt: r.created_at,
  }));

  let settings = null;
  if (settingsRow) {
    settings = {
      weekStartsOn: settingsRow.week_starts_on,
      showStruckItems: Boolean(settingsRow.show_struck_items),
      activeTool: settingsRow.active_tool,
      inkColor: settingsRow.ink_color,
    };
  }

  const metaMap = {};
  for (const m of metaRows) {
    metaMap[m.key] = m.value;
  }

  const hasData = notes.length > 0 || weekNotes.length > 0 || monthNotes.length > 0 || drawings.length > 0;

  return {
    notes,
    weekNotes,
    monthNotes,
    drawings,
    settings,
    syncedAt: metaMap['last_synced_at'] || null,
    schemaVersion: Number(metaMap['schema_version']) || 1,
    hasData,
  };
}

/**
 * Saves all calendar data into SQLite within a single atomic transaction.
 */
export function saveCalendarData(db = getDatabase(), data) {
  if (!data) throw new Error('No calendar data provided');

  db.exec('BEGIN TRANSACTION;');
  try {
    if (Array.isArray(data.notes)) {
      db.exec('DELETE FROM notes;');
      const insertNote = db.prepare(`
        INSERT INTO notes (id, content, original_content, parent_dates, is_struck, strike_style, color_tag, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const n of data.notes) {
        insertNote.run(
          n.id,
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

    if (Array.isArray(data.weekNotes)) {
      db.exec('DELETE FROM week_notes;');
      const insertWeekNote = db.prepare(`
        INSERT INTO week_notes (id, content, original_content, parent_weeks, is_struck, strike_style, color_tag, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const wn of data.weekNotes) {
        insertWeekNote.run(
          wn.id,
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

    if (Array.isArray(data.monthNotes)) {
      db.exec('DELETE FROM month_notes;');
      const insertMonthNote = db.prepare(`
        INSERT INTO month_notes (id, content, original_content, parent_months, is_struck, strike_style, color_tag, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const mn of data.monthNotes) {
        insertMonthNote.run(
          mn.id,
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

    if (Array.isArray(data.drawings)) {
      db.exec('DELETE FROM drawings;');
      const insertDrawing = db.prepare(`
        INSERT INTO drawings (id, type, color, stroke_width, anchor_start_date, anchor_end_date, start_offset, end_offset, points, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const d of data.drawings) {
        insertDrawing.run(
          d.id,
          d.type || 'freehand',
          d.color || '#2B2C30',
          d.strokeWidth || 2,
          d.anchorStartDate || '',
          d.anchorEndDate || null,
          JSON.stringify(d.startOffset || { x: 0, y: 0 }),
          d.endOffset ? JSON.stringify(d.endOffset) : null,
          JSON.stringify(d.points || []),
          d.createdAt || new Date().toISOString()
        );
      }
    }

    if (data.settings) {
      const s = data.settings;
      const upsertSettings = db.prepare(`
        INSERT INTO settings (id, week_starts_on, show_struck_items, active_tool, ink_color, updated_at)
        VALUES ('default', ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          week_starts_on = excluded.week_starts_on,
          show_struck_items = excluded.show_struck_items,
          active_tool = excluded.active_tool,
          ink_color = excluded.ink_color,
          updated_at = excluded.updated_at
      `);
      upsertSettings.run(
        s.weekStartsOn ?? 0,
        s.showStruckItems ? 1 : 0,
        s.activeTool || 'select',
        s.inkColor || '#2B2C30',
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
    setMeta.run('schema_version', '1');

    db.exec('COMMIT;');
    return { ok: true, syncedAt: now };
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

function sendJsonResponse(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(payload);
}

/**
 * Handles incoming HTTP requests for `/api/*`.
 */
export function handleApiRequest(req, res, db = getDatabase()) {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return true;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health check
  if (pathname === '/api/health' && req.method === 'GET') {
    const data = getCalendarData(db);
    sendJsonResponse(res, 200, {
      status: 'ok',
      engine: 'sqlite',
      databasePath: DEFAULT_DB_PATH,
      counts: {
        notes: data.notes.length,
        weekNotes: data.weekNotes.length,
        monthNotes: data.monthNotes.length,
        drawings: data.drawings.length,
      },
      lastSyncedAt: data.syncedAt,
      uptime: process.uptime(),
    });
    return true;
  }

  // 2. Calendar Data GET
  if (pathname === '/api/calendar' && req.method === 'GET') {
    try {
      const data = getCalendarData(db);
      sendJsonResponse(res, 200, data);
    } catch (err) {
      console.error('SQLite Read Error:', err);
      sendJsonResponse(res, 500, { error: 'Failed to read SQLite database' });
    }
    return true;
  }

  // 3. Calendar Data POST (Atomic sync)
  if (pathname === '/api/calendar' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) {
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const result = saveCalendarData(db, payload);
        sendJsonResponse(res, 200, result);
      } catch (err) {
        console.error('SQLite Write Error:', err);
        sendJsonResponse(res, 500, { error: 'Failed to write to SQLite database', details: err.message });
      }
    });
    return true;
  }

  return false;
}
