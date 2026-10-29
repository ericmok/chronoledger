import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import os from 'node:os';
import {
  performBackup,
  getBackupStatus,
  cleanOrphanedTempFiles,
  BACKUP_FILES,
} from '../server/backup.js';

function createSandbox() {
  const dir = path.join(os.tmpdir(), `chronoledger-backup-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(dir, { recursive: true });
  const dbPath = path.join(dir, 'chronoledger.sqlite');
  const db = new DatabaseSync(dbPath);

  // Set up standard test schema
  db.exec(`
    CREATE TABLE notes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE settings (
      id TEXT PRIMARY KEY,
      ink_color TEXT NOT NULL
    );
  `);

  return {
    dir,
    dbPath,
    db,
    cleanup: () => {
      try {
        db.close();
      } catch {}
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    },
  };
}

function readSqliteFromGzip(gzFilePath) {
  const compressed = fs.readFileSync(gzFilePath);
  const decompressed = zlib.gunzipSync(compressed);
  const tempPath = path.join(os.tmpdir(), `temp-read-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.sqlite`);
  fs.writeFileSync(tempPath, decompressed);
  const db = new DatabaseSync(tempPath);
  return {
    db,
    cleanup: () => {
      try { db.close(); } catch {}
      try { fs.unlinkSync(tempPath); } catch {}
    },
  };
}

test('GFS Backup: Initial backup creates valid, compressed Recent snapshot', async () => {
  const sandbox = createSandbox();
  try {
    sandbox.db.exec("INSERT INTO notes VALUES ('note-1', 'user-1', 'First note', '2026-10-29T12:00:00Z');");
    sandbox.db.exec("INSERT INTO settings VALUES ('default', '#D23B38');");

    const result = await performBackup(sandbox.db, sandbox.dir, { force: true });
    assert.equal(result.status, 'completed');

    const status = getBackupStatus(sandbox.dir);
    assert.equal(status.files.recent.exists, true);
    assert.equal(status.files.weekly.exists, false);
    assert.equal(status.files.monthly.exists, false);
    assert.ok(status.files.recent.sizeBytes > 0);

    // Decompress and verify database content integrity
    const reader = readSqliteFromGzip(status.files.recent.path);
    try {
      const note = reader.db.prepare("SELECT * FROM notes WHERE id = 'note-1'").get();
      assert.equal(note.content, 'First note');
      const setting = reader.db.prepare("SELECT * FROM settings WHERE id = 'default'").get();
      assert.equal(setting.ink_color, '#D23B38');
    } finally {
      reader.cleanup();
    }
  } finally {
    sandbox.cleanup();
  }
});

test('GFS Backup: Freshness guard throttles writes occurring within 48 hours', async () => {
  const sandbox = createSandbox();
  try {
    const t0 = Date.now();
    await performBackup(sandbox.db, sandbox.dir, { force: true, now: t0 });

    // Immediate write 1 hour later
    const t1 = t0 + 1 * 60 * 60 * 1000;
    sandbox.db.exec("INSERT INTO notes VALUES ('note-2', 'user-1', 'Fast follow-up', '2026-10-29T13:00:00Z');");

    const res = await performBackup(sandbox.db, sandbox.dir, { force: false, now: t1 });
    assert.equal(res.status, 'skipped');
    assert.match(res.reason, /Recent backup is fresh/);

    const status = getBackupStatus(sandbox.dir);
    // Weekly should not have been created on a skipped run
    assert.equal(status.files.weekly.exists, false);
  } finally {
    sandbox.cleanup();
  }
});

test('GFS Backup: Grandfather-Father-Son rotation lifecycle over 40 days', async () => {
  const sandbox = createSandbox();
  try {
    const DAY = 24 * 60 * 60 * 1000;
    let clock = Date.now();

    // Day 0: Baseline state
    sandbox.db.exec("INSERT INTO notes VALUES ('d0', 'u1', 'Day 0 Note', '2026-10-01T00:00:00Z');");
    await performBackup(sandbox.db, sandbox.dir, { force: true, now: clock });

    let status = getBackupStatus(sandbox.dir);
    assert.equal(status.files.recent.exists, true);
    assert.equal(status.files.weekly.exists, false);
    assert.equal(status.files.monthly.exists, false);

    // Day 3 (72 hours later): First rotation into Weekly
    clock += 3 * DAY;
    sandbox.db.exec("INSERT INTO notes VALUES ('d3', 'u1', 'Day 3 Note', '2026-10-04T00:00:00Z');");
    await performBackup(sandbox.db, sandbox.dir, { now: clock });

    status = getBackupStatus(sandbox.dir);
    assert.equal(status.files.recent.exists, true);
    assert.equal(status.files.weekly.exists, true);
    assert.equal(status.files.monthly.exists, false);

    // Verify weekly holds the Day 0 snapshot, while recent holds Day 3
    const weeklyReader = readSqliteFromGzip(status.files.weekly.path);
    try {
      const d0InWeekly = weeklyReader.db.prepare("SELECT * FROM notes WHERE id = 'd0'").get();
      assert.ok(d0InWeekly);
      const d3InWeekly = weeklyReader.db.prepare("SELECT * FROM notes WHERE id = 'd3'").get();
      assert.equal(d3InWeekly, undefined); // Day 3 note should NOT be in the older weekly backup
    } finally {
      weeklyReader.cleanup();
    }

    const recentReader = readSqliteFromGzip(status.files.recent.path);
    try {
      const d3InRecent = recentReader.db.prepare("SELECT * FROM notes WHERE id = 'd3'").get();
      assert.ok(d3InRecent); // Day 3 note IS in recent
    } finally {
      recentReader.cleanup();
    }

    // Day 5: Mid-week edit (less than 7 days since weekly rotation)
    clock += 2 * DAY;
    sandbox.db.exec("INSERT INTO notes VALUES ('d5', 'u1', 'Day 5 Note', '2026-10-06T00:00:00Z');");
    await performBackup(sandbox.db, sandbox.dir, { now: clock });

    // Weekly should remain untouched (still preserves Day 0 snapshot)
    status = getBackupStatus(sandbox.dir);
    assert.equal(status.files.monthly.exists, false);

    // Day 35: Long term promotion into Monthly
    clock += 30 * DAY;
    // Set weekly file mtime to simulate it being 8 days old
    const fakeWeeklyMtime = new Date(clock - 8 * DAY);
    fs.utimesSync(status.files.weekly.path, fakeWeeklyMtime, fakeWeeklyMtime);

    sandbox.db.exec("INSERT INTO notes VALUES ('d35', 'u1', 'Day 35 Note', '2026-11-05T00:00:00Z');");
    await performBackup(sandbox.db, sandbox.dir, { now: clock });

    status = getBackupStatus(sandbox.dir);
    assert.equal(status.files.recent.exists, true);
    assert.equal(status.files.weekly.exists, true);
    assert.equal(status.files.monthly.exists, true);

    // Verify exactly 3 backup files exist in data/backups/
    const backupsDir = path.join(sandbox.dir, 'backups');
    const existing = fs.readdirSync(backupsDir).filter((f) => f.endsWith('.sqlite.gz'));
    assert.equal(existing.length, 3);
  } finally {
    sandbox.cleanup();
  }
});

test('GFS Backup: Startup and maintenance purges orphaned .tmp files', () => {
  const sandbox = createSandbox();
  try {
    const backupsDir = path.join(sandbox.dir, 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });

    // Simulate aborted/crashed temporary files
    const staleTmp = path.join(backupsDir, 'temp-dump-123.sqlite');
    const staleGzTmp = path.join(backupsDir, 'temp-backup-123.sqlite.gz.tmp');
    const realBackup = path.join(backupsDir, BACKUP_FILES.RECENT);

    fs.writeFileSync(staleTmp, 'aborted dump');
    fs.writeFileSync(staleGzTmp, 'aborted gzip');
    fs.writeFileSync(realBackup, 'valid backup');

    cleanOrphanedTempFiles(backupsDir, 0);

    assert.equal(fs.existsSync(staleTmp), false);
    assert.equal(fs.existsSync(staleGzTmp), false);
    assert.equal(fs.existsSync(realBackup), true);
  } finally {
    sandbox.cleanup();
  }
});

test('GFS Backup: PostgreSQL engine stub throws helpful migration guidance', async () => {
  const sandbox = createSandbox();
  try {
    await assert.rejects(
      async () => {
        await performBackup(sandbox.db, sandbox.dir, { force: true, engine: 'postgres' });
      },
      /PostgreSQL dump engine is not enabled yet\. Configure DATABASE_URL/
    );
  } finally {
    sandbox.cleanup();
  }
});

test('GFS Backup API: GET and POST /api/backups endpoint', async () => {
  const sandbox = createSandbox();
  const { handleApiRequest } = await import('../server/db.js');
  try {
    // 1. GET /api/backups
    let statusCode = 0;
    let responseBody = '';
    const mockReqGet = {
      url: '/api/backups',
      method: 'GET',
      headers: { host: 'localhost:5174' },
    };
    const mockResGet = {
      writeHead: (code) => { statusCode = code; },
      end: (data) => { responseBody = data; },
    };

    const handledGet = handleApiRequest(mockReqGet, mockResGet, sandbox.db);
    assert.equal(handledGet, true);
    assert.equal(statusCode, 200);
    const parsedGet = JSON.parse(responseBody);
    assert.equal(typeof parsedGet.files, 'object');
    assert.equal(parsedGet.files.recent.exists, false);

    // 2. POST /api/backups (On-demand manual trigger)
    let postStatusCode = 0;
    let postResponseBody = '';
    const mockReqPost = {
      url: '/api/backups',
      method: 'POST',
      headers: { host: 'localhost:5174' },
    };
    const mockResPost = {
      writeHead: (code) => { postStatusCode = code; },
      end: (data) => { postResponseBody = data; },
    };

    const handledPost = handleApiRequest(mockReqPost, mockResPost, sandbox.db);
    assert.equal(handledPost, true);

    // Wait a brief tick for async performBackup promise resolution
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(postStatusCode, 200);
    const parsedPost = JSON.parse(postResponseBody);
    assert.equal(parsedPost.ok, true);
    assert.equal(parsedPost.status, 'completed');
  } finally {
    sandbox.cleanup();
  }
});
