import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { 
  migrateDatabase, 
  saveCalendarData,
  saveCalendarDelta,
  getCalendarData,
  getCalendarDelta,
  findNoteById,
  calculateBounds,
  getIsoWeek,
  getIsoWeekBounds
} from '../server/db.js';

function createLegacyTestDb() {
  const db = new DatabaseSync(':memory:');
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
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

test('calculateBounds and getIsoWeekBounds produce accurate UTC intervals', () => {
  // Day note
  const dayBounds = calculateBounds('day', ['2026-10-23']);
  assert.equal(dayBounds.startAt, '2026-10-23T00:00:00.000Z');
  assert.equal(dayBounds.endAt, '2026-10-23T23:59:59.999Z');

  // Month note
  const monthBounds = calculateBounds('month', ['2026-10']);
  assert.equal(monthBounds.startAt, '2026-10-01T00:00:00.000Z');
  assert.equal(monthBounds.endAt, '2026-10-31T23:59:59.999Z');

  // Year note
  const yearBounds = calculateBounds('year', ['2026']);
  assert.equal(yearBounds.startAt, '2026-01-01T00:00:00.000Z');
  assert.equal(yearBounds.endAt, '2026-12-31T23:59:59.999Z');

  // Week note (2026-W43 starts on Mon Oct 19, ends on Sun Oct 25)
  const weekBounds = calculateBounds('week', ['2026-W43']);
  assert.ok(weekBounds.startAt.startsWith('2026-10-19'));
  assert.ok(weekBounds.endAt.startsWith('2026-10-25'));
});

test('Schema v8 Migration: lossless data consolidation into single notes table', () => {
  const db = createLegacyTestDb();

  // Populate legacy tables before running migration
  db.prepare(`
    INSERT INTO notes (id, content, original_content, parent_dates, is_struck, created_at)
    VALUES ('day-1', 'Daily standup', 'Daily standup draft', '["2026-10-23"]', 0, '2026-10-23T09:00:00Z')
  `).run();

  db.prepare(`
    INSERT INTO week_notes (id, content, parent_weeks, is_struck, created_at)
    VALUES ('week-1', 'Weekly focus goal', '["2026-W43"]', 1, '2026-10-20T10:00:00Z')
  `).run();

  db.prepare(`
    INSERT INTO month_notes (id, content, parent_months, is_struck, color_tag, created_at)
    VALUES ('month-1', 'October retrospective', '["2026-10"]', 0, 'blue', '2026-10-01T08:00:00Z')
  `).run();

  // Run migration
  migrateDatabase(db);

  const meta = db.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get();
  assert.ok(Number(meta.value) >= 8);

  // Query unified table
  const allNotes = db.prepare('SELECT * FROM notes ORDER BY id ASC').all();
  assert.equal(allNotes.length, 3);

  const dayNote = allNotes.find(n => n.id === 'day-1');
  assert.ok(dayNote);
  assert.equal(dayNote.scope, 'day');
  assert.equal(dayNote.content, 'Daily standup');
  assert.equal(dayNote.original_content, 'Daily standup draft');
  assert.deepEqual(JSON.parse(dayNote.targets), ['2026-10-23']);
  assert.equal(dayNote.start_at, '2026-10-23T00:00:00.000Z');

  const weekNote = allNotes.find(n => n.id === 'week-1');
  assert.ok(weekNote);
  assert.equal(weekNote.scope, 'week');
  assert.equal(weekNote.is_struck, 1);
  assert.deepEqual(JSON.parse(weekNote.targets), ['2026-W43']);

  const monthNote = allNotes.find(n => n.id === 'month-1');
  assert.ok(monthNote);
  assert.equal(monthNote.scope, 'month');
  assert.equal(monthNote.color_tag, 'blue');
  assert.deepEqual(JSON.parse(monthNote.targets), ['2026-10']);

  // Check backward compatible views
  const weekViewRows = db.prepare('SELECT * FROM week_notes').all();
  assert.equal(weekViewRows.length, 1);
  assert.equal(weekViewRows[0].id, 'week-1');
  assert.deepEqual(JSON.parse(weekViewRows[0].parent_weeks), ['2026-W43']);

  const monthViewRows = db.prepare('SELECT * FROM month_notes').all();
  assert.equal(monthViewRows.length, 1);
  assert.equal(monthViewRows[0].id, 'month-1');
  assert.deepEqual(JSON.parse(monthViewRows[0].parent_months), ['2026-10']);
});

test('Cross-Horizon Note Move: in-place update without tombstones', () => {
  const db = createLegacyTestDb();
  migrateDatabase(db);

  // 1. Insert a day note
  saveCalendarDelta(db, {
    notes: {
      upsert: [
        {
          id: 'task-100',
          content: 'Ship feature v1',
          originalContent: 'Ship feature v0.9',
          scope: 'day',
          targets: ['2026-10-23'],
          isStruck: false,
          createdAt: new Date().toISOString()
        }
      ]
    }
  }, null);

  const initial = findNoteById(db, 'task-100', null);
  assert.ok(initial);
  assert.equal(initial.scope, 'day');

  // 2. Drag & drop note from Day to Week scratchpad (in-place horizon move)
  saveCalendarDelta(db, {
    notes: {
      upsert: [
        {
          id: 'task-100',
          content: 'Ship feature v1',
          originalContent: 'Ship feature v0.9',
          scope: 'week',
          targets: ['2026-W43'],
          isStruck: false,
        }
      ]
    }
  }, null);

  const moved = findNoteById(db, 'task-100', null);
  assert.ok(moved);
  assert.equal(moved.row.scope, 'week');
  assert.deepEqual(JSON.parse(moved.row.targets), ['2026-W43']);
  assert.equal(moved.row.original_content, 'Ship feature v0.9', 'Original content diff must be preserved across moves');

  // Verify NO tombstone was recorded
  const tombstones = db.prepare("SELECT * FROM deleted_records WHERE id = 'task-100'").all();
  assert.equal(tombstones.length, 0, 'No tombstone should be created during cross-horizon move');

  // 3. Query getCalendarData: task-100 appears in weekNotes, NOT in notes
  const data = getCalendarData(db, null);
  assert.equal(data.notes.some(n => n.id === 'task-100'), false);
  assert.equal(data.weekNotes.some(wn => wn.id === 'task-100'), true);
  assert.equal(data.allNotes.some(an => an.id === 'task-100'), true);
});

test('Multi-Horizon Monotonic Revisions: full day -> week -> month -> day migration cycle', () => {
  const db = createLegacyTestDb();
  migrateDatabase(db);

  // 1. Initial Day note creation
  const r1 = saveCalendarDelta(db, {
    notes: {
      upsert: [
        {
          id: 'note-cycle-1',
          content: 'Evolve architecture',
          scope: 'day',
          targets: ['2026-10-23'],
          createdAt: new Date().toISOString()
        }
      ]
    }
  }, null);

  const n1 = findNoteById(db, 'note-cycle-1', null);
  assert.equal(n1.scope, 'day');
  assert.equal(n1.row.start_at, '2026-10-23T00:00:00.000Z');
  const rev1 = n1.row.revision;
  assert.ok(rev1 > 0);

  // 2. Day -> Week Move
  const r2 = saveCalendarDelta(db, {
    notes: {
      upsert: [
        {
          id: 'note-cycle-1',
          content: 'Evolve architecture',
          scope: 'week',
          targets: ['2026-W43']
        }
      ]
    }
  }, null);

  const n2 = findNoteById(db, 'note-cycle-1', null);
  assert.equal(n2.scope, 'week');
  assert.ok(n2.row.start_at.startsWith('2026-10-19'));
  assert.ok(n2.row.revision > rev1, 'Revision must strictly increment on week move');
  const rev2 = n2.row.revision;

  // 3. Week -> Month Move
  const r3 = saveCalendarDelta(db, {
    notes: {
      upsert: [
        {
          id: 'note-cycle-1',
          content: 'Evolve architecture',
          scope: 'month',
          targets: ['2026-10']
        }
      ]
    }
  }, null);

  const n3 = findNoteById(db, 'note-cycle-1', null);
  assert.equal(n3.scope, 'month');
  assert.equal(n3.row.start_at, '2026-10-01T00:00:00.000Z');
  assert.ok(n3.row.revision > rev2, 'Revision must strictly increment on month move');
  const rev3 = n3.row.revision;

  // 4. Month -> Day Move (back to day)
  const r4 = saveCalendarDelta(db, {
    notes: {
      upsert: [
        {
          id: 'note-cycle-1',
          content: 'Evolve architecture',
          scope: 'day',
          targets: ['2026-10-24']
        }
      ]
    }
  }, null);

  const n4 = findNoteById(db, 'note-cycle-1', null);
  assert.equal(n4.scope, 'day');
  assert.equal(n4.row.start_at, '2026-10-24T00:00:00.000Z');
  assert.ok(n4.row.revision > rev3, 'Revision must strictly increment on day move');

  // Verify delta queries only return the note as an upsert, NEVER in deletedIds
  const deltaSinceRev1 = getCalendarDelta(db, rev1, null);
  assert.equal(deltaSinceRev1.allNotes.delete.includes('note-cycle-1'), false);
  const deltaUpsert = deltaSinceRev1.allNotes.upsert.find(n => n.id === 'note-cycle-1');
  assert.ok(deltaUpsert);
  assert.equal(deltaUpsert.scope, 'day');
  assert.deepEqual(deltaUpsert.targets, ['2026-10-24']);

  // Ensure 0 tombstones exist in the database for this note
  const tombstones = db.prepare("SELECT * FROM deleted_records WHERE id = 'note-cycle-1'").all();
  assert.equal(tombstones.length, 0);
});
