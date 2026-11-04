/**
 * Migration 0004: Tag Attribute Style Rules & Motion
 *
 * 1. Adds `style_rules` JSON column to `user_tag_definitions`.
 * 2. Seeds standard default attribute rules for core stationery tags:
 *    - @todo[status=wip]: Amber wash, italic
 *    - @todo[status=done]: Slate wash, dim, strikethrough
 *    - @todo[priority=high]: Crimson solid pill, bold, subtle bounce
 *    - @todo[priority=low]: Sky blue wash
 *    - @important[priority=high]: Crimson solid pill, bold, subtle bounce
 * 3. Updates schema_version metadata to 11.
 */

export const schemaVersion = 11;

export const DEFAULT_TODO_RULES = [
  {
    id: 'todo_rule_wip',
    attrKey: 'status',
    attrValue: 'wip',
    color: '#F5AC6C',
    colorStyle: 'dark_on_light',
    italic: true,
    animatedStyle: 'none',
  },
  {
    id: 'todo_rule_done',
    attrKey: 'status',
    attrValue: 'done',
    color: '#6F7880',
    colorStyle: 'dark_on_light',
    dim: true,
    strikethrough: true,
    animatedStyle: 'none',
  },
  {
    id: 'todo_rule_high',
    attrKey: 'priority',
    attrValue: 'high',
    color: '#F47290',
    colorStyle: 'light_on_dark',
    bold: true,
    animatedStyle: 'bounce',
  },
  {
    id: 'todo_rule_low',
    attrKey: 'priority',
    attrValue: 'low',
    color: '#4FA3F2',
    colorStyle: 'dark_on_light',
    animatedStyle: 'none',
  },
];

export const DEFAULT_IMPORTANT_RULES = [
  {
    id: 'important_rule_high',
    attrKey: 'priority',
    attrValue: 'high',
    color: '#F47290',
    colorStyle: 'light_on_dark',
    bold: true,
    animatedStyle: 'bounce',
  },
  {
    id: 'important_rule_urgent',
    attrKey: 'priority',
    attrValue: 'urgent',
    color: '#F47290',
    colorStyle: 'light_on_dark',
    bold: true,
    animatedStyle: 'bounce',
  },
];

export function up(db) {
  // 1. Add style_rules column if not present
  const colInfo = db.prepare('PRAGMA table_info(user_tag_definitions)').all();
  const hasStyleRules = colInfo.some((c) => c.name === 'style_rules');
  if (!hasStyleRules) {
    db.exec(`ALTER TABLE user_tag_definitions ADD COLUMN style_rules TEXT NOT NULL DEFAULT '[]';`);
  }

  // 2. Seed default rules for existing @todo and @important definitions
  const todoJson = JSON.stringify(DEFAULT_TODO_RULES);
  db.prepare(`
    UPDATE user_tag_definitions
    SET style_rules = ?
    WHERE tag_name = 'todo' AND (style_rules = '[]' OR style_rules IS NULL)
  `).run(todoJson);

  const importantJson = JSON.stringify(DEFAULT_IMPORTANT_RULES);
  db.prepare(`
    UPDATE user_tag_definitions
    SET style_rules = ?
    WHERE tag_name = 'important' AND (style_rules = '[]' OR style_rules IS NULL)
  `).run(importantJson);

  // 3. Update schema_version metadata
  const hasMeta = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get()
  );
  if (hasMeta) {
    db.prepare(`
      INSERT INTO metadata (key, value) VALUES ('schema_version', '11')
      ON CONFLICT(key) DO UPDATE SET value = '11'
    `).run();
  }
}

export function down(db) {
  // 1. Check if column exists, remove by recreating table or dropping column
  const colInfo = db.prepare('PRAGMA table_info(user_tag_definitions)').all();
  const hasStyleRules = colInfo.some((c) => c.name === 'style_rules');

  if (hasStyleRules) {
    try {
      db.exec('ALTER TABLE user_tag_definitions DROP COLUMN style_rules;');
    } catch {
      // Fallback table recreation for older engines
      db.exec(`
        CREATE TABLE user_tag_definitions_backup (
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

        INSERT INTO user_tag_definitions_backup 
          SELECT id, user_id, tag_name, color, notable, gutter_priority, is_core, created_at, updated_at
          FROM user_tag_definitions;

        DROP TABLE user_tag_definitions;
        ALTER TABLE user_tag_definitions_backup RENAME TO user_tag_definitions;
        CREATE INDEX IF NOT EXISTS idx_user_tag_defs_user ON user_tag_definitions(user_id, tag_name);
      `);
    }
  }

  // 2. Revert metadata
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
