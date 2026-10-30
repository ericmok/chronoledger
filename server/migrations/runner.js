import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/**
 * Ensures the migration ledger table exists.
 */
function ensureMigrationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

/**
 * Detects whether an existing database is already at Schema v8 or higher
 * and marks the squashed baseline 0001_baseline_v8 as applied if _migrations is empty.
 */
function handleBaselineAutoSeed(db) {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM _migrations').get();
  if (countRow.count > 0) return;

  const hasMeta = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get();
  if (!hasMeta) return;

  const metaRow = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
  const currentVersion = Number(metaRow?.value) || 0;

  if (currentVersion >= 8) {
    db.prepare(`
      INSERT INTO _migrations (id, name, applied_at)
      VALUES (?, ?, ?)
    `).run('0001', '0001_baseline_v8.js', new Date().toISOString());
    console.log('[DB Migration] Existing Schema v8 detected: marked 0001_baseline_v8 as applied.');
  }
}

/**
 * Discovers and returns all 4-digit migration files in server/migrations/ in numerical order.
 */
function getMigrationFiles() {
  const entries = fs.readdirSync(__dirname);
  return entries
    .filter((file) => /^\d{4}_.*\.js$/.test(file))
    .sort();
}

/**
 * Runs all pending migrations in ascending order.
 * Each migration's up() runs inside its own atomic transaction.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Array<{ id: string, name: string }>}
 */
export function runMigrations(db) {
  ensureMigrationTable(db);
  handleBaselineAutoSeed(db);

  const appliedRows = db.prepare('SELECT id FROM _migrations').all();
  const appliedIds = new Set(appliedRows.map((r) => r.id));

  const files = getMigrationFiles();
  const newlyApplied = [];

  for (const file of files) {
    const id = file.slice(0, 4);
    if (appliedIds.has(id)) continue;

    const filePath = path.join(__dirname, file);
    const migration = require(filePath);

    if (typeof migration.up !== 'function') {
      throw new Error(`Migration ${file} must export an up(db) function.`);
    }

    db.exec('BEGIN TRANSACTION;');
    try {
      migration.up(db);

      db.prepare(`
        INSERT INTO _migrations (id, name, applied_at)
        VALUES (?, ?, ?)
      `).run(id, file, new Date().toISOString());

      // Update metadata schema_version
      const hasMeta = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get();
      if (hasMeta) {
        const verNum = migration.schemaVersion ? String(migration.schemaVersion) : String(parseInt(id, 10));
        db.prepare(`
          INSERT INTO metadata (key, value) VALUES ('schema_version', ?)
          ON CONFLICT(key) DO UPDATE SET value = ?
        `).run(verNum, verNum);
      }

      db.exec('COMMIT;');
      console.log(`[DB Migration] Applied migration ${file}`);
      newlyApplied.push({ id, name: file });
    } catch (err) {
      db.exec('ROLLBACK;');
      console.error(`[DB Migration Error] Failed applying ${file}:`, err);
      throw err;
    }
  }

  return newlyApplied;
}

/**
 * Rolls back the most recently applied migration.
 * Runs down(db) inside an atomic transaction.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {{ id: string, name: string } | null}
 */
export function rollbackMigration(db) {
  ensureMigrationTable(db);

  const lastApplied = db.prepare('SELECT id, name FROM _migrations ORDER BY id DESC LIMIT 1').get();
  if (!lastApplied) {
    console.log('[DB Migration] No migrations to roll back.');
    return null;
  }

  const filePath = path.join(__dirname, lastApplied.name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Cannot find migration file on disk for applied migration: ${lastApplied.name}`);
  }

  const migration = require(filePath);
  if (typeof migration.down !== 'function') {
    throw new Error(`Migration ${lastApplied.name} does not export a down(db) function.`);
  }

  db.exec('BEGIN TRANSACTION;');
  try {
    migration.down(db);

    db.prepare('DELETE FROM _migrations WHERE id = ?').run(lastApplied.id);

    // Update metadata schema_version to the previous migration's schemaVersion, or delete if none
    const prevApplied = db.prepare('SELECT id, name FROM _migrations ORDER BY id DESC LIMIT 1').get();
    const hasMeta = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get();
    if (hasMeta) {
      if (prevApplied) {
        const prevFile = path.join(__dirname, prevApplied.name);
        let prevVer = String(parseInt(prevApplied.id, 10));
        try {
          const prevMod = require(prevFile);
          if (prevMod.schemaVersion) prevVer = String(prevMod.schemaVersion);
        } catch {}
        db.prepare(`
          INSERT INTO metadata (key, value) VALUES ('schema_version', ?)
          ON CONFLICT(key) DO UPDATE SET value = ?
        `).run(prevVer, prevVer);
      } else {
        db.prepare("DELETE FROM metadata WHERE key = 'schema_version'").run();
      }
    }

    db.exec('COMMIT;');
    console.log(`[DB Migration] Successfully rolled back migration ${lastApplied.name}`);
    return lastApplied;
  } catch (err) {
    db.exec('ROLLBACK;');
    console.error(`[DB Migration Error] Failed rolling back ${lastApplied.name}:`, err);
    throw err;
  }
}

/**
 * Returns current status of all discovered migrations (applied vs pending).
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @returns {Array<{ id: string, name: string, applied: boolean, appliedAt: string | null }>}
 */
export function getMigrationStatus(db) {
  ensureMigrationTable(db);
  handleBaselineAutoSeed(db);

  const appliedRows = db.prepare('SELECT id, name, applied_at FROM _migrations ORDER BY id ASC').all();
  const appliedMap = new Map(appliedRows.map((r) => [r.id, r]));

  const files = getMigrationFiles();
  const status = [];

  for (const file of files) {
    const id = file.slice(0, 4);
    const applied = appliedMap.get(id);
    status.push({
      id,
      name: file,
      applied: !!applied,
      appliedAt: applied ? applied.applied_at : null,
    });
  }

  return status;
}
