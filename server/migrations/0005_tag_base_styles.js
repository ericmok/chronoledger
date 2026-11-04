/**
 * Migration 0005: Tag Base Styles (Root Tag Styling & Motion)
 *
 * 1. Adds `base_style` JSON column to `user_tag_definitions` for root tag styling
 *    (colorStyle solid/wash, bold, italic, dim, animatedStyle bounce).
 * 2. Seeds initial base_style for @important ({ bold: true }) and @skipped ({ dim: true }).
 * 3. Updates schema_version metadata to 12.
 */

export const schemaVersion = 12;

export function up(db) {
  // 1. Add base_style column if not present
  const colInfo = db.prepare('PRAGMA table_info(user_tag_definitions)').all();
  const hasBaseStyle = colInfo.some((c) => c.name === 'base_style');
  if (!hasBaseStyle) {
    db.exec(`ALTER TABLE user_tag_definitions ADD COLUMN base_style TEXT NOT NULL DEFAULT '{}';`);
  }

  // 2. Seed initial base styles for core tags
  db.prepare(`
    UPDATE user_tag_definitions
    SET base_style = '{"bold":true}'
    WHERE tag_name = 'important' AND (base_style = '{}' OR base_style IS NULL)
  `).run();

  db.prepare(`
    UPDATE user_tag_definitions
    SET base_style = '{"dim":true}'
    WHERE tag_name = 'skipped' AND (base_style = '{}' OR base_style IS NULL)
  `).run();

  // 3. Update schema_version metadata
  const hasMeta = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata'").get()
  );
  if (hasMeta) {
    db.prepare(`
      INSERT INTO metadata (key, value) VALUES ('schema_version', '12')
      ON CONFLICT(key) DO UPDATE SET value = '12'
    `).run();
  }
}

export function down(db) {
  // 1. Check if column exists, remove by dropping column
  const colInfo = db.prepare('PRAGMA table_info(user_tag_definitions)').all();
  const hasBaseStyle = colInfo.some((c) => c.name === 'base_style');

  if (hasBaseStyle) {
    try {
      db.exec('ALTER TABLE user_tag_definitions DROP COLUMN base_style;');
    } catch {
      // Ignore if older engine cannot drop column directly
    }
  }

  // 2. Revert metadata to 11
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
