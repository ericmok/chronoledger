import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { 
  migrateDatabase, 
  getNextLedgerRevision, 
  getCurrentLedgerRevision,
  saveCalendarData,
  saveCalendarDelta,
  getCalendarData,
  getCalendarDelta,
  purgeExpiredTombstones
} from '../server/db.js';
import { registerUser } from '../server/auth.js';

function createTestDb() {
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
  return db;
}

test('Schema v7: ledger sequences and monotonic revisions', () => {
  const db = createTestDb();

  const meta = db.prepare("SELECT value FROM metadata WHERE key = 'schema_version'").get();
  assert.ok(Number(meta.value) >= 8, 'Database schema_version must be >= 8');

  // Baseline revision before any mutations is 1
  assert.equal(getCurrentLedgerRevision(db, null), 1);
  assert.equal(getCurrentLedgerRevision(db, 'user-123'), 1);

  // Verify sequences increment monotonically
  const rev1 = getNextLedgerRevision(db, null);
  const rev2 = getNextLedgerRevision(db, null);
  const rev3 = getNextLedgerRevision(db, null);
  assert.equal(rev1, 2);
  assert.equal(rev2, 3);
  assert.equal(rev3, 4);
  assert.equal(getCurrentLedgerRevision(db, null), 4);

  // Different user has isolated sequence starting from baseline + 1
  const userRev1 = getNextLedgerRevision(db, 'user-123');
  assert.equal(userRev1, 2);
  assert.equal(getCurrentLedgerRevision(db, 'user-123'), 2);
  assert.equal(getCurrentLedgerRevision(db, null), 4);
});

test('Incremental Log Sync (ILS): Delta save, query, and tombstones', () => {
  const db = createTestDb();

  // 1. Initial upsert of note-1 and circled date
  const delta1 = {
    notes: {
      upsert: [
        {
          id: 'note-1',
          content: 'Buy groceries',
          parentDates: ['2026-05-10'],
          isStruck: false,
          createdAt: new Date().toISOString()
        }
      ]
    },
    circledDates: {
      upsert: {
        '2026-05-10': { color: '#E05A47' }
      }
    }
  };

  const res1 = saveCalendarDelta(db, delta1, null);
  assert.equal(res1.ok, true);
  assert.equal(res1.revision, 2);

  // 2. Query delta since revision 0
  const pull0 = getCalendarDelta(db, 0, null);
  assert.equal(pull0.ok, true);
  assert.equal(pull0.currentRevision, 2);
  assert.equal(pull0.notes.upsert.length, 1);
  assert.equal(pull0.notes.upsert[0].id, 'note-1');
  assert.equal(pull0.circledDates.upsert['2026-05-10'].color, '#E05A47');
  assert.equal(pull0.notes.delete.length, 0);

  // 3. Delete note-1 and add note-2
  const delta2 = {
    notes: {
      upsert: [
        {
          id: 'note-2',
          content: 'Doctor appointment',
          parentDates: ['2026-05-11'],
          isStruck: false,
          createdAt: new Date().toISOString()
        }
      ],
      delete: ['note-1']
    },
    circledDates: {
      delete: ['2026-05-10']
    }
  };

  const res2 = saveCalendarDelta(db, delta2, null);
  assert.equal(res2.ok, true);
  assert.equal(res2.revision, 3);

  // 4. Query delta since revision 2
  const pull2 = getCalendarDelta(db, 2, null);
  assert.equal(pull2.ok, true);
  assert.equal(pull2.currentRevision, 3);
  // Upsert has note-2, delete has note-1
  assert.equal(pull2.notes.upsert.length, 1);
  assert.equal(pull2.notes.upsert[0].id, 'note-2');
  assert.deepEqual(pull2.notes.delete, ['note-1']);
  assert.deepEqual(pull2.circledDates.delete, ['2026-05-10']);

  // Check tombstone existence in deleted_records
  const tombstones = db.prepare('SELECT id, entity_type, revision FROM deleted_records').all();
  assert.equal(tombstones.length, 2);
  const noteTombstone = tombstones.find(t => t.id === 'note-1');
  assert.ok(noteTombstone);
  assert.equal(noteTombstone.entity_type, 'note');
  assert.equal(noteTombstone.revision, 3);
  const circleTombstone = tombstones.find(t => t.id === '2026-05-10');
  assert.ok(circleTombstone);
  assert.equal(circleTombstone.entity_type, 'circle');
  assert.equal(circleTombstone.revision, 3);

  // 5. Test resurrection prevention: if note-1 is resurrected/re-inserted, tombstone is cleared
  const delta3 = {
    notes: {
      upsert: [
        {
          id: 'note-1',
          content: 'Buy groceries - restored',
          parentDates: ['2026-05-10'],
          isStruck: false,
          createdAt: new Date().toISOString()
        }
      ]
    }
  };
  const res3 = saveCalendarDelta(db, delta3, null);
  assert.equal(res3.revision, 4);
  const tombstonesAfterRestore = db.prepare("SELECT * FROM deleted_records WHERE id = 'note-1'").all();
  assert.equal(tombstonesAfterRestore.length, 0, 'Tombstone must be removed when entity is resurrected');
});

test('Tombstone TTL Purge and fallback to full sync', () => {
  const db = createTestDb();

  // Insert a note and delete it with a revision
  saveCalendarDelta(db, {
    notes: {
      upsert: [{ id: 'old-note', content: 'ancient note', parentDates: ['2026-01-01'], createdAt: new Date().toISOString() }]
    }
  }, null);

  saveCalendarDelta(db, {
    notes: { delete: ['old-note'] }
  }, null);

  // Manually date the tombstone back 40 days
  const fortyDaysAgo = new Date(Date.now() - 40 * 86400000).toISOString();
  db.prepare("UPDATE deleted_records SET deleted_at = ? WHERE id = 'old-note'").run(fortyDaysAgo);

  // Add another note and delete it today (fresh tombstone)
  saveCalendarDelta(db, {
    notes: {
      upsert: [{ id: 'fresh-note', content: 'recent note', parentDates: ['2026-05-01'], createdAt: new Date().toISOString() }]
    }
  }, null);
  saveCalendarDelta(db, {
    notes: { delete: ['fresh-note'] }
  }, null);

  // Run purge
  const purgedCount = purgeExpiredTombstones(db, 30);
  assert.equal(purgedCount, 1);

  const remaining = db.prepare('SELECT id FROM deleted_records').all();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 'fresh-note');

  // Since revision was 1 for old-note which was purged, a client asking for `since = 1`
  // must trigger requiresFullSync: true because its watermark is older than the oldest tombstone
  const deltaCheck = getCalendarDelta(db, 1, null);
  assert.equal(deltaCheck.requiresFullSync, true, 'Client with expired watermark must receive requiresFullSync');
});

test('Guest migration: Claims tombstones and ledger sequences', async () => {
  const db = createTestDb();

  // Guest actions
  saveCalendarDelta(db, {
    notes: {
      upsert: [{ id: 'guest-note', content: 'guest content', parentDates: ['2026-05-15'], createdAt: new Date().toISOString() }],
      delete: ['deleted-guest-note']
    }
  }, null);

  const guestRev = getCurrentLedgerRevision(db, null);
  assert.ok(guestRev >= 1);

  // Register user
  const regResult = await registerUser(db, {
    email: 'test@example.com',
    password: 'Password123!',
    clientName: 'MacBook',
    clientType: 'desktop'
  });

  const userId = regResult.user.id;
  assert.ok(userId);

  // Verify that tombstones and sequences were migrated to the user
  const userTombstones = db.prepare('SELECT * FROM deleted_records WHERE user_id = ?').all(userId);
  assert.equal(userTombstones.length, 1);
  assert.equal(userTombstones[0].id, 'deleted-guest-note');

  const unassignedTombstones = db.prepare('SELECT * FROM deleted_records WHERE user_id IS NULL').all();
  assert.equal(unassignedTombstones.length, 0);

  const userRev = getCurrentLedgerRevision(db, userId);
  assert.equal(userRev, guestRev);

  // Next revision for user continues monotonically from the migrated revision
  const nextUserRev = getNextLedgerRevision(db, userId);
  assert.equal(nextUserRev, guestRev + 1);
});

test('Keepalive payload ceiling: delta payload size is safely under 64 KB', () => {
  // Simulate a typical batch of mutations within 400ms debounce
  const delta = {
    notes: {
      upsert: [
        {
          id: 'note-100',
          content: 'Finish quarterly review presentation and share with team',
          parentDates: ['2026-05-15'],
          isStruck: false,
          colorTag: '#4A90E2',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      delete: ['note-99']
    },
    weekNotes: {
      upsert: [
        {
          id: 'wnote-50',
          content: 'Weekly sprint planning',
          parentWeeks: ['2026-W20'],
          isStruck: false,
          createdAt: new Date().toISOString()
        }
      ]
    },
    circledDates: {
      upsert: {
        '2026-05-15': { color: '#E05A47' }
      },
      delete: ['2026-05-14']
    },
    settings: {
      inkColor: '#E05A47',
      showStruckItems: true
    }
  };

  const serialized = JSON.stringify(delta);
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');

  // Must be well below the browser's 64 KB keepalive limit
  assert.ok(sizeBytes < 2048, `Payload size (${sizeBytes} bytes) should be < 2 KB`);
  assert.ok(sizeBytes < 64 * 1024, `Payload size (${sizeBytes} bytes) must be < 64 KB limit`);
});
