import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../server/migrations/runner.js';
import * as migration0006 from '../server/migrations/0006_add_link_tag_prototype.js';
import { CANONICAL_COLORS, CANONICAL_COLOR_LIST } from '../src/utils/canonicalColors.ts';
import { CORE_TAG_PROTOTYPES } from '../src/utils/tagPrototypes.ts';
import { ANNOTATION_CONFIGS, parseNoteContent } from '../src/utils/annotationUtils.ts';
import { cycleTagStatus } from '../src/utils/tagParser.ts';
import { matchesSelector } from '../src/utils/selectorMatcher.ts';

test('Canonical Colors: Hyperlink Blue is registered with high contrast', () => {
  const color = CANONICAL_COLORS.hyperlinkBlue;
  assert.ok(color, 'hyperlinkBlue should be defined in CANONICAL_COLORS');
  assert.equal(color.solid, '#1D4ED8');
  assert.equal(color.wash, '#DBEAFE');

  const inList = CANONICAL_COLOR_LIST.some((c) => c.id === 'hyperlinkBlue');
  assert.ok(inList, 'hyperlinkBlue should be included in CANONICAL_COLOR_LIST');
});

test('Tag Prototypes & Annotations: link tag is registered as core prototype', () => {
  const proto = CORE_TAG_PROTOTYPES.link;
  assert.ok(proto, 'link prototype should exist');
  assert.equal(proto.tag, 'link');
  assert.equal(proto.color, '#1D4ED8');
  assert.equal(proto.notable, false);
  assert.equal(proto.gutterPriority, 10);
  assert.equal(proto.isCore, true);

  const config = ANNOTATION_CONFIGS.link;
  assert.ok(config, 'link config should exist in ANNOTATION_CONFIGS');
  assert.equal(config.type, 'link');
  assert.equal(config.primaryTag, 'link');
  assert.ok(config.aliases.includes('url'));
  assert.ok(config.aliases.includes('href'));
});

test('Migration 0006: Reversible up() and down() lifecycle', () => {
  const db = new DatabaseSync(':memory:');

  // Run all migrations up through 0006
  runMigrations(db);

  const versionRow = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
  assert.equal(versionRow.value, '13');

  // Verify link definition exists in user_tag_definitions for guest
  const guestLink = db.prepare(
    "SELECT * FROM user_tag_definitions WHERE user_id = '__guest__' AND tag_name = 'link'"
  ).get();
  assert.ok(guestLink, 'Guest should have link tag definition');
  assert.equal(guestLink.color, '#1D4ED8');
  assert.equal(guestLink.notable, 0);
  assert.equal(guestLink.is_core, 1);

  // Test rollback
  migration0006.down(db);
  const vDown = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
  assert.equal(vDown.value, '12');

  const guestLinkAfterDown = db.prepare(
    "SELECT * FROM user_tag_definitions WHERE user_id = '__guest__' AND tag_name = 'link' AND is_core = 1"
  ).get();
  assert.equal(guestLinkAfterDown, undefined);

  // Re-apply up()
  migration0006.up(db);
  const vUpAgain = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
  assert.equal(vUpAgain.value, '13');
});

test('Tag Lifecycle: Non-status bracket tags toggle strikethrough, status tags cycle', () => {
  // 1. @link[web] should toggle strikethrough on click (read/unread)
  const linkNote = '@link[web] https://example.com';
  const resolvedLink = cycleTagStatus(linkNote, '@link[web]');
  assert.equal(resolvedLink, '~~@link[web]~~ https://example.com');

  const unreadLink = cycleTagStatus(resolvedLink, '~~@link[web]~~');
  assert.equal(unreadLink, '@link[web] https://example.com');

  // 2. @todo[backend] should cycle status (open -> wip -> done -> open)
  const todoNote = '@todo[backend] Fix memory leak';
  const wipTodo = cycleTagStatus(todoNote, '@todo[backend]');
  assert.equal(wipTodo, '@todo[backend, status=wip] Fix memory leak');

  const doneTodo = cycleTagStatus(wipTodo, '@todo[backend, status=wip]');
  assert.equal(doneTodo, '@todo[backend, status=done] Fix memory leak');

  const resetTodo = cycleTagStatus(doneTodo, '@todo[backend, status=done]');
  assert.equal(resetTodo, '@todo[backend] Fix memory leak');
});

test('Tag Parser & Annotation Utils: parses positional attributes for link', () => {
  const content = '@link[web] https://react.dev — React 19 notes';
  const result = parseNoteContent(content);

  assert.equal(result.annotations.length, 1);
  const ann = result.annotations[0];
  assert.equal(ann.tag, 'link');
  assert.equal(ann.type, 'link');
  assert.deepEqual(ann.positionalValues, ['web']);
  assert.equal(ann.color, '#1D4ED8');
});

test('Selector Matcher: Matches @link, @link[web], @link[reddit], and negations', () => {
  const webNote = '@link[web] https://react.dev — React release notes';
  const redditNote = '@link[reddit] https://reddit.com/r/webdev — Discussion';

  assert.equal(matchesSelector(webNote, false, '@link'), true);
  assert.equal(matchesSelector(webNote, false, '@link[web]'), true);
  assert.equal(matchesSelector(webNote, false, '@link[reddit]'), false);
  assert.equal(matchesSelector(webNote, false, '!@link[reddit]'), true);

  assert.equal(matchesSelector(redditNote, false, '@link'), true);
  assert.equal(matchesSelector(redditNote, false, '@link[reddit]'), true);
  assert.equal(matchesSelector(redditNote, false, '@link[web]'), false);
  assert.equal(matchesSelector(redditNote, false, '!@link[web]'), true);
});
