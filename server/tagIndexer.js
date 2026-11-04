/**
 * Server-Side Tag & Attribute Indexing Engine
 *
 * Extracts structured attributes from note content using the tag AST parser,
 * resolves prototype defaults vs instance overrides, and writes normalized
 * rows into the `note_attributes` sidecar table.
 */

import { parseTagTokens } from '../src/utils/tagParser.ts';
import { CORE_TAG_PROTOTYPES } from '../src/utils/tagPrototypes.ts';

/**
 * Retrieves a map of user tag definitions from SQLite, falling back to CORE_TAG_PROTOTYPES.
 */
export function getUserTagDefinitions(db, userId) {
  const map = new Map();

  // Populate core defaults first
  for (const [tag, proto] of Object.entries(CORE_TAG_PROTOTYPES)) {
    map.set(tag.toLowerCase(), {
      tag: proto.tag,
      color: proto.color,
      notable: proto.notable ? 1 : 0,
      gutterPriority: proto.gutterPriority,
      isCore: proto.isCore ? 1 : 0,
      defaultStatus: proto.defaultStatus,
    });
  }

  if (!db || !userId) return map;

  try {
    const rows = db.prepare(`
      SELECT tag_name, color, notable, gutter_priority, is_core
      FROM user_tag_definitions
      WHERE user_id = ?
    `).all(userId);

    for (const r of rows) {
      const existing = map.get(r.tag_name.toLowerCase());
      map.set(r.tag_name.toLowerCase(), {
        tag: r.tag_name,
        color: r.color,
        notable: r.notable,
        gutterPriority: r.gutter_priority,
        isCore: r.is_core,
        defaultStatus: existing?.defaultStatus,
      });
    }
  } catch {
    // If table doesn't exist yet (e.g. before migration 0003), ignore and use core prototypes
  }

  return map;
}

/**
 * Extracts normalized sidecar rows for a note from its Markdown content.
 */
export function extractNoteAttributeRows(userId, noteId, content, isStruck, createdAt, userPrototypes = null) {
  if (!content) return [];

  const effectiveUserId = userId || '__guest__';
  const effectiveCreatedAt = createdAt || new Date().toISOString();
  const tokens = parseTagTokens(content, Boolean(isStruck));
  const rows = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const instanceId = token.instanceId || `ti_${i}_${token.tag}`;
    const proto = (userPrototypes && userPrototypes.get(token.tag)) ||
      CORE_TAG_PROTOTYPES[token.tag] ||
      CORE_TAG_PROTOTYPES.custom;

    // 1. Base Tag Marker: allows instant lookup of `@todo` or `@project`
    rows.push({
      id: `${noteId}_${instanceId}_base`,
      user_id: effectiveUserId,
      note_id: noteId,
      tag_instance_id: instanceId,
      tag_name: token.tag,
      attr_key: '__tag__',
      attr_value: token.tag,
      num_value: null,
      is_relation: 0,
      is_default: 0,
      created_at: effectiveCreatedAt,
    });

    // 2. Positional multi-values (e.g. @project[buildings, portfolio])
    for (const val of token.positionalValues || []) {
      const numVal = !isNaN(Number(val)) && val.trim() !== '' ? Number(val) : null;
      rows.push({
        id: `${noteId}_${instanceId}_val_${val}`,
        user_id: effectiveUserId,
        note_id: noteId,
        tag_instance_id: instanceId,
        tag_name: token.tag,
        attr_key: '__val__',
        attr_value: val,
        num_value: numVal,
        is_relation: 0,
        is_default: 0,
        created_at: effectiveCreatedAt,
      });
    }

    // 3. Merged attributes: Prototype Defaults + Token Overrides
    const protoNotableStr = (proto.notable === 1 || proto.notable === true) ? 'true' : 'false';
    const defaults = {
      color: proto.color,
      notable: protoNotableStr,
      priority: proto.gutterPriority,
    };
    if (proto.defaultStatus) {
      defaults.status = proto.defaultStatus;
    }

    const merged = {
      ...defaults,
      ...token.attributes,
    };

    // If resolved, ensure status reflects done if not explicitly dropped/migrated
    if (token.isResolved && !token.attributes.status) {
      merged.status = 'done';
    }

    for (const [key, value] of Object.entries(merged)) {
      const isOverride = Object.prototype.hasOwnProperty.call(token.attributes, key);
      const isRel = ['ref', 'target', 'by', 'blocker', 'link'].includes(key.toLowerCase());
      const strVal = String(value);
      const numVal = typeof value === 'number'
        ? value
        : (!isNaN(Number(value)) && typeof value !== 'boolean' && strVal.trim() !== '' ? Number(value) : null);

      rows.push({
        id: `${noteId}_${instanceId}_${key}`,
        user_id: effectiveUserId,
        note_id: noteId,
        tag_instance_id: instanceId,
        tag_name: token.tag,
        attr_key: key,
        attr_value: strVal,
        num_value: numVal,
        is_relation: isRel ? 1 : 0,
        is_default: isOverride ? 0 : 1,
        created_at: effectiveCreatedAt,
      });
    }
  }

  return rows;
}

/**
 * Re-indexes all attributes for a given note in SQLite within an existing transaction.
 */
export function reindexNoteAttributes(db, userId, noteId, content, isStruck, createdAt) {
  const effectiveUserId = userId || '__guest__';

  // 1. Delete existing rows for this note
  db.prepare(`
    DELETE FROM note_attributes 
    WHERE note_id = ? AND user_id = ?
  `).run(noteId, effectiveUserId);

  if (!content) return;

  // 2. Extract new attribute rows
  const userPrototypes = getUserTagDefinitions(db, effectiveUserId);
  const rows = extractNoteAttributeRows(effectiveUserId, noteId, content, isStruck, createdAt, userPrototypes);
  if (rows.length === 0) return;

  // 3. Batch insert
  const insertStmt = db.prepare(`
    INSERT INTO note_attributes (
      id, user_id, note_id, tag_instance_id, tag_name, attr_key, attr_value, num_value, is_relation, is_default, created_at
    ) VALUES (
      @id, @user_id, @note_id, @tag_instance_id, @tag_name, @attr_key, @attr_value, @num_value, @is_relation, @is_default, @created_at
    )
  `);

  for (const row of rows) {
    insertStmt.run(row);
  }
}
