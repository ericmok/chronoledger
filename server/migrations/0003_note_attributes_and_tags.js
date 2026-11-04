/**
 * Migration 0003: Note Attributes Sidecar Index & User Tag Definitions
 *
 * 1. Creates `user_tag_definitions` table for user-customizable tag prototype defaults.
 * 2. Creates `note_attributes` table with 4 covering B-Tree indexes for sub-millisecond
 *    tag selector search, wildcard queries, and backlink lookups.
 * 3. Seeds the 10 core stationery prototypes for all existing users (and guest).
 * 4. Backfills all existing notes in `notes` table into `note_attributes` within an atomic transaction.
 * 5. Updates schema_version metadata to 10.
 */

import { CORE_TAG_PROTOTYPES } from '../../src/utils/tagPrototypes.ts';
import { extractNoteAttributeRows, getUserTagDefinitions } from '../tagIndexer.js';

export const schemaVersion = 10;

export function up(db) {
  // 1. User Tag Definitions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_tag_definitions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tag_name TEXT NOT NULL COLLATE NOCASE,
      color TEXT NOT NULL,
      notable INTEGER NOT NULL DEFAULT 1,
      gutter_priority INTEGER NOT NULL DEFAULT 5,
      is_core INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, tag_name)
    );

    CREATE INDEX IF NOT EXISTS idx_user_tag_defs_user 
      ON user_tag_definitions(user_id, tag_name);
  `);

  // 2. Note Attributes sidecar table with 4 covering B-Tree indexes
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_attributes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_instance_id TEXT NOT NULL,
      tag_name TEXT NOT NULL COLLATE NOCASE,
      attr_key TEXT NOT NULL,
      attr_value TEXT NOT NULL,
      num_value REAL,
      is_relation INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- Index 1: Exact tag + attribute queries (e.g. @todo[status=wip])
    CREATE INDEX IF NOT EXISTS idx_note_attrs_tag_key_val 
      ON note_attributes(user_id, tag_name, attr_key, attr_value, tag_instance_id, note_id);

    -- Index 2: Wildcard attribute queries (e.g. @*[color=red], @*[status=wip])
    CREATE INDEX IF NOT EXISTS idx_note_attrs_wildcard 
      ON note_attributes(user_id, attr_key, attr_value, note_id);

    -- Index 3: Numerical range queries (e.g. @todo[priority <= 2])
    CREATE INDEX IF NOT EXISTS idx_note_attrs_range 
      ON note_attributes(user_id, tag_name, attr_key, num_value, note_id);

    -- Index 4: Relational Graph & Backlink lookup (e.g. @wait[ref=note_123])
    CREATE INDEX IF NOT EXISTS idx_note_attrs_relations 
      ON note_attributes(user_id, attr_value, note_id) 
      WHERE is_relation = 1;
  `);

  // 3. Seed Default Tag Definitions for all existing users (and guest)
  const userRows = db.prepare(`
    SELECT DISTINCT user_id FROM notes WHERE user_id IS NOT NULL
    UNION
    SELECT id AS user_id FROM users
  `).all();

  const userIds = new Set(userRows.map((r) => r.user_id));
  userIds.add('__guest__');

  const insertDefStmt = db.prepare(`
    INSERT OR IGNORE INTO user_tag_definitions (
      id, user_id, tag_name, color, notable, gutter_priority, is_core, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  for (const uid of userIds) {
    for (const proto of Object.values(CORE_TAG_PROTOTYPES)) {
      insertDefStmt.run(
        `${uid}_${proto.tag}`,
        uid,
        proto.tag,
        proto.color,
        proto.notable ? 1 : 0,
        proto.gutterPriority,
        proto.isCore ? 1 : 0,
        now,
        now
      );
    }
  }

  // 4. One-Time Historical Backfill: Process all existing notes
  const notes = db.prepare('SELECT id, user_id, content, is_struck, created_at FROM notes').all();
  const insertAttrStmt = db.prepare(`
    INSERT OR REPLACE INTO note_attributes (
      id, user_id, note_id, tag_instance_id, tag_name, attr_key, attr_value, num_value, is_relation, is_default, created_at
    ) VALUES (
      @id, @user_id, @note_id, @tag_instance_id, @tag_name, @attr_key, @attr_value, @num_value, @is_relation, @is_default, @created_at
    )
  `);

  const protoCache = new Map();
  for (const n of notes) {
    const userId = n.user_id || '__guest__';
    const createdAt = n.created_at || now;
    if (!protoCache.has(userId)) {
      protoCache.set(userId, getUserTagDefinitions(db, userId));
    }
    const userPrototypes = protoCache.get(userId);
    const rows = extractNoteAttributeRows(userId, n.id, n.content, n.is_struck === 1, createdAt, userPrototypes);

    for (const r of rows) {
      insertAttrStmt.run(r);
    }
  }

  // 5. Update metadata schema_version to 10
  const hasMeta = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get()
  );
  if (hasMeta) {
    db.prepare(`
      INSERT INTO metadata (key, value) VALUES ('schema_version', '10')
      ON CONFLICT(key) DO UPDATE SET value = '10'
    `).run();
  }
}

export function down(db) {
  // 1. Drop note_attributes and indexes
  db.exec(`
    DROP INDEX IF EXISTS idx_note_attrs_relations;
    DROP INDEX IF EXISTS idx_note_attrs_range;
    DROP INDEX IF EXISTS idx_note_attrs_wildcard;
    DROP INDEX IF EXISTS idx_note_attrs_tag_key_val;
    DROP TABLE IF EXISTS note_attributes;
  `);

  // 2. Drop user_tag_definitions and indexes
  db.exec(`
    DROP INDEX IF EXISTS idx_user_tag_defs_user;
    DROP TABLE IF EXISTS user_tag_definitions;
  `);

  // 3. Revert schema_version metadata to 9
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
