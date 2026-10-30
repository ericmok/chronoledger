import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { runMigrations } from '../server/migrations/runner.js';
import { handleApiRequest, checkTagMatch, checkStatusMatch } from '../server/routes.js';

function createTestDatabase() {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

function createMockReq(method, path, body = null, headers = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  req.headers = { host: 'localhost:5174', ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };

  // Dispatch body on next tick
  process.nextTick(() => {
    if (body !== null) {
      req.emit('data', typeof body === 'string' ? body : JSON.stringify(body));
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

test('Tag and status matching utilities', () => {
  // Tag matching
  assert.equal(checkTagMatch('Meeting with @alice tomorrow', false, 'alice', 'all'), true);
  assert.equal(checkTagMatch('Meeting with @bob tomorrow', false, 'alice', 'all'), false);
  assert.equal(checkTagMatch('Meeting with @alice tomorrow', false, 'alice', 'open'), true);
  assert.equal(checkTagMatch('Meeting with @alice tomorrow', true, 'alice', 'open'), false);
  assert.equal(checkTagMatch('Meeting with ~~@alice~~', false, 'alice', 'completed'), true);

  // Status matching
  assert.equal(checkStatusMatch('Regular note', false, 'open'), true);
  assert.equal(checkStatusMatch('Struck note', true, 'open'), false);
  assert.equal(checkStatusMatch('Struck note', true, 'completed'), true);
});

test('HTTP Routes: GET /api/health returns health status', async () => {
  const db = createTestDatabase();
  const req = createMockReq('GET', '/api/health');
  const res = createMockRes();

  const promise = res.waitForResponse();
  const handled = handleApiRequest(req, res, db);
  assert.equal(handled, true);

  const response = await promise;
  assert.equal(response.status, 200);
  assert.equal(response.data.status, 'ok');
  assert.equal(response.data.engine, 'sqlite');
});

test('HTTP Routes: POST /api/notes and GET /api/notes CRUD lifecycle', async () => {
  const db = createTestDatabase();

  // 1. Create a note
  const postReq = createMockReq('POST', '/api/notes', {
    content: 'Review decoupling pull request @architecture',
    scope: 'day',
    targets: ['2026-10-29'],
  });
  const postRes = createMockRes();
  const postPromise = postRes.waitForResponse();
  handleApiRequest(postReq, postRes, db);
  const postResponse = await postPromise;

  assert.equal(postResponse.status, 201);
  assert.ok(postResponse.data.id);
  assert.equal(postResponse.data.content, 'Review decoupling pull request @architecture');
  assert.deepEqual(postResponse.data.targets, ['2026-10-29']);

  const noteId = postResponse.data.id;

  // 2. Query note via GET /api/notes?tag=architecture
  const getReq = createMockReq('GET', '/api/notes?tag=architecture');
  const getRes = createMockRes();
  const getPromise = getRes.waitForResponse();
  handleApiRequest(getReq, getRes, db);
  const getResponse = await getPromise;

  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.data.total, 1);
  assert.equal(getResponse.data.notes[0].id, noteId);

  // 3. Toggle strike via POST /api/notes/:id/toggle-strike
  const strikeReq = createMockReq('POST', `/api/notes/${noteId}/toggle-strike`);
  const strikeRes = createMockRes();
  const strikePromise = strikeRes.waitForResponse();
  handleApiRequest(strikeReq, strikeRes, db);
  const strikeResponse = await strikePromise;

  assert.equal(strikeResponse.status, 200);
  assert.equal(strikeResponse.data.isStruck, true);

  // 4. Delete note via DELETE /api/notes/:id
  const delReq = createMockReq('DELETE', `/api/notes/${noteId}`);
  const delRes = createMockRes();
  const delPromise = delRes.waitForResponse();
  handleApiRequest(delReq, delRes, db);
  const delResponse = await delPromise;

  assert.equal(delResponse.status, 200);
  assert.equal(delResponse.data.ok, true);
  assert.equal(delResponse.data.deletedId, noteId);
});

test('HTTP Routes: CORS preflight returns 204 No Content', async () => {
  const db = createTestDatabase();
  const req = createMockReq('OPTIONS', '/api/calendar', null, { origin: 'https://example.com' });
  const res = createMockRes();

  let finished = false;
  res.end = () => { finished = true; };
  const handled = handleApiRequest(req, res, db);

  assert.equal(handled, true);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://example.com');
  assert.equal(finished, true);
});
