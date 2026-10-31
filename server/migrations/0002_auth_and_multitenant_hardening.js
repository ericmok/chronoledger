/**
 * Migration 0002: Auth & Multi-Tenant Hardening
 *
 * 1. Creates `api_tokens` table for Personal Access Tokens (PATs) with SHA-256 token hashing.
 * 2. Hardens `circled_dates` by migrating from single-tenant `date_key TEXT PRIMARY KEY`
 *    to composite `PRIMARY KEY (date_key, user_id)`, preventing cross-tenant collisions.
 * 3. Updates schema_version metadata to 9.
 */

export const schemaVersion = 9;

export function up(db) {
  // 1. Personal Access Tokens (PAT) table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT 'calendar:read,calendar:write',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);
  `);

  // 2. Hardened circled_dates table with composite primary key
  const hasCircledDates = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='circled_dates'").get()
  );

  if (hasCircledDates) {
    db.exec(`
      CREATE TABLE circled_dates_v2 (
        date_key TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '__guest__',
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (date_key, user_id)
      );

      INSERT OR IGNORE INTO circled_dates_v2 (date_key, user_id, color, created_at, revision)
      SELECT date_key, COALESCE(user_id, '__guest__'), color, created_at, revision
      FROM circled_dates;

      DROP TABLE circled_dates;
      ALTER TABLE circled_dates_v2 RENAME TO circled_dates;
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS circled_dates (
        date_key TEXT NOT NULL,
        user_id TEXT NOT NULL DEFAULT '__guest__',
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (date_key, user_id)
      );
    `);
  }

  // 3. Update schema_version metadata
  const hasMeta = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get()
  );
  if (hasMeta) {
    db.prepare(`
      INSERT INTO metadata (key, value) VALUES ('schema_version', '9')
      ON CONFLICT(key) DO UPDATE SET value = '9'
    `).run();
  }
}

export function down(db) {
  // 1. Drop api_tokens table
  db.exec(`
    DROP INDEX IF EXISTS idx_api_tokens_hash;
    DROP INDEX IF EXISTS idx_api_tokens_user_id;
    DROP TABLE IF EXISTS api_tokens;
  `);

  // 2. Revert circled_dates to single-tenant primary key
  const hasCircledDates = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='circled_dates'").get()
  );

  if (hasCircledDates) {
    db.exec(`
      CREATE TABLE circled_dates_v1 (
        date_key TEXT PRIMARY KEY,
        user_id TEXT,
        color TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1
      );

      INSERT OR IGNORE INTO circled_dates_v1 (date_key, user_id, color, created_at, revision)
      SELECT date_key, CASE WHEN user_id = '__guest__' THEN NULL ELSE user_id END, color, created_at, revision
      FROM circled_dates;

      DROP TABLE circled_dates;
      ALTER TABLE circled_dates_v1 RENAME TO circled_dates;
    `);
  }

  // 3. Revert schema_version metadata
  const hasMeta = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get()
  );
  if (hasMeta) {
    db.prepare(`
      INSERT INTO metadata (key, value) VALUES ('schema_version', '8')
      ON CONFLICT(key) DO UPDATE SET value = '8'
    `).run();
  }
}
