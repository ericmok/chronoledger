import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { EventEmitter } from 'node:events';
import { runMigrations } from '../server/migrations/runner.js';
import { handleApiRequest, clearRateLimits } from '../server/routes.js';
import { saveCalendarDelta, getCalendarData } from '../server/db.js';
import * as migration0002 from '../server/migrations/0002_auth_and_multitenant_hardening.js';

function createTestDatabase() {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

function createMockReq(method, path, body = null, headers = {}, ip = '127.0.0.1') {
  const req = new EventEmitter();
  req.method = method;
  req.url = path;
  const lowerHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    lowerHeaders[k.toLowerCase()] = v;
  }
  req.headers = { host: 'localhost:5174', ...lowerHeaders };
  req.socket = { remoteAddress: ip };

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

async function dispatchRequest(db, method, path, body = null, headers = {}, ip = '127.0.0.1') {
  const req = createMockReq(method, path, body, headers, ip);
  const res = createMockRes();
  const promise = res.waitForResponse();
  handleApiRequest(req, res, db);
  return promise;
}

test('Password Change: Successful password change updates hash, invalidates other sessions, and enforces new password', async () => {
  clearRateLimits();
  const db = createTestDatabase();

  // 1. Register a user
  const regRes = await dispatchRequest(db, 'POST', '/api/auth/register', {
    email: 'alice@example.com',
    password: 'OriginalPassword123!',
  });
  assert.equal(regRes.status, 201);
  const token1 = regRes.data.token;

  // 2. Log in from a second device (Device 2)
  const login2Res = await dispatchRequest(db, 'POST', '/api/auth/login', {
    email: 'alice@example.com',
    password: 'OriginalPassword123!',
    clientName: 'iPad',
  });
  assert.equal(login2Res.status, 200);
  const token2 = login2Res.data.token;
  assert.notEqual(token1, token2);

  // Both sessions should be active
  const me1 = await dispatchRequest(db, 'GET', '/api/auth/me', null, { Authorization: `Bearer ${token1}` });
  assert.equal(me1.data.authenticated, true);
  const me2 = await dispatchRequest(db, 'GET', '/api/auth/me', null, { Authorization: `Bearer ${token2}` });
  assert.equal(me2.data.authenticated, true);

  // 3. Alice changes password from Device 1
  const changeRes = await dispatchRequest(
    db,
    'POST',
    '/api/auth/change-password',
    {
      currentPassword: 'OriginalPassword123!',
      newPassword: 'BrandNewSecurePassword456!',
    },
    { Authorization: `Bearer ${token1}` }
  );
  assert.equal(changeRes.status, 200);
  assert.equal(changeRes.data.ok, true);

  // 4. Device 1 session remains active, but Device 2 session is invalidated
  const me1After = await dispatchRequest(db, 'GET', '/api/auth/me', null, { Authorization: `Bearer ${token1}` });
  assert.equal(me1After.data.authenticated, true);

  const me2After = await dispatchRequest(db, 'GET', '/api/auth/me', null, { Authorization: `Bearer ${token2}` });
  assert.equal(me2After.data.authenticated, false);

  // 5. Old password no longer works
  const oldLogin = await dispatchRequest(db, 'POST', '/api/auth/login', {
    email: 'alice@example.com',
    password: 'OriginalPassword123!',
  });
  assert.equal(oldLogin.status, 401);

  // 6. New password works
  const newLogin = await dispatchRequest(db, 'POST', '/api/auth/login', {
    email: 'alice@example.com',
    password: 'BrandNewSecurePassword456!',
  });
  assert.equal(newLogin.status, 200);
  assert.ok(newLogin.data.token);
});

test('Password Change: Rejects incorrect current password and short new password', async () => {
  clearRateLimits();
  const db = createTestDatabase();

  const regRes = await dispatchRequest(db, 'POST', '/api/auth/register', {
    email: 'bob@example.com',
    password: 'Password123!',
  });
  const token = regRes.data.token;

  // 1. Wrong current password
  const wrongCurrent = await dispatchRequest(
    db,
    'POST',
    '/api/auth/change-password',
    {
      currentPassword: 'WrongPassword!',
      newPassword: 'ValidNewPassword123!',
    },
    { Authorization: `Bearer ${token}` }
  );
  assert.equal(wrongCurrent.status, 400);
  assert.match(wrongCurrent.data.error, /Current password is incorrect/i);

  // 2. Short new password (< 6 chars)
  const shortNew = await dispatchRequest(
    db,
    'POST',
    '/api/auth/change-password',
    {
      currentPassword: 'Password123!',
      newPassword: '123',
    },
    { Authorization: `Bearer ${token}` }
  );
  assert.equal(shortNew.status, 400);
  assert.match(shortNew.data.error, /at least 6 characters/i);
});

test('MCP Hardening: clientType=mcp CANNOT bypass password verification', async () => {
  clearRateLimits();
  const db = createTestDatabase();

  await dispatchRequest(db, 'POST', '/api/auth/register', {
    email: 'victim@example.com',
    password: 'RealSecretPassword999!',
  });

  // Attempt to exploit former clientType === 'mcp' backdoor
  const exploitRes = await dispatchRequest(db, 'POST', '/api/auth/login', {
    email: 'victim@example.com',
    password: 'wrong_or_empty_password',
    clientName: 'Attacker MCP Client',
    clientType: 'mcp',
  });

  assert.equal(exploitRes.status, 401);
  assert.match(exploitRes.data.error, /Invalid email or password/i);
});

test('Personal Access Tokens (PAT): Complete lifecycle (Create, List, Authenticate, Revoke)', async () => {
  clearRateLimits();
  const db = createTestDatabase();

  const regRes = await dispatchRequest(db, 'POST', '/api/auth/register', {
    email: 'dev@example.com',
    password: 'Password123!',
  });
  const sessionToken = regRes.data.token;

  // 1. Create a Personal Access Token
  const createPatRes = await dispatchRequest(
    db,
    'POST',
    '/api/auth/tokens',
    {
      name: 'MacBook Claude Desktop',
      scopes: 'calendar:read,calendar:write',
    },
    { Authorization: `Bearer ${sessionToken}` }
  );

  assert.equal(createPatRes.status, 201);
  assert.ok(createPatRes.data.token.startsWith('cal_pat_'));
  assert.equal(createPatRes.data.name, 'MacBook Claude Desktop');
  const patToken = createPatRes.data.token;
  const patId = createPatRes.data.id;

  // 2. List tokens
  const listPatRes = await dispatchRequest(db, 'GET', '/api/auth/tokens', null, {
    Authorization: `Bearer ${sessionToken}`,
  });
  assert.equal(listPatRes.status, 200);
  assert.equal(listPatRes.data.tokens.length, 1);
  assert.equal(listPatRes.data.tokens[0].id, patId);
  // Ensure raw secret hash is not exposed
  assert.equal(listPatRes.data.tokens[0].token, undefined);

  // 3. Authenticate using Bearer PAT
  const patMeRes = await dispatchRequest(db, 'GET', '/api/auth/me', null, {
    Authorization: `Bearer ${patToken}`,
  });
  assert.equal(patMeRes.status, 200);
  assert.equal(patMeRes.data.authenticated, true);
  assert.equal(patMeRes.data.user.email, 'dev@example.com');

  // 4. Perform calendar operations via PAT
  const addNoteRes = await dispatchRequest(
    db,
    'POST',
    '/api/notes',
    {
      content: 'Note authored via MCP tool @todo',
      scope: 'day',
      targets: ['2026-11-01'],
    },
    { Authorization: `Bearer ${patToken}` }
  );
  assert.equal(addNoteRes.status, 201);

  // 5. Revoke the token
  const revokeRes = await dispatchRequest(db, 'DELETE', `/api/auth/tokens/${patId}`, null, {
    Authorization: `Bearer ${sessionToken}`,
  });
  assert.equal(revokeRes.status, 200);
  assert.equal(revokeRes.data.ok, true);

  // 6. PAT is immediately rejected
  const meAfterRevoke = await dispatchRequest(db, 'GET', '/api/auth/me', null, {
    Authorization: `Bearer ${patToken}`,
  });
  assert.equal(meAfterRevoke.data.authenticated, false);
});

test('Multi-Tenant Isolation: User B cannot overwrite User A notes via batch delta upsert', () => {
  const db = createTestDatabase();

  // 1. User A creates a note
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'note-secret-100',
            content: "User A's sensitive financial plan",
            scope: 'day',
            targets: ['2026-10-31'],
          },
        ],
      },
    },
    'usr_alice'
  );

  const aliceDataBefore = getCalendarData(db, 'usr_alice');
  assert.equal(aliceDataBefore.notes[0].content, "User A's sensitive financial plan");

  // 2. Malicious User B tries to push a delta upsert with User A's note ID
  saveCalendarDelta(
    db,
    {
      notes: {
        upsert: [
          {
            id: 'note-secret-100',
            content: 'OVERWRITTEN BY USER B',
            scope: 'day',
            targets: ['2026-10-31'],
          },
        ],
      },
    },
    'usr_bob'
  );

  // 3. User A's note remains protected and unmutated!
  const aliceDataAfter = getCalendarData(db, 'usr_alice');
  assert.equal(aliceDataAfter.notes[0].content, "User A's sensitive financial plan");

  const bobData = getCalendarData(db, 'usr_bob');
  assert.equal(bobData.notes.length, 0);
});

test('Multi-Tenant Isolation: User A and User B can circle the same date independently', () => {
  const db = createTestDatabase();

  // User A circles Oct 31 in red
  saveCalendarDelta(
    db,
    {
      circledDates: {
        upsert: {
          '2026-10-31': { color: '#D23B38' },
        },
      },
    },
    'usr_alice'
  );

  // User B circles the exact same date Oct 31 in blue
  saveCalendarDelta(
    db,
    {
      circledDates: {
        upsert: {
          '2026-10-31': { color: '#2A9D8F' },
        },
      },
    },
    'usr_bob'
  );

  // Both users retrieve their own independent circles!
  const aliceData = getCalendarData(db, 'usr_alice');
  assert.equal(aliceData.circledDates['2026-10-31'].color, '#D23B38');

  const bobData = getCalendarData(db, 'usr_bob');
  assert.equal(bobData.circledDates['2026-10-31'].color, '#2A9D8F');
});

test('Rate Limiting: Exceeding sliding-window limit triggers HTTP 429 Too Many Requests', async () => {
  clearRateLimits();
  const db = createTestDatabase();
  const testIp = '192.168.1.100';

  // Send 10 rapid failed logins (allowed up to limit)
  for (let i = 0; i < 10; i++) {
    const res = await dispatchRequest(
      db,
      'POST',
      '/api/auth/login',
      {
        email: 'nobody@example.com',
        password: 'wrong',
      },
      {},
      testIp
    );
    assert.equal(res.status, 401);
  }

  // 11th request triggers rate limiter
  const throttledRes = await dispatchRequest(
    db,
    'POST',
    '/api/auth/login',
    {
      email: 'nobody@example.com',
      password: 'wrong',
    },
    {},
    testIp
  );
  assert.equal(throttledRes.status, 429);
  assert.match(throttledRes.data.error, /Too many login attempts/i);
});

test('Migration 0002: Reversible up() and down() lifecycle', () => {
  const db = new DatabaseSync(':memory:');
  // Run baseline 0001
  runMigrations(db);

  // Check api_tokens exists after 0002 is run
  const hasApiTokens = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='api_tokens'").get());
  assert.equal(hasApiTokens, true);

  // Rollback migration 0002
  migration0002.down(db);
  const afterDown = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='api_tokens'").get());
  assert.equal(afterDown, false);

  // Re-apply migration 0002
  migration0002.up(db);
  const afterReUp = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='api_tokens'").get());
  assert.equal(afterReUp, true);
});
