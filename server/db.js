import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  triggerBackupCheck,
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
export { handleApiRequest } from './routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const DEFAULT_DB_PATH = process.env.DATABASE_PATH || path.join(DEFAULT_DATA_DIR, 'chronoledger.sqlite');

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
    circledRows = db.prepare("SELECT * FROM circled_dates WHERE user_id IS NULL OR user_id = '__guest__' ORDER BY created_at ASC").all();
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
        db.exec("DELETE FROM circled_dates WHERE user_id IS NULL OR user_id = '__guest__';");
      }

      const insertCircled = db.prepare(`
        INSERT OR REPLACE INTO circled_dates (date_key, user_id, color, created_at, revision)
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
        insertCircled.run(c.dateKey, userId || '__guest__', c.color || '#D23B38', c.createdAt || now, revision);
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
      WHERE notes.user_id = excluded.user_id OR notes.user_id IS NULL OR notes.user_id = '__guest__'
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
          WHERE drawings.user_id = excluded.user_id OR drawings.user_id IS NULL OR drawings.user_id = '__guest__'
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
          : db.prepare("DELETE FROM circled_dates WHERE date_key = ? AND (user_id IS NULL OR user_id = '__guest__')");
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
          ON CONFLICT(date_key, user_id) DO UPDATE SET
            color = excluded.color,
            revision = excluded.revision
        `);
        for (const [dateKey, val] of Object.entries(delta.circledDates.upsert)) {
          upsertCircle.run(dateKey, userId || '__guest__', val.color, now, revision);
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
    circledUpserts = db.prepare("SELECT * FROM circled_dates WHERE (user_id IS NULL OR user_id = '__guest__') AND revision > ? ORDER BY created_at ASC").all(since);
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
