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
import {
  triggerBackupCheck,
  performBackup,
  getBackupStatus,
  cleanOrphanedTempFiles,
} from './backup.js';
import {
  runMigrations,
  rollbackMigration,
  getMigrationStatus,
} from './migrations/runner.js';
import {
  calculateBounds,
  getIsoWeek,
  getIsoWeekBounds,
} from './bounds.js';

export {
  calculateBounds,
  getIsoWeek,
  getIsoWeekBounds,
  runMigrations,
  rollbackMigration,
  getMigrationStatus,
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DEFAULT_DB_PATH = process.env.DATABASE_PATH || path.join(DEFAULT_DATA_DIR, 'chronoledger.sqlite');

let cachedDb = null;

/**
 * Initializes and returns the SQLite database connection.
 * Sets up WAL mode and executes migrations through the file-per-version runner.
 */
export function getDatabase(dbPath = DEFAULT_DB_PATH) {
  if (cachedDb) return cachedDb;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  cleanOrphanedTempFiles(path.join(dir, 'backups'));

  const db = new DatabaseSync(dbPath);

  // Performance and durability configuration
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  runMigrations(db);
  purgeExpiredTombstones(db, 30);

  cachedDb = db;
  return db;
}

/**
 * Automatically applies schema migrations using the file-per-version runner.
 * Maintained for backward compatibility with existing tests and scripts.
 */
export function migrateDatabase(db) {
  return runMigrations(db);
}

/**
 * Automatically purges tombstones older than the retention threshold (default: 30 days).
 * Records the highest purged revision watermark into metadata so clients that were offline
 * longer than the retention window can be safely informed to perform a full baseline sync.
 */
export function purgeExpiredTombstones(db = getDatabase(), days = 30) {
  try {
    const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const toPurge = db.prepare(`
      SELECT COALESCE(user_id, '__guest__') as user_key, MAX(revision) as max_rev
      FROM deleted_records
      WHERE deleted_at < ?
      GROUP BY user_key
    `).all(threshold);

    for (const row of toPurge) {
      const metaKey = `last_purged_rev_${row.user_key}`;
      const existing = db.prepare('SELECT value FROM metadata WHERE key = ?').get(metaKey);
      const newMax = Math.max(Number(existing?.value) || 0, Number(row.max_rev) || 0);
      db.prepare(`
        INSERT INTO metadata (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(metaKey, String(newMax));
    }

    const result = db.prepare('DELETE FROM deleted_records WHERE deleted_at < ?').run(threshold);
    if (result.changes > 0) {
      console.log(`[Tombstone TTL] Purged ${result.changes} expired tombstones older than ${days} days.`);
    }
    return result.changes;
  } catch (err) {
    console.debug('Failed to purge expired tombstones:', err);
    return 0;
  }
}

/**
 * Retrieves the current monotonic revision sequence number for a user (or guest).
 */
export function getCurrentLedgerRevision(db = getDatabase(), userId = null) {
  const userKey = userId || '__guest__';
  const row = db.prepare('SELECT current_revision FROM ledger_sequences WHERE user_id = ?').get(userKey);
  return Number(row?.current_revision) || 1;
}

/**
 * Atomically increments and returns the next monotonic revision sequence number for a user (or guest).
 */
export function getNextLedgerRevision(db = getDatabase(), userId = null) {
  const userKey = userId || '__guest__';
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO ledger_sequences (user_id, current_revision, updated_at)
    VALUES (?, 2, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      current_revision = ledger_sequences.current_revision + 1,
      updated_at = excluded.updated_at
  `).run(userKey, now);

  const row = db.prepare('SELECT current_revision FROM ledger_sequences WHERE user_id = ?').get(userKey);
  return Number(row?.current_revision) || 2;
}

/**
 * Normalizes any note row into a UnifiedNote object with range bounds and compatibility fields.
 */
export function formatUnifiedNote(row) {
  let targets = [];
  try {
    targets = JSON.parse(row.targets || row.parent_dates || row.parent_weeks || row.parent_months || '[]');
  } catch {
    targets = [];
  }
  const scope = row.scope || 'day';

  return {
    id: row.id,
    scope,
    content: row.content,
    originalContent: row.original_content || undefined,
    targets,
    startAt: row.start_at || undefined,
    endAt: row.end_at || undefined,
    parentDates: scope === 'day' || scope === 'time' ? targets : undefined,
    parentWeeks: scope === 'week' ? targets : undefined,
    parentMonths: scope === 'month' ? targets : undefined,
    isStruck: Boolean(row.is_struck),
    strikeStyle: row.strike_style || undefined,
    colorTag: row.color_tag || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
    revision: row.revision || 1,
  };
}

/**
 * Reads calendar data from SQLite, optionally filtered by user_id.
 * If userId is null, returns legacy unassigned data.
 */
export function getCalendarData(db = getDatabase(), userId = null) {
  let noteRows, drawingRows, circledRows, settingsRow, deletedRows;
  const currentRevision = getCurrentLedgerRevision(db, userId);

  if (userId) {
    noteRows = db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY rowid ASC').all(userId);
    drawingRows = db.prepare("SELECT * FROM drawings WHERE user_id = ? AND type != 'circle' ORDER BY created_at ASC").all(userId);
    circledRows = db.prepare('SELECT * FROM circled_dates WHERE user_id = ? ORDER BY created_at ASC').all(userId);
    settingsRow = db.prepare('SELECT * FROM settings WHERE user_id = ? OR id = ?').get(userId, userId);
    deletedRows = db.prepare('SELECT id, entity_type, deleted_at, revision FROM deleted_records WHERE user_id = ? ORDER BY revision ASC').all(userId);
  } else {
    noteRows = db.prepare('SELECT * FROM notes WHERE user_id IS NULL ORDER BY rowid ASC').all();
    drawingRows = db.prepare("SELECT * FROM drawings WHERE user_id IS NULL AND type != 'circle' ORDER BY created_at ASC").all();
    circledRows = db.prepare('SELECT * FROM circled_dates WHERE user_id IS NULL ORDER BY created_at ASC').all();
    settingsRow = db.prepare("SELECT * FROM settings WHERE user_id IS NULL OR id = 'default'").get();
    deletedRows = db.prepare('SELECT id, entity_type, deleted_at, revision FROM deleted_records WHERE user_id IS NULL ORDER BY revision ASC').all();
  }

  const metaRows = db.prepare('SELECT * FROM metadata').all();

  const allNotes = noteRows.map(formatUnifiedNote);
  const notes = allNotes.filter((n) => n.scope === 'day' || n.scope === 'time');
  const weekNotes = allNotes.filter((n) => n.scope === 'week');
  const monthNotes = allNotes.filter((n) => n.scope === 'month');

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
    allNotes.length > 0 ||
    drawings.length > 0 ||
    Object.keys(circledDates).length > 0;

  return {
    notes,
    weekNotes,
    monthNotes,
    allNotes,
    drawings,
    circledDates,
    settings,
    currentRevision,
    deletedRecords: deletedRows.map((r) => ({
      id: r.id,
      entityType: r.entity_type,
      deletedAt: r.deleted_at,
      revision: r.revision,
    })),
    syncedAt: metaMap['last_synced_at'] || new Date().toISOString(),
    schemaVersion: Number(metaMap['schema_version']) || 8,
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
    const revision = getNextLedgerRevision(db, userId);
    const now = new Date().toISOString();

    // 1. Unified Notes (allNotes, notes, weekNotes, monthNotes)
    const incomingNotes = [];
    if (Array.isArray(data.allNotes)) {
      for (const n of data.allNotes) {
        incomingNotes.push({
          id: n.id,
          content: n.content || '',
          originalContent: n.originalContent || null,
          scope: n.scope || 'day',
          targets: Array.isArray(n.targets) ? n.targets : (n.parentDates || n.parentWeeks || n.parentMonths || []),
          isStruck: n.isStruck ? 1 : 0,
          strikeStyle: n.strikeStyle || null,
          colorTag: n.colorTag || null,
          createdAt: n.createdAt || now,
          updatedAt: n.updatedAt || null,
        });
      }
    } else {
      if (Array.isArray(data.notes)) {
        for (const n of data.notes) {
          incomingNotes.push({
            id: n.id,
            content: n.content || '',
            originalContent: n.originalContent || null,
            scope: n.scope || 'day',
            targets: Array.isArray(n.targets) ? n.targets : (n.parentDates || []),
            isStruck: n.isStruck ? 1 : 0,
            strikeStyle: n.strikeStyle || null,
            colorTag: n.colorTag || null,
            createdAt: n.createdAt || now,
            updatedAt: n.updatedAt || null,
          });
        }
      }
      if (Array.isArray(data.weekNotes)) {
        for (const wn of data.weekNotes) {
          incomingNotes.push({
            id: wn.id,
            content: wn.content || '',
            originalContent: wn.originalContent || null,
            scope: wn.scope || 'week',
            targets: Array.isArray(wn.targets) ? wn.targets : (wn.parentWeeks || []),
            isStruck: wn.isStruck ? 1 : 0,
            strikeStyle: wn.strikeStyle || null,
            colorTag: wn.colorTag || null,
            createdAt: wn.createdAt || now,
            updatedAt: wn.updatedAt || null,
          });
        }
      }
      if (Array.isArray(data.monthNotes)) {
        for (const mn of data.monthNotes) {
          incomingNotes.push({
            id: mn.id,
            content: mn.content || '',
            originalContent: mn.originalContent || null,
            scope: mn.scope || 'month',
            targets: Array.isArray(mn.targets) ? mn.targets : (mn.parentMonths || []),
            isStruck: mn.isStruck ? 1 : 0,
            strikeStyle: mn.strikeStyle || null,
            colorTag: mn.colorTag || null,
            createdAt: mn.createdAt || now,
            updatedAt: mn.updatedAt || null,
          });
        }
      }
    }

    if (data.allNotes !== undefined || data.notes !== undefined || data.weekNotes !== undefined || data.monthNotes !== undefined) {
      if (userId) {
        db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId);
      } else {
        db.exec('DELETE FROM notes WHERE user_id IS NULL;');
      }

      const insertNote = db.prepare(`
        INSERT INTO notes (id, user_id, content, original_content, scope, targets, start_at, end_at, is_struck, strike_style, color_tag, created_at, updated_at, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const n of incomingNotes) {
        const bounds = calculateBounds(n.scope, n.targets);
        insertNote.run(
          n.id,
          userId || null,
          n.content,
          n.originalContent,
          n.scope,
          JSON.stringify(n.targets),
          bounds.startAt,
          bounds.endAt,
          n.isStruck,
          n.strikeStyle,
          n.colorTag,
          n.createdAt,
          n.updatedAt,
          revision
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
        INSERT INTO drawings (id, user_id, type, color, stroke_width, anchor_start_date, anchor_end_date, start_offset, end_offset, points, created_at, start_anchor, end_anchor, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          d.createdAt || now,
          d.startAnchor ? JSON.stringify(d.startAnchor) : null,
          d.endAnchor ? JSON.stringify(d.endAnchor) : null,
          revision
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
        INSERT INTO circled_dates (date_key, user_id, color, created_at, revision)
        VALUES (?, ?, ?, ?, ?)
      `);
      const entries = Array.isArray(data.circledDates)
        ? data.circledDates
        : Object.entries(data.circledDates).map(([k, v]) => ({
            dateKey: k,
            color: typeof v === 'string' ? v : (v.color || '#D23B38'),
            createdAt: (v && v.createdAt) || now,
          }));
      for (const c of entries) {
        insertCircled.run(c.dateKey, userId || null, c.color || '#D23B38', c.createdAt || now, revision);
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
        now
      );
    }

    const setMeta = db.prepare(`
      INSERT INTO metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    setMeta.run('last_synced_at', now);
    setMeta.run('schema_version', '7');

    db.exec('COMMIT;');
    triggerBackupCheck(db, DEFAULT_DATA_DIR);
    return { ok: true, revision, syncedAt: now };
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
    const revision = getNextLedgerRevision(db, userId);

    const insertTombstone = db.prepare(`
      INSERT OR REPLACE INTO deleted_records (id, user_id, entity_type, deleted_at, revision)
      VALUES (?, ?, ?, ?, ?)
    `);

    const removeTombstone = userId
      ? db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id = ?')
      : db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id IS NULL');

    const executeRemoveTombstone = (id) => {
      if (userId) {
        removeTombstone.run(id, userId);
      } else {
        removeTombstone.run(id);
      }
    };

    // 1. Unified Notes (allNotes, notes, weekNotes, monthNotes)
    const deleteNoteStmt = userId
      ? db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
      : db.prepare('DELETE FROM notes WHERE id = ? AND user_id IS NULL');

    const handleNoteDeletes = (ids, entityType) => {
      if (!Array.isArray(ids)) return;
      for (const id of ids) {
        if (userId) deleteNoteStmt.run(id, userId);
        else deleteNoteStmt.run(id);
        insertTombstone.run(id, userId || null, entityType, now, revision);
      }
    };

    if (delta.allNotes?.delete) handleNoteDeletes(delta.allNotes.delete, 'note');
    if (delta.notes?.delete) handleNoteDeletes(delta.notes.delete, 'note');
    if (delta.weekNotes?.delete) handleNoteDeletes(delta.weekNotes.delete, 'week_note');
    if (delta.monthNotes?.delete) handleNoteDeletes(delta.monthNotes.delete, 'month_note');

    const upsertUnifiedNote = db.prepare(`
      INSERT INTO notes (id, user_id, content, original_content, scope, targets, start_at, end_at, is_struck, strike_style, color_tag, created_at, updated_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        original_content = excluded.original_content,
        scope = excluded.scope,
        targets = excluded.targets,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        is_struck = excluded.is_struck,
        strike_style = excluded.strike_style,
        color_tag = excluded.color_tag,
        updated_at = excluded.updated_at,
        revision = excluded.revision
    `);

    const handleNoteUpserts = (noteItems, defaultScope) => {
      if (!Array.isArray(noteItems)) return;
      for (const n of noteItems) {
        const scope = n.scope || defaultScope;
        let targets = Array.isArray(n.targets)
          ? n.targets
          : (n.parentDates || n.parentWeeks || n.parentMonths || []);
        if (targets.length === 0) {
          if (scope === 'day' || scope === 'time') targets = [n.createdAt ? n.createdAt.slice(0, 10) : now.slice(0, 10)];
          else if (scope === 'week') targets = [getIsoWeek(new Date(n.createdAt || Date.now()))];
          else if (scope === 'month') targets = [(n.createdAt || now).slice(0, 7)];
          else if (scope === 'year') targets = [String(new Date(n.createdAt || Date.now()).getFullYear())];
        }
        const bounds = calculateBounds(scope, targets);
        upsertUnifiedNote.run(
          n.id,
          userId || null,
          n.content || '',
          n.originalContent || null,
          scope,
          JSON.stringify(targets),
          bounds.startAt,
          bounds.endAt,
          n.isStruck ? 1 : 0,
          n.strikeStyle || null,
          n.colorTag || null,
          n.createdAt || now,
          n.updatedAt || now,
          revision
        );
        executeRemoveTombstone(n.id);
      }
    };

    if (delta.allNotes?.upsert) handleNoteUpserts(delta.allNotes.upsert, 'day');
    if (delta.notes?.upsert) handleNoteUpserts(delta.notes.upsert, 'day');
    if (delta.weekNotes?.upsert) handleNoteUpserts(delta.weekNotes.upsert, 'week');
    if (delta.monthNotes?.upsert) handleNoteUpserts(delta.monthNotes.upsert, 'month');

    // 4. Drawings
    if (delta.drawings) {
      if (Array.isArray(delta.drawings.delete) && delta.drawings.delete.length > 0) {
        const deleteStmt = userId
          ? db.prepare('DELETE FROM drawings WHERE id = ? AND user_id = ?')
          : db.prepare('DELETE FROM drawings WHERE id = ? AND user_id IS NULL');
        for (const id of delta.drawings.delete) {
          if (userId) deleteStmt.run(id, userId);
          else deleteStmt.run(id);
          insertTombstone.run(id, userId || null, 'drawing', now, revision);
        }
      }

      if (Array.isArray(delta.drawings.upsert)) {
        const upsertDrawing = db.prepare(`
          INSERT INTO drawings (id, user_id, type, color, stroke_width, anchor_start_date, anchor_end_date, start_anchor, end_anchor, start_offset, end_offset, points, created_at, revision)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            points = excluded.points,
            revision = excluded.revision
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
            d.createdAt || now,
            revision
          );
          executeRemoveTombstone(d.id);
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
          insertTombstone.run(dateKey, userId || null, 'circle', now, revision);
        }
      }

      if (delta.circledDates.upsert && typeof delta.circledDates.upsert === 'object') {
        const upsertCircle = db.prepare(`
          INSERT INTO circled_dates (date_key, user_id, color, created_at, revision)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(date_key) DO UPDATE SET
            color = excluded.color,
            revision = excluded.revision
        `);
        for (const [dateKey, val] of Object.entries(delta.circledDates.upsert)) {
          upsertCircle.run(dateKey, userId || null, val.color, now, revision);
          executeRemoveTombstone(dateKey);
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
    triggerBackupCheck(db, DEFAULT_DATA_DIR);
    return { ok: true, revision, syncedAt: now };
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error('Failed to save calendar delta:', err);
    throw err;
  }
}

/**
 * Retrieves incremental delta changes and tombstones modified since the specified revision.
 */
export function getCalendarDelta(db = getDatabase(), sinceRevision = 0, userId = null) {
  const currentRevision = getCurrentLedgerRevision(db, userId);
  const since = Number(sinceRevision) || 0;

  const userKey = userId || '__guest__';

  // Verify whether sinceRevision has fallen outside the active retention window (30-day tombstone TTL)
  if (since > 0) {
    const metaKey = `last_purged_rev_${userKey}`;
    const purgedRow = db.prepare('SELECT value FROM metadata WHERE key = ?').get(metaKey);
    const lastPurgedRev = Number(purgedRow?.value) || 0;
    if (lastPurgedRev > 0 && since <= lastPurgedRev) {
      return { ok: true, requiresFullSync: true, currentRevision };
    }
  }

  let noteUpserts, drawingUpserts, circledUpserts, deletedRows;

  if (userId) {
    noteUpserts = db.prepare('SELECT * FROM notes WHERE user_id = ? AND revision > ? ORDER BY rowid ASC').all(userId, since);
    drawingUpserts = db.prepare("SELECT * FROM drawings WHERE user_id = ? AND type != 'circle' AND revision > ? ORDER BY created_at ASC").all(userId, since);
    circledUpserts = db.prepare('SELECT * FROM circled_dates WHERE user_id = ? AND revision > ? ORDER BY created_at ASC').all(userId, since);
    deletedRows = db.prepare('SELECT id, entity_type, deleted_at, revision FROM deleted_records WHERE user_id = ? AND revision > ? ORDER BY revision ASC').all(userId, since);
  } else {
    noteUpserts = db.prepare('SELECT * FROM notes WHERE user_id IS NULL AND revision > ? ORDER BY rowid ASC').all(since);
    drawingUpserts = db.prepare("SELECT * FROM drawings WHERE user_id IS NULL AND type != 'circle' AND revision > ? ORDER BY created_at ASC").all(since);
    circledUpserts = db.prepare('SELECT * FROM circled_dates WHERE user_id IS NULL AND revision > ? ORDER BY created_at ASC').all(since);
    deletedRows = db.prepare('SELECT id, entity_type, deleted_at, revision FROM deleted_records WHERE user_id IS NULL AND revision > ? ORDER BY revision ASC').all(since);
  }

  const allFormatted = noteUpserts.map(formatUnifiedNote);
  const dayUpserts = allFormatted.filter((n) => n.scope === 'day' || n.scope === 'time');
  const weekUpserts = allFormatted.filter((n) => n.scope === 'week');
  const monthUpserts = allFormatted.filter((n) => n.scope === 'month');

  const formatDrawing = (d) => ({
    id: d.id,
    type: d.type,
    color: d.color,
    strokeWidth: d.stroke_width,
    anchorStartDate: d.anchor_start_date,
    anchorEndDate: d.anchor_end_date || undefined,
    startAnchor: d.start_anchor ? JSON.parse(d.start_anchor) : undefined,
    endAnchor: d.end_anchor ? JSON.parse(d.end_anchor) : undefined,
    startOffset: JSON.parse(d.start_offset || '{"x":0,"y":0}'),
    endOffset: d.end_offset ? JSON.parse(d.end_offset) : undefined,
    points: JSON.parse(d.points || '[]'),
    createdAt: d.created_at,
  });

  const circledMap = {};
  for (const c of circledUpserts) {
    circledMap[c.date_key] = { color: c.color };
  }

  const noteDeletes = [];
  const weekNoteDeletes = [];
  const monthNoteDeletes = [];
  const drawingDeletes = [];
  const circleDeletes = [];
  const allNoteDeletes = [];

  for (const del of deletedRows) {
    switch (del.entity_type) {
      case 'note':
        noteDeletes.push(del.id);
        allNoteDeletes.push(del.id);
        break;
      case 'week_note':
        weekNoteDeletes.push(del.id);
        allNoteDeletes.push(del.id);
        break;
      case 'month_note':
        monthNoteDeletes.push(del.id);
        allNoteDeletes.push(del.id);
        break;
      case 'drawing':
        drawingDeletes.push(del.id);
        break;
      case 'circle':
        circleDeletes.push(del.id);
        break;
    }
  }

  return {
    ok: true,
    currentRevision,
    notes: { upsert: dayUpserts, delete: noteDeletes },
    weekNotes: { upsert: weekUpserts, delete: weekNoteDeletes },
    monthNotes: { upsert: monthUpserts, delete: monthNoteDeletes },
    allNotes: { upsert: allFormatted, delete: allNoteDeletes },
    drawings: { upsert: drawingUpserts.map(formatDrawing), delete: drawingDeletes },
    circledDates: { upsert: circledMap, delete: circleDeletes },
    syncedAt: new Date().toISOString(),
  };
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
  const row = userId
    ? db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(noteId, userId)
    : db.prepare('SELECT * FROM notes WHERE id = ? AND user_id IS NULL').get(noteId);
  if (!row) return null;
  return {
    row,
    table: 'notes',
    targetCol: 'targets',
    scope: row.scope || 'day',
  };
}

export function getDataDirFromDb(db) {
  try {
    const mainDb = db?.prepare('PRAGMA database_list').all()?.find((d) => d.name === 'main');
    if (mainDb && mainDb.file) {
      return path.dirname(mainDb.file);
    }
  } catch {}
  return DEFAULT_DATA_DIR;
}

/**
 * Handles incoming HTTP requests for `/api/*`.
 * Dispatches auth, session, calendar, and granular note requests with full multi-user support.
 */
export function handleApiRequest(req, res, db = getDatabase()) {
  const origin = req.headers['origin'] || '*';
  const dataDir = getDataDirFromDb(db);

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
      backup: getBackupStatus(dataDir),
      uptime: process.uptime(),
    });
    return true;
  }

  // 2b. Backup status & on-demand execution: /api/backups
  if (pathname === '/api/backups') {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }

    if (req.method === 'GET') {
      const status = getBackupStatus(dataDir);
      sendJsonResponse(req, res, 200, status);
      return true;
    }

    if (req.method === 'POST') {
      performBackup(db, dataDir, { force: true })
        .then((result) => {
          sendJsonResponse(req, res, 200, { ok: true, ...result });
        })
        .catch((err) => {
          sendJsonResponse(req, res, 500, { ok: false, error: err.message });
        });
      return true;
    }

    sendJsonResponse(req, res, 405, { error: 'Method Not Allowed' });
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

  // 8b-1. Incremental Calendar Delta GET (Pull changes since revision)
  if (pathname === '/api/calendar/delta' && req.method === 'GET') {
    const session = authenticateRequest(req, db);
    const totalUsers = getUserCount(db);
    if (!session && totalUsers > 0) {
      sendJsonResponse(req, res, 401, { error: 'Authentication required' });
      return true;
    }
    const userId = session?.userId || null;
    const sinceParam = parsedUrl.searchParams.get('since') || '0';
    try {
      const delta = getCalendarDelta(db, parseInt(sinceParam, 10) || 0, userId);
      sendJsonResponse(req, res, 200, delta);
    } catch (err) {
      console.error('Failed to get calendar delta:', err);
      sendJsonResponse(req, res, 500, { error: 'Failed to read calendar delta', details: err.message });
    }
    return true;
  }

  // 8b-2. Incremental Calendar Delta POST (Batch Delta Sync)
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
      const yearParam = parsedUrl.searchParams.get('year');
      const tagParam = parsedUrl.searchParams.get('tag');
      const statusParam = parsedUrl.searchParams.get('status') || 'all';
      const qParam = parsedUrl.searchParams.get('q');
      const limit = Math.max(1, Math.min(500, parseInt(parsedUrl.searchParams.get('limit') || '50', 10)));
      const offset = Math.max(0, parseInt(parsedUrl.searchParams.get('offset') || '0', 10));

      let query = 'SELECT * FROM notes WHERE 1=1';
      const params = [];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      } else {
        query += ' AND user_id IS NULL';
      }

      if (scopeParam && scopeParam !== 'all') {
        query += ' AND scope = ?';
        params.push(scopeParam);
      }

      query += ' ORDER BY created_at DESC';
      const rows = db.prepare(query).all(...params);
      let results = rows.map(formatUnifiedNote);

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

        if (yearParam) {
          if (note.scope === 'year' && !note.targets.includes(yearParam)) return false;
          if (note.scope !== 'year' && scopeParam !== 'all') return false;
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
          if (!['time', 'day', 'week', 'month', 'year', 'span'].includes(scope)) {
            sendJsonResponse(req, res, 400, { error: 'scope must be time, day, week, month, year, or span' });
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
            if (scope === 'day' || scope === 'time') {
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
            } else if (scope === 'year') {
              targets = [String(now.getFullYear())];
            }
          }

          const prefix = scope === 'week' ? 'week-note' : scope === 'month' ? 'month-note' : 'note';
          const id = body.id || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const createdAt = body.createdAt || now.toISOString();
          const isStruck = body.isStruck ? 1 : 0;
          const strikeStyle = body.strikeStyle || null;
          const colorTag = body.colorTag || null;
          const originalContent = body.originalContent || null;
          const bounds = calculateBounds(scope, targets);
          const revision = getNextLedgerRevision(db, userId);

          db.prepare(`
            INSERT INTO notes (id, user_id, content, original_content, scope, targets, start_at, end_at, is_struck, strike_style, color_tag, created_at, updated_at, revision)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, userId, content, originalContent, scope, JSON.stringify(targets), bounds.startAt, bounds.endAt, isStruck, strikeStyle, colorTag, createdAt, null, revision);

          if (userId) {
            db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id = ?').run(id, userId);
          } else {
            db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id IS NULL').run(id);
          }

          triggerBackupCheck(db, DEFAULT_DATA_DIR);
          sendJsonResponse(req, res, 201, formatUnifiedNote({
            id,
            user_id: userId,
            content,
            original_content: originalContent,
            scope,
            targets: JSON.stringify(targets),
            start_at: bounds.startAt,
            end_at: bounds.endAt,
            is_struck: isStruck,
            strike_style: strikeStyle,
            color_tag: colorTag,
            created_at: createdAt,
            updated_at: null,
            revision,
          }));
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
      const revision = getNextLedgerRevision(db, userId);

      db.prepare(`UPDATE notes SET is_struck = ?, updated_at = ?, revision = ? WHERE id = ?`).run(nextStruck, now, revision, noteId);

      triggerBackupCheck(db, DEFAULT_DATA_DIR);
      sendJsonResponse(req, res, 200, {
        id: noteId,
        scope: found.scope,
        isStruck: Boolean(nextStruck),
        updatedAt: now,
        revision,
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
        sendJsonResponse(req, res, 200, formatUnifiedNote(found.row));
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
            let newScope = current.scope || 'day';
            let newTargets = [];
            try {
              newTargets = JSON.parse(current.targets || current.parent_dates || current.parent_weeks || current.parent_months || '[]');
            } catch {
              newTargets = [];
            }
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

            if (typeof body.scope === 'string') {
              if (['time', 'day', 'week', 'month', 'year', 'span'].includes(body.scope)) {
                newScope = body.scope;
              }
            }

            if (Array.isArray(body.targets)) {
              newTargets = body.targets;
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

            const bounds = calculateBounds(newScope, newTargets);
            const now = new Date().toISOString();
            const revision = getNextLedgerRevision(db, userId);

            db.prepare(`
              UPDATE notes
              SET content = ?, original_content = ?, scope = ?, targets = ?, start_at = ?, end_at = ?, is_struck = ?, strike_style = ?, color_tag = ?, updated_at = ?, revision = ?
              WHERE id = ?
            `).run(
              newContent,
              newOriginalContent,
              newScope,
              JSON.stringify(newTargets),
              bounds.startAt,
              bounds.endAt,
              newIsStruck,
              newStrikeStyle,
              newColorTag,
              now,
              revision,
              noteId
            );

            if (userId) {
              db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id = ?').run(noteId, userId);
            } else {
              db.prepare('DELETE FROM deleted_records WHERE id = ? AND user_id IS NULL').run(noteId);
            }

            const updatedRow = {
              ...current,
              content: newContent,
              original_content: newOriginalContent,
              scope: newScope,
              targets: JSON.stringify(newTargets),
              start_at: bounds.startAt,
              end_at: bounds.endAt,
              is_struck: newIsStruck,
              strike_style: newStrikeStyle,
              color_tag: newColorTag,
              updated_at: now,
              revision,
            };

            triggerBackupCheck(db, DEFAULT_DATA_DIR);
            sendJsonResponse(req, res, 200, formatUnifiedNote(updatedRow));
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

        const now = new Date().toISOString();
        const revision = getNextLedgerRevision(db, userId);

        if (userId) {
          db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(noteId, userId);
        } else {
          db.prepare('DELETE FROM notes WHERE id = ? AND user_id IS NULL').run(noteId);
        }

        db.prepare(`
          INSERT OR REPLACE INTO deleted_records (id, user_id, entity_type, deleted_at, revision)
          VALUES (?, ?, ?, ?, ?)
        `).run(noteId, userId || null, 'note', now, revision);

        triggerBackupCheck(db, DEFAULT_DATA_DIR);
        sendJsonResponse(req, res, 200, { ok: true, deletedId: noteId });
        return true;
      }
    }
  }

  return false;
}
