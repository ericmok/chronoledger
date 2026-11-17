/**
 * Migration 0006: Seed @link Stationery Tag Prototype
 *
 * 1. Seeds the @link stationery prototype into `user_tag_definitions` for all
 *    existing users and __guest__ (if not already present):
 *    - color: #1D4ED8 (Hyperlink Blue)
 *    - notable: 0
 *    - gutter_priority: 10
 *    - is_core: 1
 *    - base_style: '{"colorStyle":"light_on_dark","animatedStyle":"none"}'
 *    - style_rules: '[]'
 * 2. Updates schema_version metadata to 13.
 */

export const schemaVersion = 13;

export function up(db) {
  const hasTable = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_tag_definitions'").get()
  );
  if (!hasTable) return;

  const colInfo = db.prepare('PRAGMA table_info(user_tag_definitions)').all();
  const hasStyleRules = colInfo.some((c) => c.name === 'style_rules');
  const hasBaseStyle = colInfo.some((c) => c.name === 'base_style');

  // Find all distinct users
  const userRows = db.prepare(`
    SELECT DISTINCT user_id FROM notes WHERE user_id IS NOT NULL
    UNION
    SELECT id AS user_id FROM users
    UNION
    SELECT DISTINCT user_id FROM user_tag_definitions WHERE user_id IS NOT NULL
  `).all();

  const userIds = new Set(userRows.map((r) => r.user_id));
  userIds.add('__guest__');

  const now = new Date().toISOString();

  for (const uid of userIds) {
    const existing = db.prepare(
      'SELECT id FROM user_tag_definitions WHERE user_id = ? AND tag_name = ?'
    ).get(uid, 'link');

    if (!existing) {
      if (hasStyleRules && hasBaseStyle) {
        db.prepare(`
          INSERT INTO user_tag_definitions (
            id, user_id, tag_name, color, notable, gutter_priority, is_core, style_rules, base_style, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `${uid}_link`,
          uid,
          'link',
          '#1D4ED8',
          0,
          10,
          1,
          '[]',
          '{"colorStyle":"light_on_dark","animatedStyle":"none"}',
          now,
          now
        );
      } else if (hasStyleRules) {
        db.prepare(`
          INSERT INTO user_tag_definitions (
            id, user_id, tag_name, color, notable, gutter_priority, is_core, style_rules, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `${uid}_link`,
          uid,
          'link',
          '#1D4ED8',
          0,
          10,
          1,
          '[]',
          now,
          now
        );
      } else {
        db.prepare(`
          INSERT INTO user_tag_definitions (
            id, user_id, tag_name, color, notable, gutter_priority, is_core, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `${uid}_link`,
          uid,
          'link',
          '#1D4ED8',
          0,
          10,
          1,
          now,
          now
        );
      }
    }
  }

  // Update schema_version metadata
  const hasMeta = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get()
  );
  if (hasMeta) {
    db.prepare(`
      INSERT INTO metadata (key, value) VALUES ('schema_version', '13')
      ON CONFLICT(key) DO UPDATE SET value = '13'
    `).run();
  }
}

export function down(db) {
  const hasTable = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='user_tag_definitions'").get()
  );
  if (hasTable) {
    db.prepare("DELETE FROM user_tag_definitions WHERE tag_name = 'link' AND is_core = 1").run();
  }

  // Revert metadata to 12
  const hasMeta = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get()
  );
  if (hasMeta) {
    db.prepare(`
      UPDATE metadata SET value = '12' WHERE key = 'schema_version'
    `).run();
  }
}
