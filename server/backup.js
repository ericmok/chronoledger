import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';

/**
 * Standard GFS (Grandfather-Father-Son) Backup Filenames.
 * Keeps exactly 3 predictable files in data/backups/ to strictly limit storage usage.
 */
export const BACKUP_FILES = {
  RECENT: 'chronoledger-recent.sqlite.gz',
  WEEKLY: 'chronoledger-weekly.sqlite.gz',
  MONTHLY: 'chronoledger-monthly.sqlite.gz',
};

// Default policy intervals (in milliseconds)
export const DEFAULT_INTERVALS = {
  RECENT_MS: 2 * 24 * 60 * 60 * 1000,   // 48 hours (trigger threshold on user writes)
  WEEKLY_MS: 7 * 24 * 60 * 60 * 1000,   // 7 days (weekly promotion threshold)
  MONTHLY_MS: 30 * 24 * 60 * 60 * 1000, // 30 days (monthly promotion threshold)
  ERROR_COOLDOWN_MS: 30 * 60 * 1000,    // 30 minutes (prevent retry storms on failing backups)
};

// In-memory runtime state for concurrency and failure backoff
let isBackingUp = false;
let lastFailureTime = 0;
let lastFailureError = null;

/**
 * 1. DATABASE DUMP ENGINES (Isolated Swap Point for Postgres)
 * -------------------------------------------------------------
 * When migrating ChronoLedger to PostgreSQL in the future, only this section
 * needs to be updated. All GFS rotation, scheduling, and retention logic
 * remains 100% database-agnostic.
 */

/**
 * SQLite Database Dump Engine (Active).
 * Uses SQLite's native VACUUM INTO to create an atomic, defragmented,
 * transactionally consistent snapshot without holding read/write locks.
 *
 * @param {import('node:sqlite').DatabaseSync} db - Active SQLite database connection
 * @param {string} targetFilePath - Destination path for the uncompressed snapshot
 */
export async function dumpSqliteDatabase(db, targetFilePath) {
  // Sanitize path by escaping single quotes according to standard SQL string literal rules
  const safePath = targetFilePath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${safePath}'`);
}

/**
 * PostgreSQL Database Dump Engine (Stub for Future Migration).
 *
 * When switching to PostgreSQL:
 * 1. Ensure `postgresql-client` is installed in your runtime / Docker container.
 * 2. Set the `DATABASE_URL` environment variable (e.g., postgresql://user:pass@host:5432/chronoledger).
 * 3. Point `dumpDatabase()` to invoke this function instead of `dumpSqliteDatabase`.
 *
 * Note: Unlike SQLite (which writes an uncompressed file first), pg_dump can
 * stream directly into zlib gzip via stdout with zero intermediate disk spike!
 *
 * @param {string} targetGzipPath - Destination path for the compressed dump
 * @param {string} [connectionString] - Postgres connection URI
 */
export async function dumpPostgresDatabase(targetGzipPath, connectionString = process.env.DATABASE_URL) {
  /*
  const { spawn } = await import('node:child_process');
  return new Promise((resolve, reject) => {
    if (!connectionString) {
      return reject(new Error('DATABASE_URL environment variable is not defined for PostgreSQL dump.'));
    }

    // Run pg_dump in custom directory/archive format (-Fc)
    const proc = spawn('pg_dump', [connectionString, '-Fc', '--no-owner', '--no-privileges'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const writeStream = fs.createWriteStream(targetGzipPath);
    const gzip = zlib.createGzip({ level: 9 });

    pipeline(proc.stdout, gzip, writeStream)
      .then(resolve)
      .catch(reject);

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump exited with code ${code}: ${stderr}`));
      }
    });
  });
  */
  throw new Error(
    'PostgreSQL dump engine is not enabled yet. Configure DATABASE_URL and enable dumpPostgresDatabase in server/backup.js.'
  );
}

/**
 * Unified dispatch for database dumping.
 */
async function dumpDatabase(db, targetFilePath, engine = 'sqlite') {
  if (engine === 'sqlite') {
    await dumpSqliteDatabase(db, targetFilePath);
  } else if (engine === 'postgres') {
    await dumpPostgresDatabase(targetFilePath);
  } else {
    throw new Error(`Unsupported database engine: ${engine}`);
  }
}

/**
 * 2. RECOVERY & CLEANUP HELPERS
 * -------------------------------------------------------------
 */

/**
 * Scans the backups directory and safely unlinks any lingering temporary files
 * left over from aborted processes, SIGTERM restarts, or interrupted compression streams.
 *
 * @param {string} backupsDir - Absolute path to data/backups/
 * @param {number} [olderThanMs=60000] - Only delete files older than this threshold (0 cleans all)
 */
export function cleanOrphanedTempFiles(backupsDir, olderThanMs = 60000) {
  try {
    if (!fs.existsSync(backupsDir)) return;
    const now = Date.now();
    const entries = fs.readdirSync(backupsDir);
    for (const name of entries) {
      if (name.endsWith('.tmp') || name.startsWith('temp-dump-') || name.startsWith('temp-backup-')) {
        const fullPath = path.join(backupsDir, name);
        try {
          if (olderThanMs > 0) {
            const stat = fs.statSync(fullPath);
            if (now - stat.mtimeMs < olderThanMs) {
              continue; // Do not touch files currently being written
            }
          }
          fs.unlinkSync(fullPath);
        } catch {
          // Ignore individual unlink errors
        }
      }
    }
  } catch (err) {
    console.error('[Backup Cleanup Warning]: Failed to scan backups directory for temp files:', err.message);
  }
}

/**
 * 3. GFS ROTATION & BACKUP EXECUTION
 * -------------------------------------------------------------
 */

/**
 * Executes a full database backup with Grandfather-Father-Son (GFS) 3-tier rotation.
 *
 * Flow:
 * 1. Checks 2-day freshness guard and error cooldown (unless options.force is true).
 * 2. Writes an atomic database dump to a temporary staging file.
 * 3. Compresses the dump with Gzip.
 * 4. Rotates existing files:
 *    - If Weekly is >= 7 days old, promotes Weekly -> Monthly (if Monthly >= 30 days old or missing).
 *    - Promotes existing Recent -> Weekly.
 * 5. Atomically renames the new compressed file to Recent.
 * 6. Ensures exactly 3 compressed files exist on disk.
 *
 * @param {import('node:sqlite').DatabaseSync} db - Active SQLite database connection
 * @param {string} dataDir - Absolute path to application data directory (containing backups/)
 * @param {object} [options] - Optional runtime overrides (useful for testing and admin triggers)
 * @param {boolean} [options.force=false] - If true, bypasses the 2-day freshness check
 * @param {number} [options.now] - Custom timestamp for deterministic testing
 * @param {number} [options.recentIntervalMs] - Override for recent backup interval
 * @param {number} [options.weeklyIntervalMs] - Override for weekly promotion interval
 * @param {number} [options.monthlyIntervalMs] - Override for monthly promotion interval
 * @param {string} [options.engine='sqlite'] - Database engine ('sqlite' or 'postgres')
 * @returns {Promise<{ status: string, reason?: string, files?: object }>}
 */
export async function performBackup(db, dataDir, options = {}) {
  const backupsDir = path.join(dataDir, 'backups');
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const recentInterval = options.recentIntervalMs ?? DEFAULT_INTERVALS.RECENT_MS;
  const weeklyInterval = options.weeklyIntervalMs ?? DEFAULT_INTERVALS.WEEKLY_MS;
  const monthlyInterval = options.monthlyIntervalMs ?? DEFAULT_INTERVALS.MONTHLY_MS;
  const errorCooldown = options.errorCooldownMs ?? DEFAULT_INTERVALS.ERROR_COOLDOWN_MS;
  const engine = options.engine ?? 'sqlite';

  // 1. Guard against overlapping concurrent backup tasks
  if (isBackingUp) {
    return { status: 'skipped', reason: 'A backup is currently in progress' };
  }

  // 2. Guard against failure retry storms (30-min cooldown after an error)
  if (!options.force && now - lastFailureTime < errorCooldown) {
    const minutesRemaining = Math.ceil((errorCooldown - (now - lastFailureTime)) / (60 * 1000));
    return {
      status: 'cooldown',
      reason: `Backup in error cooldown for another ${minutesRemaining} minutes (${lastFailureError})`,
    };
  }

  // 3. Ensure backup folder exists and clean any stale temp files
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  cleanOrphanedTempFiles(backupsDir);

  const recentPath = path.join(backupsDir, BACKUP_FILES.RECENT);
  const weeklyPath = path.join(backupsDir, BACKUP_FILES.WEEKLY);
  const monthlyPath = path.join(backupsDir, BACKUP_FILES.MONTHLY);

  // 4. Check if recent backup is still fresh (skip if < 2 days old)
  if (!options.force && fs.existsSync(recentPath)) {
    try {
      const recentStat = fs.statSync(recentPath);
      const ageMs = now - recentStat.mtimeMs;
      if (ageMs < recentInterval) {
        return {
          status: 'skipped',
          reason: `Recent backup is fresh (${(ageMs / (1000 * 60 * 60)).toFixed(1)} hours old, threshold is ${(recentInterval / (1000 * 60 * 60)).toFixed(0)} hours)`,
        };
      }
    } catch (statErr) {
      // If stat fails, continue and attempt fresh backup
    }
  }

  // Acquire concurrency mutex
  isBackingUp = true;

  const runId = `${now}-${Math.random().toString(36).slice(2, 7)}`;
  const tempDumpPath = path.join(backupsDir, `temp-dump-${runId}.sqlite`);
  const tempGzipPath = path.join(backupsDir, `temp-backup-${runId}.sqlite.gz.tmp`);

  try {
    // Step A: Create database dump
    await dumpDatabase(db, tempDumpPath, engine);

    // Step B: Stream compress using maximum gzip compression
    await pipeline(
      fs.createReadStream(tempDumpPath),
      zlib.createGzip({ level: 9 }),
      fs.createWriteStream(tempGzipPath)
    );

    // Step C: Execute Grandfather-Father-Son (GFS) Slot Promotion
    if (fs.existsSync(recentPath)) {
      const hasWeekly = fs.existsSync(weeklyPath);
      const weeklyStat = hasWeekly ? fs.statSync(weeklyPath) : null;
      const isWeeklyDue = !hasWeekly || (now - weeklyStat.mtimeMs >= weeklyInterval);

      if (isWeeklyDue) {
        // If weekly is due for rotation, check if monthly is also due
        if (hasWeekly) {
          const hasMonthly = fs.existsSync(monthlyPath);
          const monthlyStat = hasMonthly ? fs.statSync(monthlyPath) : null;
          const isMonthlyDue = !hasMonthly || (now - monthlyStat.mtimeMs >= monthlyInterval);

          if (isMonthlyDue) {
            // Promote existing weekly to monthly
            fs.copyFileSync(weeklyPath, monthlyPath);
          }
        }

        // Promote existing recent to weekly
        fs.copyFileSync(recentPath, weeklyPath);
      }
    }

    // Step D: Atomically replace the Recent backup slot
    fs.renameSync(tempGzipPath, recentPath);

    // Clear failure states upon success
    lastFailureTime = 0;
    lastFailureError = null;

    return {
      status: 'completed',
      timestamp: new Date(now).toISOString(),
      files: getBackupStatus(dataDir).files,
    };
  } catch (err) {
    lastFailureTime = now;
    lastFailureError = err.message || String(err);
    console.error('[ChronoLedger Backup Failure]:', err);
    throw err;
  } finally {
    // Guaranteed cleanup of temporary files regardless of success or failure
    try {
      if (fs.existsSync(tempDumpPath)) fs.unlinkSync(tempDumpPath);
    } catch {}
    try {
      if (fs.existsSync(tempGzipPath)) fs.unlinkSync(tempGzipPath);
    } catch {}

    isBackingUp = false;
  }
}

/**
 * 4. NON-BLOCKING TRIGGER
 * -------------------------------------------------------------
 * Safe to fire from any HTTP write route (e.g., saveCalendarDelta).
 * Dispatches asynchronously via setImmediate() so the user's HTTP response
 * is never delayed.
 *
 * @param {import('node:sqlite').DatabaseSync} db - Active SQLite database connection
 * @param {string} dataDir - Absolute path to application data directory
 * @param {object} [options] - Optional overrides passed to performBackup
 */
export function triggerBackupCheck(db, dataDir, options = {}) {
  // Rapid in-memory exit to prevent redundant event loop dispatch
  if (isBackingUp) return;

  // Do not automatically trigger backups for anonymous in-memory test databases (:memory:)
  try {
    if (db && typeof db.prepare === 'function') {
      const dbs = db.prepare('PRAGMA database_list').all();
      const mainDb = dbs?.find((d) => d.name === 'main');
      if (mainDb && (!mainDb.file || mainDb.file === '')) {
        return; // In-memory database, skip automatic file backup
      }
    }
  } catch {
    // If PRAGMA check fails, allow performBackup to evaluate
  }

  setImmediate(async () => {
    try {
      await performBackup(db, dataDir, options);
    } catch (err) {
      // Errors are already logged and tracked by performBackup
    }
  });
}

/**
 * 5. STATUS & INTROSPECTION
 * -------------------------------------------------------------
 * Returns a human- and machine-readable inspection of current backup slots.
 *
 * @param {string} dataDir - Absolute path to application data directory
 * @returns {object} Status object containing file sizes, timestamps, and ages
 */
export function getBackupStatus(dataDir) {
  const backupsDir = path.join(dataDir, 'backups');
  const now = Date.now();

  const inspectSlot = (fileName) => {
    const fullPath = path.join(backupsDir, fileName);
    if (!fs.existsSync(fullPath)) {
      return { exists: false };
    }
    try {
      const stat = fs.statSync(fullPath);
      const ageHours = (now - stat.mtimeMs) / (1000 * 60 * 60);
      return {
        exists: true,
        path: fullPath,
        sizeBytes: stat.size,
        sizeFormatted: `${(stat.size / 1024).toFixed(1)} KB`,
        modifiedAt: stat.mtime.toISOString(),
        ageHours: Number(ageHours.toFixed(1)),
        ageDays: Number((ageHours / 24).toFixed(1)),
      };
    } catch {
      return { exists: false };
    }
  };

  return {
    backupsDir,
    isBackingUp,
    lastFailure: lastFailureTime
      ? {
          failedAt: new Date(lastFailureTime).toISOString(),
          error: lastFailureError,
          cooldownActive: now - lastFailureTime < DEFAULT_INTERVALS.ERROR_COOLDOWN_MS,
        }
      : null,
    files: {
      recent: inspectSlot(BACKUP_FILES.RECENT),
      weekly: inspectSlot(BACKUP_FILES.WEEKLY),
      monthly: inspectSlot(BACKUP_FILES.MONTHLY),
    },
  };
}
