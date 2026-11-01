import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../server/migrations/runner.js';
import { saveCalendarData, saveCalendarDelta, getCalendarData } from '../server/db.js';
import { registerUser } from '../server/auth.js';

function createTestDatabase() {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

test('Zero-Pollution Guest Migration: Newly registered account starts clean with 0 demo notes in SQLite', async () => {
  const db = createTestDatabase();

  // Register User A (who just transitioned from guest mode)
  const userAResult = await registerUser(db, {
    email: 'usera@example.com',
    password: 'Password123!',
    clientName: 'Test Browser',
  });
  assert.ok(userAResult.user, 'User A should be registered');
  const userIdA = userAResult.user.id;

  // Verify that SQLite database has NO demo notes assigned to User A
  const dataA = getCalendarData(db, userIdA);
  assert.equal(dataA.hasData, false, 'New user account must have hasData === false');
  assert.equal(dataA.notes.length, 0, 'New user must have 0 notes in SQLite');
  assert.equal(dataA.weekNotes.length, 0, 'New user must have 0 week notes in SQLite');
  assert.equal(dataA.monthNotes.length, 0, 'New user must have 0 month notes in SQLite');
});

test('Zero-Pollution Guest Migration: Promoted guest notes save to SQLite, while demo blueprints are excluded', async () => {
  const db = createTestDatabase();

  const userResult = await registerUser(db, {
    email: 'promoted@example.com',
    password: 'Password123!',
    clientName: 'Test Browser',
  });
  const userId = userResult.user.id;

  // Simulate client-side filtered payload on login:
  // A guest user modified a note (promoted to note-123) and drew an arrow pointing to it,
  // but untouched demo notes (demo-1, demo-2, wnote-1) were discarded by !isDemoId
  const promotedNote = {
    id: `note-${Date.now()}-abc12`,
    content: 'My promoted personal note from guest mode',
    scope: 'day',
    targets: ['2026-11-01'],
    parentDates: ['2026-11-01'],
    isStruck: false,
    createdAt: new Date().toISOString(),
  };

  const drawingWithAnchor = {
    id: `draw-${Date.now()}-xyz34`,
    type: 'arrow',
    color: '#2B2C30',
    thickness: 2,
    anchorStartDate: '2026-11-01',
    startOffset: { x: 100, y: 100 },
    startAnchor: {
      dateString: '2026-11-01',
      noteId: promotedNote.id,
      xRatio: 0.5,
      yRatio: 0.5,
    },
    endAnchor: {
      dateString: '2026-11-01',
      xRatio: 0.8,
      yRatio: 0.8,
    },
  };

  // Baseline save into user account
  const saveResult = saveCalendarData(
    db,
    {
      notes: [promotedNote],
      weekNotes: [],
      monthNotes: [],
      drawings: [drawingWithAnchor],
      circledDates: {},
      settings: {},
    },
    userId
  );

  assert.ok(saveResult.ok, 'Save calendar data should succeed');

  // Verify that SQLite only contains the promoted note and drawing
  const hydrated = getCalendarData(db, userId);
  assert.equal(hydrated.hasData, true, 'User now has data');
  assert.equal(hydrated.notes.length, 1, 'Exactly 1 note saved');
  assert.equal(hydrated.notes[0].id, promotedNote.id, 'Promoted note ID preserved');
  assert.equal(hydrated.notes[0].content, 'My promoted personal note from guest mode');
  assert.equal(hydrated.drawings.length, 1, 'Drawing saved');
  assert.equal(hydrated.drawings[0].startAnchor.noteId, promotedNote.id, 'Drawing note anchor preserved');

  // Ensure no demo IDs exist in the database
  const demoCheck = db.prepare("SELECT count(*) as count FROM notes WHERE id LIKE 'demo-%' OR id = 'wnote-1'").get();
  assert.equal(demoCheck.count, 0, 'No demo IDs should exist in SQLite');
});

test('Multi-Tenant Isolation: User accounts cannot read or overwrite other users guest transitions', async () => {
  const db = createTestDatabase();

  const userA = await registerUser(db, { email: 'user1@test.com', password: 'Password123!' });
  const userB = await registerUser(db, { email: 'user2@test.com', password: 'Password123!' });

  // User A saves a note
  saveCalendarData(
    db,
    {
      notes: [{ id: 'note-a1', content: 'Secret A', parentDates: ['2026-11-01'] }],
      weekNotes: [],
      monthNotes: [],
      drawings: [],
      settings: {},
    },
    userA.user.id
  );

  // User B tries to delta-upsert User A's note ID
  saveCalendarDelta(
    db,
    {
      notes: { upsert: [{ id: 'note-a1', content: 'Hacked by B', parentDates: ['2026-11-01'] }] },
    },
    userB.user.id
  );

  // Verify User A's data remains untouched
  const dataA = getCalendarData(db, userA.user.id);
  assert.equal(dataA.notes[0].content, 'Secret A', "User A's note must remain unaltered by User B");

  // Verify User B cannot hijack User A's note ID
  const dataB = getCalendarData(db, userB.user.id);
  assert.equal(dataB.notes.length, 0, "User B cannot take or overwrite User A's note ID");
});
