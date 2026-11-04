import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { runMigrations, rollbackMigration } from '../server/migrations/runner.js';
import * as migration0001 from '../server/migrations/0001_baseline_v8.js';
import * as migration0002 from '../server/migrations/0002_auth_and_multitenant_hardening.js';
import * as migration0003 from '../server/migrations/0003_note_attributes_and_tags.js';
import { saveCalendarDelta, saveCalendarData, getCalendarData } from '../server/db.js';
import { handleApiRequest } from '../server/routes.js';

function createMockReq(method, urlPath, body = null, headers = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = urlPath;
  req.headers = {
    host: 'localhost:8787',
    'content-type': 'application/json',
    ...headers,
  };
  req.socket = { remoteAddress: '127.0.0.1' };

  process.nextTick(() => {
    if (body) {
      req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
    }
    req.emit('end');
  });

  return req;
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    writeHead(status, headers = {}) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body += chunk;
      if (this.resolvePromise) {
        this.resolvePromise({
          status: this.statusCode,
          headers: this.headers,
          data: this.body ? JSON.parse(this.body) : null,
        });
      }
    },
    waitForResponse() {
      return new Promise((resolve) => {
        this.resolvePromise = resolve;
      });
    },
  };
}

async function dispatchRequest(db, method, path, body = null, headers = {}) {
  const req = createMockReq(method, path, body, headers);
  const res = createMockRes();
  const promise = res.waitForResponse();
  handleApiRequest(req, res, db);
  return promise;
}

test('Migration 0003: Reversible up() and down() lifecycle and historical note backfill', () => {
  const db = new DatabaseSync(':memory:');

  // 1. Manually apply 0001 and 0002 baseline
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  migration0001.up(db);
  db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES ('0001', '0001_baseline_v8.js', ?)").run(new Date().toISOString());
  migration0002.up(db);
  db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES ('0002', '0002_auth_and_multitenant_hardening.js', ?)").run(new Date().toISOString());

  const vBefore = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
  assert.equal(vBefore.value, '9');

  // Verify note_attributes and user_tag_definitions do NOT exist yet
  const tableCheckBefore = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('note_attributes', 'user_tag_definitions')").all();
  assert.equal(tableCheckBefore.length, 0);

  // 2. Populate historical notes before migration 0003 runs
  const insertNote = db.prepare(`
    INSERT INTO notes (id, user_id, content, scope, targets, start_at, end_at, is_struck, created_at, revision)
    VALUES (?, ?, ?, 'day', '["2026-11-03"]', '2026-11-03T00:00:00.000Z', '2026-11-03T23:59:59.999Z', ?, ?, 1)
  `);

  const now = new Date().toISOString();
  // Alice Note 1: Standard todo + urgent
  insertNote.run('note_alice_1', 'usr_alice', '@todo Review pull request @urgent', 0, now);
  // Alice Note 2: Wait with relation and attribute
  insertNote.run('note_alice_2', 'usr_alice', '@wait[ref=note_alice_1, blocker="Security Review"] Wait for SecOps', 0, now);
  // Alice Note 3: Struck important task
  insertNote.run('note_alice_3', 'usr_alice', '~~@important Fix production outage~~', 1, now);
  // Bob Note 4: Positional values
  insertNote.run('note_bob_1', 'usr_bob', '@project[mars, landing] Plan rocket stage', 0, now);
  // Guest Note 5: Null user_id with priority override
  insertNote.run('note_guest_1', null, '@memo Meeting recap @todo[priority=1]', 0, now);

  // 3. Apply migration 0003 up()
  migration0003.up(db);
  db.prepare("INSERT INTO _migrations (id, name, applied_at) VALUES ('0003', '0003_note_attributes_and_tags.js', ?)").run(now);

  const vAfter = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
  assert.equal(vAfter.value, '10');

  // 4. Verify user_tag_definitions was seeded for Alice, Bob, and Guest
  const aliceDefs = db.prepare("SELECT COUNT(*) as count FROM user_tag_definitions WHERE user_id = 'usr_alice'").get();
  assert.equal(aliceDefs.count, 10);
  const bobDefs = db.prepare("SELECT COUNT(*) as count FROM user_tag_definitions WHERE user_id = 'usr_bob'").get();
  assert.equal(bobDefs.count, 10);
  const guestDefs = db.prepare("SELECT COUNT(*) as count FROM user_tag_definitions WHERE user_id = '__guest__'").get();
  assert.equal(guestDefs.count, 10);

  // 5. Verify historical backfill into note_attributes
  // Alice Note 1
  const aliceTags = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_alice_1' AND attr_key = '__tag__' ORDER BY attr_value").all();
  assert.deepEqual(aliceTags.map((r) => r.attr_value), ['todo', 'urgent']);

  const aliceStatus = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_alice_1' AND attr_key = 'status' AND tag_name = 'todo'").get();
  assert.equal(aliceStatus.attr_value, 'open');

  // Alice Note 2: Relation ref and blocker
  const aliceRef = db.prepare("SELECT attr_value, is_relation FROM note_attributes WHERE note_id = 'note_alice_2' AND attr_key = 'ref'").get();
  assert.equal(aliceRef.attr_value, 'note_alice_1');
  assert.equal(aliceRef.is_relation, 1);

  const aliceBlocker = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_alice_2' AND attr_key = 'blocker'").get();
  assert.equal(aliceBlocker.attr_value, 'Security Review');

  // Alice Note 3: Struck note -> status='done'
  const aliceDone = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_alice_3' AND attr_key = 'status' AND tag_name = 'important'").get();
  assert.equal(aliceDone.attr_value, 'done');

  // Bob Note 4: Positional values 'mars' and 'landing'
  const bobVals = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_bob_1' AND attr_key = '__val__' ORDER BY attr_value").all();
  assert.deepEqual(bobVals.map((r) => r.attr_value), ['landing', 'mars']);

  // Guest Note 5: Priority override
  const guestPrio = db.prepare("SELECT attr_value, num_value, is_default FROM note_attributes WHERE note_id = 'note_guest_1' AND attr_key = 'priority' AND tag_name = 'todo'").get();
  assert.equal(guestPrio.attr_value, '1');
  assert.equal(guestPrio.num_value, 1);
  assert.equal(guestPrio.is_default, 0);

  // 6. Test down() rollback
  migration0003.down(db);
  const tableCheckDown = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('note_attributes', 'user_tag_definitions')").all();
  assert.equal(tableCheckDown.length, 0);

  const vReverted = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
  assert.equal(vReverted.value, '9');

  // All 5 historical notes remain completely intact in notes table!
  const noteCount = db.prepare('SELECT COUNT(*) as count FROM notes').get();
  assert.equal(noteCount.count, 5);

  // 7. Test re-applying up()
  migration0003.up(db);
  const vReUp = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
  assert.equal(vReUp.value, '10');
  const attrsCount = db.prepare('SELECT COUNT(*) as count FROM note_attributes').get();
  assert.ok(attrsCount.count > 0);
});

test('Live Re-indexing: saveCalendarDelta and saveCalendarData keep note_attributes in sync', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);

  // 1. Delta upsert with rich tag attributes
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'note_delta_1',
            content: '@project[apollo, moon] @todo[priority=2, status=wip] Launch lunar mission',
            scope: 'day',
            targets: ['2026-11-04'],
          },
        ],
      },
    },
    'usr_alice'
  );

  // Verify tags indexed
  const tags = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_delta_1' AND attr_key = '__tag__' ORDER BY attr_value").all();
  assert.deepEqual(tags.map((r) => r.attr_value), ['project', 'todo']);

  const values = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_delta_1' AND attr_key = '__val__' ORDER BY attr_value").all();
  assert.deepEqual(values.map((r) => r.attr_value), ['apollo', 'moon']);

  const statusRow = db.prepare("SELECT attr_value, is_default FROM note_attributes WHERE note_id = 'note_delta_1' AND attr_key = 'status' AND tag_name = 'todo'").get();
  assert.equal(statusRow.attr_value, 'wip');
  assert.equal(statusRow.is_default, 0);

  const prioRow = db.prepare("SELECT attr_value, num_value, is_default FROM note_attributes WHERE note_id = 'note_delta_1' AND attr_key = 'priority' AND tag_name = 'todo'").get();
  assert.equal(prioRow.attr_value, '2');
  assert.equal(prioRow.num_value, 2);
  assert.equal(prioRow.is_default, 0);

  // 2. Delta update: replace @todo with @celebrate
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'note_delta_1',
            content: '@celebrate Landing complete!',
            scope: 'day',
            targets: ['2026-11-04'],
          },
        ],
      },
    },
    'usr_alice'
  );

  const updatedTags = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_delta_1' AND attr_key = '__tag__'").all();
  assert.deepEqual(updatedTags.map((r) => r.attr_value), ['celebrate']);

  // Old project and todo attributes are completely gone
  const oldTodo = db.prepare("SELECT COUNT(*) as count FROM note_attributes WHERE note_id = 'note_delta_1' AND tag_name = 'todo'").get();
  assert.equal(oldTodo.count, 0);

  // 3. Delta delete: purge note and its attributes
  saveCalendarDelta(
    db,
    {
      notes: {
        delete: ['note_delta_1'],
      },
    },
    'usr_alice'
  );

  const remainingAttrs = db.prepare("SELECT COUNT(*) as count FROM note_attributes WHERE note_id = 'note_delta_1'").get();
  assert.equal(remainingAttrs.count, 0);

  // 4. Full saveCalendarData batch rewrite
  saveCalendarData(
    db,
    {
      allNotes: [
        {
          id: 'note_batch_1',
          content: '@quote "To the stars" @thought Space exploration',
          scope: 'day',
          targets: ['2026-11-04'],
        },
      ],
    },
    'usr_alice'
  );

  const batchTags = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_batch_1' AND attr_key = '__tag__' ORDER BY attr_value").all();
  assert.deepEqual(batchTags.map((r) => r.attr_value), ['quote', 'thought']);
});

test('Multi-Tenant Isolation: Note attributes are strictly isolated per user', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);

  // 1. User Alice creates a secret note
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'note_secret_alice',
            content: '@memo Secret password @todo[pin=4821]',
            scope: 'day',
            targets: ['2026-11-04'],
          },
        ],
      },
    },
    'usr_alice'
  );

  // Verify Alice has indexed attributes
  const aliceAttrs = db.prepare("SELECT * FROM note_attributes WHERE user_id = 'usr_alice' AND note_id = 'note_secret_alice'").all();
  assert.ok(aliceAttrs.length > 0);

  // Bob queries attributes under his tenant -> 0 results
  const bobQuery = db.prepare("SELECT * FROM note_attributes WHERE user_id = 'usr_bob'").all();
  assert.equal(bobQuery.length, 0);

  // 2. Malicious User Bob attempts to overwrite Alice's note via delta
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'note_secret_alice',
            content: '@compromised Hacked note content',
            scope: 'day',
            targets: ['2026-11-04'],
          },
        ],
      },
    },
    'usr_bob'
  );

  // Alice's note in notes table is unchanged
  const aliceNote = db.prepare("SELECT content FROM notes WHERE id = 'note_secret_alice'").get();
  assert.equal(aliceNote.content, '@memo Secret password @todo[pin=4821]');

  // Alice's note_attributes remain untouched!
  const alicePin = db.prepare("SELECT attr_value FROM note_attributes WHERE user_id = 'usr_alice' AND attr_key = 'pin'").get();
  assert.equal(alicePin.attr_value, '4821');

  // Bob still has 0 attributes
  const bobAfterAttack = db.prepare("SELECT * FROM note_attributes WHERE user_id = 'usr_bob'").all();
  assert.equal(bobAfterAttack.length, 0);
});

test('Tag Definitions API: Custom prototype defaults update indexing', async () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);

  // 1. Fetch default definitions for guest
  const getRes = await dispatchRequest(db, 'GET', '/api/tags/definitions');
  assert.equal(getRes.status, 200);
  assert.ok(getRes.data.definitions.todo);
  assert.equal(getRes.data.definitions.todo.color, '#51C391');

  // 2. Update todo definition with custom styling and priority
  const putRes = await dispatchRequest(db, 'PUT', '/api/tags/definitions/todo', {
    color: '#FF0055',
    notable: 0,
    gutterPriority: 15,
  });
  assert.equal(putRes.status, 200);
  assert.equal(putRes.data.color, '#FF0055');
  assert.equal(putRes.data.notable, 0);
  assert.equal(putRes.data.gutterPriority, 15);

  // 3. Create a note with @todo; verify custom prototype defaults applied
  const noteRes = await dispatchRequest(db, 'POST', '/api/notes', {
    content: '@todo Buy fresh coffee beans',
    scope: 'day',
    targets: ['2026-11-04'],
  });
  assert.equal(noteRes.status, 201);
  const noteId = noteRes.data.id;

  const colorAttr = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = ? AND attr_key = 'color'").get(noteId);
  assert.equal(colorAttr.attr_value, '#FF0055');

  const notableAttr = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = ? AND attr_key = 'notable'").get(noteId);
  assert.equal(notableAttr.attr_value, 'false');

  const prioAttr = db.prepare("SELECT attr_value, num_value FROM note_attributes WHERE note_id = ? AND attr_key = 'priority'").get(noteId);
  assert.equal(prioAttr.attr_value, '15');
  assert.equal(prioAttr.num_value, 15);

  // 4. Delete custom definition -> resets back to core prototype
  const delRes = await dispatchRequest(db, 'DELETE', '/api/tags/definitions/todo');
  assert.equal(delRes.status, 200);
  assert.equal(delRes.data.definition.color, '#51C391');

  // Verify that deleting the definition resets note_attributes with is_default = 1 back to factory color
  const colorAttrReset = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = ? AND attr_key = 'color'").get(noteId);
  assert.equal(colorAttrReset.attr_value, '#51C391');

  // 5. Rejection of invalid tag names
  const invalidRes = await dispatchRequest(db, 'PUT', '/api/tags/definitions/bad%20tag!@#', { color: '#000000' });
  assert.equal(invalidRes.status, 400);
});

test('Tag Indexing Edge Cases: Duplicate positional values, escaped tags, and mixed-case attributes', () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);

  // 1. Note with duplicate positional values and identical tags in one note
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'note_edge_1',
            content: '@project[mars, mars] @todo Buy milk @todo Call mom',
            scope: 'day',
            targets: ['2026-11-04'],
          },
        ],
      },
    },
    'usr_alice'
  );

  const marsVals = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = 'note_edge_1' AND attr_key = '__val__'").all();
  assert.equal(marsVals.length, 2);
  assert.equal(marsVals[0].attr_value, 'mars');
  assert.equal(marsVals[1].attr_value, 'mars');

  const todoTags = db.prepare("SELECT tag_instance_id FROM note_attributes WHERE note_id = 'note_edge_1' AND attr_key = '__tag__' AND tag_name = 'todo'").all();
  assert.equal(todoTags.length, 2);

  // 2. Note with escaped tag (\@todo) must NOT be indexed
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'note_edge_2',
            content: 'Contact support\\@example.com or use escaped \\@todo syntax',
            scope: 'day',
            targets: ['2026-11-04'],
          },
        ],
      },
    },
    'usr_alice'
  );

  const escapedAttrs = db.prepare("SELECT * FROM note_attributes WHERE note_id = 'note_edge_2'").all();
  assert.equal(escapedAttrs.length, 0);

  // 3. Mixed-case attribute keys normalize cleanly
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'note_edge_3',
            content: '@todo[Status=wip, Priority=1, Blocker="API"]',
            scope: 'day',
            targets: ['2026-11-04'],
          },
        ],
      },
    },
    'usr_alice'
  );

  const statusRow = db.prepare("SELECT attr_value, attr_key FROM note_attributes WHERE note_id = 'note_edge_3' AND attr_key = 'status'").get();
  assert.equal(statusRow.attr_value, 'wip');
  assert.equal(statusRow.attr_key, 'status');

  const prioRow = db.prepare("SELECT attr_value, num_value FROM note_attributes WHERE note_id = 'note_edge_3' AND attr_key = 'priority'").get();
  assert.equal(prioRow.attr_value, '1');
  assert.equal(prioRow.num_value, 1);
});

test('Strikethrough Resolution: toggle-strike updates note_attributes status between open and done', async () => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);

  // 1. Create active note with @todo
  const createRes = await dispatchRequest(db, 'POST', '/api/notes', {
    content: '@todo Refactor database migrations',
    scope: 'day',
    targets: ['2026-11-04'],
  });
  assert.equal(createRes.status, 201);
  const noteId = createRes.data.id;

  // Verify status is open
  const statusBefore = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = ? AND attr_key = 'status'").get(noteId);
  assert.equal(statusBefore.attr_value, 'open');

  // 2. Toggle strike ON
  const strikeRes = await dispatchRequest(db, 'POST', `/api/notes/${noteId}/toggle-strike`);
  assert.equal(strikeRes.status, 200);
  assert.equal(strikeRes.data.isStruck, true);

  // Verify status is now done
  const statusAfter = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = ? AND attr_key = 'status'").get(noteId);
  assert.equal(statusAfter.attr_value, 'done');

  // 3. Toggle strike OFF
  const unstrikeRes = await dispatchRequest(db, 'POST', `/api/notes/${noteId}/toggle-strike`);
  assert.equal(unstrikeRes.status, 200);
  assert.equal(unstrikeRes.data.isStruck, false);

  // Verify status reverted to open
  const statusReverted = db.prepare("SELECT attr_value FROM note_attributes WHERE note_id = ? AND attr_key = 'status'").get(noteId);
  assert.equal(statusReverted.attr_value, 'open');
});
