import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { runMigrations } from '../server/migrations/runner.js';
import { saveCalendarDelta } from '../server/db.js';
import { handleApiRequest } from '../server/routes.js';
import { executeSelectorSearch, compileSelectorQuery } from '../server/selectorCompiler.js';

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

function setupSeededDatabase(userId = 'usr_alice') {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);

  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'n1',
            content: '@project[apollo, moon] @todo[status=wip, priority=1] Build lunar module',
            scope: 'day',
            targets: ['2026-11-04'],
            createdAt: '2026-11-04T10:00:00.000Z',
          },
          {
            id: 'n2',
            content: '@project[apollo] @todo[status=done, priority=2] Test engine',
            scope: 'day',
            targets: ['2026-11-04'],
            createdAt: '2026-11-04T11:00:00.000Z',
          },
          {
            id: 'n3',
            content: '@project[artemis] @todo[status=wip, priority=3] Rover test @wait[ref=n1, blocker="Avionics"]',
            scope: 'day',
            targets: ['2026-11-04'],
            createdAt: '2026-11-04T12:00:00.000Z',
          },
          {
            id: 'n4',
            content: '@memo Meeting notes with leadership',
            scope: 'day',
            targets: ['2026-11-04'],
            createdAt: '2026-11-04T13:00:00.000Z',
          },
          {
            id: 'n5',
            content: 'Plain prose without any tags or markup',
            scope: 'day',
            targets: ['2026-11-04'],
            createdAt: '2026-11-04T14:00:00.000Z',
          },
        ],
      },
    },
    userId
  );

  return db;
}

test('Tag Search (Category 1): Baseline Tag & Wildcard Matching', () => {
  const db = setupSeededDatabase();

  // 1. Exact tag match
  const memoRes = executeSelectorSearch(db, '@memo', 'usr_alice');
  assert.equal(memoRes.total, 1);
  assert.equal(memoRes.notes[0].id, 'n4');

  // 2. Wildcard @* matches all notes with any tag (n1, n2, n3, n4; not n5)
  const allTagged = executeSelectorSearch(db, '@*', 'usr_alice');
  assert.equal(allTagged.total, 4);
  assert.deepEqual(allTagged.notes.map((n) => n.id), ['n4', 'n3', 'n2', 'n1']);

  // 3. Wildcard attribute match: @*[status=wip]
  const wipRes = executeSelectorSearch(db, '@*[status=wip]', 'usr_alice');
  assert.equal(wipRes.total, 2);
  assert.deepEqual(wipRes.notes.map((n) => n.id), ['n3', 'n1']);

  // 4. Wildcard attribute match: @*[color="#51C391"] (default color of @todo)
  const greenRes = executeSelectorSearch(db, '@*[color="#51C391"]', 'usr_alice');
  assert.equal(greenRes.total, 3);
  assert.deepEqual(greenRes.notes.map((n) => n.id), ['n3', 'n2', 'n1']);
});

test('Tag Search (Category 2): Numerical Comparisons & Positional Multi-Values', () => {
  const db = setupSeededDatabase();

  // 1. Numerical comparison: <= 2 (n1 has prio 1, n2 has prio 2)
  const leRes = executeSelectorSearch(db, '@todo[priority <= 2]', 'usr_alice');
  assert.equal(leRes.total, 2);
  assert.deepEqual(leRes.notes.map((n) => n.id), ['n2', 'n1']);

  // 2. Numerical comparison: > 2 (n3 has prio 3)
  const gtRes = executeSelectorSearch(db, '@todo[priority > 2]', 'usr_alice');
  assert.equal(gtRes.total, 1);
  assert.equal(gtRes.notes[0].id, 'n3');

  // 3. Inequality: status != done (n1 has wip, n3 has wip)
  const notDoneRes = executeSelectorSearch(db, '@todo[status != done]', 'usr_alice');
  assert.equal(notDoneRes.total, 2);
  assert.deepEqual(notDoneRes.notes.map((n) => n.id), ['n3', 'n1']);

  // 4. Positional multi-value: @project[moon] (only n1 has moon)
  const moonRes = executeSelectorSearch(db, '@project[moon]', 'usr_alice');
  assert.equal(moonRes.total, 1);
  assert.equal(moonRes.notes[0].id, 'n1');

  // 5. Multiple positional values in one tag: @project[apollo, moon]
  const bothPos = executeSelectorSearch(db, '@project[apollo, moon]', 'usr_alice');
  assert.equal(bothPos.total, 1);
  assert.equal(bothPos.notes[0].id, 'n1');
});

test('Tag Search (Category 3): Relational Backlink & Target Selectors', () => {
  const db = setupSeededDatabase();

  // 1. Specific backlink reference: @*[ref=n1]
  const refRes = executeSelectorSearch(db, '@*[ref=n1]', 'usr_alice');
  assert.equal(refRes.total, 1);
  assert.equal(refRes.notes[0].id, 'n3');

  // 2. Bound tag and relation: @wait[ref=n1]
  const waitRefRes = executeSelectorSearch(db, '@wait[ref=n1]', 'usr_alice');
  assert.equal(waitRefRes.total, 1);
  assert.equal(waitRefRes.notes[0].id, 'n3');

  // 3. Relation presence wildcard: @*[ref=*] (finds any note with an outgoing reference)
  const anyRefRes = executeSelectorSearch(db, '@*[ref=*]', 'usr_alice');
  assert.equal(anyRefRes.total, 1);
  assert.equal(anyRefRes.notes[0].id, 'n3');

  // 4. Custom attribute on relation: @wait[blocker="Avionics"]
  const blockerRes = executeSelectorSearch(db, '@wait[blocker="Avionics"]', 'usr_alice');
  assert.equal(blockerRes.total, 1);
  assert.equal(blockerRes.notes[0].id, 'n3');
});

test('Tag Search (Category 4): Boolean Conjunctions, Disjunctions & De Morgan Negation', () => {
  const db = setupSeededDatabase();

  // 1. Conjunction (AND): @project[apollo] AND @todo[status=wip] -> n1
  const andRes = executeSelectorSearch(db, '@project[apollo] AND @todo[status=wip]', 'usr_alice');
  assert.equal(andRes.total, 1);
  assert.equal(andRes.notes[0].id, 'n1');

  // 2. Disjunction (OR): @memo OR @project[artemis] -> n4, n3
  const orRes = executeSelectorSearch(db, '@memo OR @project[artemis]', 'usr_alice');
  assert.equal(orRes.total, 2);
  assert.deepEqual(orRes.notes.map((n) => n.id), ['n4', 'n3']);

  // 3. Negation in conjunction: @project[apollo] AND !@todo[status=done] -> n1
  const notDoneApollo = executeSelectorSearch(db, '@project[apollo] AND !@todo[status=done]', 'usr_alice');
  assert.equal(notDoneApollo.total, 1);
  assert.equal(notDoneApollo.notes[0].id, 'n1');

  // 4. Standalone negation: !@todo (notes without any @todo -> n4, n5)
  const noTodo = executeSelectorSearch(db, '!@todo', 'usr_alice');
  assert.equal(noTodo.total, 2);
  assert.deepEqual(noTodo.notes.map((n) => n.id), ['n5', 'n4']);

  // 5. Multiple negations: !@todo AND !@memo -> n5 only
  const noTodoNoMemo = executeSelectorSearch(db, '!@todo AND !@memo', 'usr_alice');
  assert.equal(noTodoNoMemo.total, 1);
  assert.equal(noTodoNoMemo.notes[0].id, 'n5');
});

test('Tag Search (Category 5): Strict Multi-Tenant Query Isolation', () => {
  const db = setupSeededDatabase();

  // Bob creates a secret note with identical tags
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'bob_secret',
            content: '@project[apollo] @todo[status=wip, priority=1, pin=9999] Top Secret Rocket',
            scope: 'day',
            targets: ['2026-11-04'],
          },
        ],
      },
    },
    'usr_bob'
  );

  // Alice queries @project[apollo] -> sees ONLY Alice notes n1, n2; NEVER Bob's note
  const aliceRes = executeSelectorSearch(db, '@project[apollo]', 'usr_alice');
  assert.equal(aliceRes.total, 2);
  assert.ok(aliceRes.notes.every((n) => n.id !== 'bob_secret'));

  // Alice queries pin attribute -> 0 results
  const alicePin = executeSelectorSearch(db, '@*[pin=9999]', 'usr_alice');
  assert.equal(alicePin.total, 0);

  // Alice runs standalone negation !@memo -> Bob's secret is NEVER leaked
  const aliceNeg = executeSelectorSearch(db, '!@memo', 'usr_alice');
  assert.ok(aliceNeg.notes.every((n) => n.id !== 'bob_secret'));

  // Bob queries @*[pin=9999] -> sees his own note
  const bobRes = executeSelectorSearch(db, '@*[pin=9999]', 'usr_bob');
  assert.equal(bobRes.total, 1);
  assert.equal(bobRes.notes[0].id, 'bob_secret');
});

test('Tag Search (Category 6): Adversarial Inputs & Security Hardening', () => {
  const db = setupSeededDatabase();

  // 1. SQL Injection Attempt 1: Classic OR 1=1 bypass
  const sqli1 = executeSelectorSearch(db, '@todo[status="\' OR 1=1 --"]', 'usr_alice');
  assert.equal(sqli1.total, 0, 'SQL injection must not return unauthorized rows');

  // 2. SQL Injection Attempt 2: Dropping tables
  const sqli2 = executeSelectorSearch(db, '@*[key="\'; DROP TABLE notes; --"]', 'usr_alice');
  assert.equal(sqli2.total, 0);
  const tableCheck = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='notes'").get();
  assert.ok(tableCheck, 'Notes table must remain intact');

  // 3. Malformed / pathological bracket strings
  const malformed1 = executeSelectorSearch(db, '@todo[[[status=wip', 'usr_alice');
  assert.ok(Array.isArray(malformed1.notes));

  const malformed2 = executeSelectorSearch(db, '@todo[]', 'usr_alice');
  assert.equal(malformed2.total, 3, 'Empty brackets fallback to base tag');

  const malformed3 = executeSelectorSearch(db, '][', 'usr_alice');
  assert.equal(malformed3.total, 0);

  // 4. Empty and symbol-only queries
  const emptyRes = executeSelectorSearch(db, '', 'usr_alice');
  assert.ok(emptyRes.notes.length > 0, 'Empty selector returns all notes subject to scope/paging');

  const whitespaceRes = executeSelectorSearch(db, '     ', 'usr_alice');
  assert.ok(whitespaceRes.notes.length > 0);

  // 5. Length limit ceiling
  const longSelector = '@todo[' + 'a'.repeat(1200) + ']';
  assert.throws(
    () => executeSelectorSearch(db, longSelector, 'usr_alice'),
    /exceeds maximum allowed length/i
  );

  // 6. Term complexity ceiling
  const manyTerms = Array(60).fill('@tag').join(' AND ');
  assert.throws(
    () => executeSelectorSearch(db, manyTerms, 'usr_alice'),
    /exceeds maximum allowed complexity/i
  );

  // 7. Non-numeric limit and offset fallback safely
  const nanLimitRes = executeSelectorSearch(db, '@project[apollo]', 'usr_alice', { limit: 'garbage', offset: 'invalid' });
  assert.equal(nanLimitRes.limit, 50);
  assert.equal(nanLimitRes.offset, 0);
  assert.equal(nanLimitRes.total, 2);
  assert.equal(nanLimitRes.notes.length, 2);
});

test('Tag Search (Category 7): REST API Endpoints GET /api/notes/search and GET /api/notes?selector=...', async () => {
  const db = setupSeededDatabase(null); // Seed as guest for unauthenticated test requests

  // 1. Dedicated Search Endpoint: GET /api/notes/search?selector=@project[apollo]
  const searchRes = await dispatchRequest(db, 'GET', '/api/notes/search?selector=@project[apollo]');
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.data.total, 2);
  assert.deepEqual(searchRes.data.notes.map((n) => n.id), ['n2', 'n1']);

  // 2. Dedicated Search with fulltext query: text=lunar
  const textRes = await dispatchRequest(db, 'GET', '/api/notes/search?selector=@project[apollo]&text=lunar');
  assert.equal(textRes.status, 200);
  assert.equal(textRes.data.total, 1);
  assert.equal(textRes.data.notes[0].id, 'n1');

  // 3. Standard Notes endpoint with selector param: GET /api/notes?selector=@memo
  const notesRes = await dispatchRequest(db, 'GET', '/api/notes?selector=@memo');
  assert.equal(notesRes.status, 200);
  assert.equal(notesRes.data.total, 1);
  assert.equal(notesRes.data.notes[0].id, 'n4');

  // 4. Error response on complexity violation
  const badReq = await dispatchRequest(db, 'GET', '/api/notes/search?selector=' + encodeURIComponent('@tag[' + 'x'.repeat(1200) + ']'));
  assert.equal(badReq.status, 400);
  assert.match(badReq.data.error, /exceeds maximum allowed length/i);
});
