import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import * as migration0001 from '../server/migrations/0001_baseline_v8.js';
import * as migration0002 from '../server/migrations/0002_auth_and_multitenant_hardening.js';
import * as migration0003 from '../server/migrations/0003_note_attributes_and_tags.js';
import * as migration0004 from '../server/migrations/0004_tag_attribute_styles.js';
import { runMigrations } from '../server/migrations/runner.js';
import { getUserTagDefinitions } from '../server/tagIndexer.js';
import { parseTagTokens } from '../src/utils/tagParser.ts';
import {
  matchesAttributeRule,
  resolveTagStyle,
} from '../src/utils/tagStyleResolver.ts';
import {
  parseColorToHex,
  hexToHsv,
  hsvToHex,
} from '../src/utils/annotationUtils.ts';

describe('Tag Attribute Styles & Motion (Phase 4 Extension)', () => {
  let db;

  beforeEach(() => {
    db = new DatabaseSync(':memory:');
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  test('Migration 0004 & 0005: Adds style_rules and base_style columns and seeds default rules', () => {
    // Check metadata version
    const meta = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
    assert.equal(meta.value, '12');

    // Verify table structure
    const colInfo = db.prepare('PRAGMA table_info(user_tag_definitions)').all();
    const hasStyleRules = colInfo.some((c) => c.name === 'style_rules');
    assert.equal(hasStyleRules, true);

    // Verify seeded rules for guest or existing users
    const todoRow = db
      .prepare("SELECT style_rules FROM user_tag_definitions WHERE tag_name = 'todo' LIMIT 1")
      .get();
    assert.ok(todoRow, 'Todo tag definition should exist');
    const todoRules = JSON.parse(todoRow.style_rules);
    assert.ok(Array.isArray(todoRules), 'Todo style_rules should be an array');
    assert.ok(todoRules.some((r) => r.attrValue === 'wip'));
    assert.ok(todoRules.some((r) => r.attrValue === 'high' && r.animatedStyle === 'bounce'));

    const importantRow = db
      .prepare("SELECT style_rules FROM user_tag_definitions WHERE tag_name = 'important' LIMIT 1")
      .get();
    assert.ok(importantRow, 'Important tag definition should exist');
    const importantRules = JSON.parse(importantRow.style_rules);
    assert.ok(importantRules.some((r) => r.attrValue === 'high' && r.animatedStyle === 'bounce'));
  });

  test('Migration 0004: Reversible up() and down() lifecycle', () => {
    // Revert migration 0004
    migration0004.down(db);

    const metaReverted = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
    assert.equal(metaReverted.value, '10');

    // Run up() again
    migration0004.up(db);
    const metaRestored = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
    assert.equal(metaRestored.value, '11');
  });

  test('Style Resolver: Exact Key-Value matching (e.g. priority=high and priority=low)', () => {
    const tokensHigh = parseTagTokens('@todo[priority=high]', false);
    assert.equal(tokensHigh.length, 1);

    const styleHigh = resolveTagStyle('todo', tokensHigh[0], null, false);
    assert.equal(styleHigh.color.toLowerCase(), '#f47290'); // Crimson
    assert.equal(styleHigh.isBold, true);
    assert.equal(styleHigh.animatedStyle, 'bounce');

    const tokensLow = parseTagTokens('@todo[priority=low]', false);
    assert.equal(tokensLow.length, 1);

    const styleLow = resolveTagStyle('todo', tokensLow[0], null, false);
    assert.equal(styleLow.color.toLowerCase(), '#4fa3f2'); // Sky blue
    assert.equal(styleLow.animatedStyle, 'none');
  });

  test('Style Resolver: Positional shorthand matching (e.g. @todo[wip] and @todo[done])', () => {
    const tokensWip = parseTagTokens('@todo[wip]', false);
    assert.equal(tokensWip.length, 1);

    const styleWip = resolveTagStyle('todo', tokensWip[0], null, false);
    assert.equal(styleWip.color.toLowerCase(), '#f5ac6c'); // Amber
    assert.equal(styleWip.isItalic, true);

    const tokensDone = parseTagTokens('@todo[done]', false);
    assert.equal(tokensDone.length, 1);

    const styleDone = resolveTagStyle('todo', tokensDone[0], null, false);
    assert.equal(styleDone.color.toLowerCase(), '#6f7880'); // Slate
    assert.equal(styleDone.isDim, true);
    assert.equal(styleDone.isStrikethrough, true);
  });

  test('Style Resolver: Resolved/struck notes disable bounce animation and apply strikethrough', () => {
    const tokensHigh = parseTagTokens('~~@todo[priority=high]~~', false);
    assert.equal(tokensHigh.length, 1);

    // Tag itself is resolved via strikethrough
    const styleHighStruck = resolveTagStyle('todo', tokensHigh[0], null, true);
    assert.equal(styleHighStruck.animatedStyle, 'none', 'Struck note must disable bounce');
    assert.equal(styleHighStruck.isStrikethrough, true);
    assert.equal(styleHighStruck.isDim, true);
  });

  test('getUserTagDefinitions: Loads style_rules from SQLite seamlessly', () => {
    const defs = getUserTagDefinitions(db, '__guest__');
    const todoDef = defs.get('todo');
    assert.ok(todoDef);
    assert.ok(Array.isArray(todoDef.styleRules));
    assert.ok(todoDef.styleRules.length >= 4);

    const wipRule = todoDef.styleRules.find((r) => r.attrValue === 'wip');
    assert.ok(wipRule);
    assert.equal(wipRule.colorStyle, 'dark_on_light');
  });

  test('Migration 0005: Adds base_style column and seeds @important and @skipped', () => {
    const meta = db.prepare("SELECT value FROM metadata WHERE key='schema_version'").get();
    assert.equal(meta.value, '12');

    const colInfo = db.prepare('PRAGMA table_info(user_tag_definitions)').all();
    assert.equal(colInfo.some((c) => c.name === 'base_style'), true);

    const importantRow = db.prepare("SELECT base_style FROM user_tag_definitions WHERE tag_name = 'important' LIMIT 1").get();
    assert.ok(importantRow);
    const parsed = JSON.parse(importantRow.base_style);
    assert.equal(parsed.bold, true);
  });

  test('Base Tag Styling: Inherited by plain tag and overridden by attribute rules', () => {
    // 1. Plain tag without attributes uses baseStyle
    const customDef = {
      tag: 'urgent',
      color: '#F47290',
      notable: 1,
      gutterPriority: 1,
      isCore: 0,
      baseStyle: {
        bold: true,
        animatedStyle: 'bounce',
        colorStyle: 'light_on_dark',
      },
      styleRules: [
        {
          id: 'rule_quiet',
          attrKey: 'mode',
          attrValue: 'quiet',
          color: '#4FA3F2',
          animatedStyle: 'none',
          colorStyle: 'dark_on_light',
        },
      ],
    };

    const tokensPlain = parseTagTokens('@urgent', false);
    const stylePlain = resolveTagStyle('urgent', tokensPlain[0], customDef, false);
    assert.equal(stylePlain.isBold, true);
    assert.equal(stylePlain.animatedStyle, 'bounce');
    assert.equal(stylePlain.color.toLowerCase(), '#f47290');

    // 2. Attribute rule overrides baseStyle
    const tokensQuiet = parseTagTokens('@urgent[mode=quiet]', false);
    const styleQuiet = resolveTagStyle('urgent', tokensQuiet[0], customDef, false);
    assert.equal(styleQuiet.animatedStyle, 'none');
    assert.equal(styleQuiet.color.toLowerCase(), '#4fa3f2');
  });

  test('parseColorToHex: parses 3/6-digit hex, HSL, RGB, and rejects invalid colors', () => {
    // 6-digit Hex with and without #
    assert.equal(parseColorToHex('#3B82F6'), '#3B82F6');
    assert.equal(parseColorToHex('3b82f6'), '#3B82F6');
    assert.equal(parseColorToHex('#D23B38'), '#D23B38');

    // 3-digit Hex
    assert.equal(parseColorToHex('#fff'), '#FFFFFF');
    assert.equal(parseColorToHex('000'), '#000000');
    assert.equal(parseColorToHex('#abc'), '#AABBCC');

    // HSL with commas and spaces
    assert.equal(parseColorToHex('hsl(210, 80%, 60%)'), '#4799EB');
    assert.equal(parseColorToHex('hsl(210 80% 60%)'), '#4799EB');
    assert.equal(parseColorToHex('hsla(0, 100%, 50%, 0.5)'), '#FF0000');

    // RGB with commas and spaces
    assert.equal(parseColorToHex('rgb(59, 130, 246)'), '#3B82F6');
    assert.equal(parseColorToHex('rgba(255, 0, 0, 1)'), '#FF0000');
    assert.equal(parseColorToHex('rgb(0 0 0)'), '#000000');

    // Invalid formats
    assert.equal(parseColorToHex(''), null);
    assert.equal(parseColorToHex('not-a-color'), null);
    assert.equal(parseColorToHex('#12345'), null);
    assert.equal(parseColorToHex('#1234567'), null);
    assert.equal(parseColorToHex(null), null);
    assert.equal(parseColorToHex(undefined), null);
  });

  test('HSV conversions: hexToHsv and hsvToHex roundtrip with pure and mixed hues', () => {
    // Pure red
    const redHsv = hexToHsv('#FF0000');
    assert.equal(redHsv.h, 0);
    assert.equal(redHsv.s, 1);
    assert.equal(redHsv.v, 1);
    assert.equal(hsvToHex(0, 1, 1), '#FF0000');

    // Pure green
    const greenHsv = hexToHsv('#00FF00');
    assert.equal(greenHsv.h, 120);
    assert.equal(hsvToHex(120, 1, 1), '#00FF00');

    // Pure blue
    const blueHsv = hexToHsv('#0000FF');
    assert.equal(blueHsv.h, 240);
    assert.equal(hsvToHex(240, 1, 1), '#0000FF');

    // ChronoLedger blue: #3B82F6
    const clBlue = hexToHsv('#3B82F6');
    assert.equal(clBlue.h, 217);
    const roundtrip = hsvToHex(clBlue.h, clBlue.s, clBlue.v);
    assert.equal(roundtrip, '#3B83F6'); // 1-bit quantization tolerance
  });
});
