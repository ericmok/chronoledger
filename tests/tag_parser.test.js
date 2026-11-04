import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTagTokens, parseBracketAttributes, resolveTokenWithPrototype } from '../src/utils/tagParser.ts';
import { parseNoteContent, splitNoteAnchorAndBody } from '../src/utils/annotationUtils.ts';
import { CORE_TAG_PROTOTYPES, getTagPrototype } from '../src/utils/tagPrototypes.ts';

test('Tag Parser: Baseline Scalar Tags', () => {
  const tokens = parseTagTokens('Meeting @todo and @important');
  assert.equal(tokens.length, 2);

  assert.equal(tokens[0].tag, 'todo');
  assert.equal(tokens[0].raw, '@todo');
  assert.equal(tokens[0].isResolved, false);
  assert.equal(tokens[0].isEscaped, false);

  assert.equal(tokens[1].tag, 'important');
  assert.equal(tokens[1].raw, '@important');

  // Strikethrough resolution
  const resolvedTokens = parseTagTokens('Finished task ~~@todo~~');
  assert.equal(resolvedTokens.length, 1);
  assert.equal(resolvedTokens[0].tag, 'todo');
  assert.equal(resolvedTokens[0].isResolved, true);

  // Time tags
  const timeTokens = parseTagTokens('Appointment @4:00pm');
  assert.equal(timeTokens.length, 1);
  assert.equal(timeTokens[0].tag, '4:00pm');
  assert.equal(timeTokens[0].tagBody, '4:00pm');
});

test('Tag Parser: Bracket Attributes & Key-Values', () => {
  const tokens = parseTagTokens('@todo[status=wip, priority=1, color="#FFAA00"]');
  assert.equal(tokens.length, 1);
  const t = tokens[0];

  assert.equal(t.tag, 'todo');
  assert.equal(t.attributes.status, 'wip');
  assert.equal(t.attributes.priority, 1);
  assert.equal(t.attributes.color, '#FFAA00');
  assert.equal(typeof t.attributes.priority, 'number');
});

test('Tag Parser: Positional Lists & Sets', () => {
  const tokens = parseTagTokens('@project[buildings, portfolio]');
  assert.equal(tokens.length, 1);
  const t = tokens[0];

  assert.equal(t.tag, 'project');
  assert.deepEqual(t.positionalValues, ['buildings', 'portfolio']);
  assert.equal(t.attributes.buildings, true);
  assert.equal(t.attributes.portfolio, true);
});

test('Tag Parser: Boolean Flags', () => {
  const tokens = parseTagTokens('@task[urgent, backend, blocking]');
  assert.equal(tokens.length, 1);
  const t = tokens[0];

  assert.equal(t.attributes.urgent, true);
  assert.equal(t.attributes.backend, true);
  assert.equal(t.attributes.blocking, true);
});

test('Tag Parser: Relations & Note References', () => {
  const tokens = parseTagTokens('@wait[ref=note_992, blocker=task_104]');
  assert.equal(tokens.length, 1);
  const t = tokens[0];

  assert.equal(t.attributes.ref, 'note_992');
  assert.equal(t.relations.length, 2);
  assert.deepEqual(t.relations[0], { key: 'ref', targetNoteId: 'note_992' });
  assert.deepEqual(t.relations[1], { key: 'blocker', targetNoteId: 'task_104' });
});

test('Tag Parser (Adversarial): Category A - Malformed & Pathological Brackets', () => {
  // 1. Unclosed bracket: should gracefully parse as scalar tag without dropping prose
  const unclosed = parseTagTokens('@todo[urgent and working');
  assert.equal(unclosed.length, 1);
  assert.equal(unclosed[0].tag, 'todo');
  assert.equal(unclosed[0].raw, '@todo');
  assert.deepEqual(unclosed[0].positionalValues, []);

  // 2. Empty & whitespace brackets
  const empty = parseTagTokens('@todo[] and @task[   ]');
  assert.equal(empty.length, 2);
  assert.equal(empty[0].tag, 'todo');
  assert.deepEqual(empty[0].attributes, {});
  assert.equal(empty[1].tag, 'task');
  assert.deepEqual(empty[1].attributes, {});

  // 3. Trailing and redundant commas
  const redundantCommas = parseTagTokens('@task[,urgent,,backend,]');
  assert.equal(redundantCommas.length, 1);
  assert.equal(redundantCommas[0].attributes.urgent, true);
  assert.equal(redundantCommas[0].attributes.backend, true);
  assert.deepEqual(redundantCommas[0].positionalValues, ['urgent', 'backend']);

  // 4. Stacked brackets: consumes first bracket as attributes, leaves second as text
  const stacked = parseTagTokens('@tag[first][second]');
  assert.equal(stacked.length, 1);
  assert.equal(stacked[0].tag, 'tag');
  assert.equal(stacked[0].attributes.first, true);
  assert.equal(stacked[0].attributes.second, undefined);

  // 5. Dangling closing bracket
  const dangling = parseTagTokens('@tag]something[');
  assert.equal(dangling.length, 1);
  assert.equal(dangling[0].tag, 'tag');
  assert.deepEqual(dangling[0].attributes, {});
});

test('Tag Parser (Adversarial): Category B - Quoting & Special Value Characters', () => {
  // 6. Quoted values with spaces
  const quoted = parseTagTokens('@book[title="The Diamond Age", author="Neal Stephenson"]');
  assert.equal(quoted[0].attributes.title, 'The Diamond Age');
  assert.equal(quoted[0].attributes.author, 'Neal Stephenson');

  // 7. Escaped quotes inside quotes
  const escapedQuotes = parseTagTokens('@book[quote="He said \\"hello\\" to me"]');
  assert.equal(escapedQuotes[0].attributes.quote, 'He said "hello" to me');

  // 8. Commas inside quotes (must NOT split inside quotes)
  const commasInQuotes = parseTagTokens('@task[tags="backend, auth, db", urgent]');
  assert.equal(commasInQuotes[0].attributes.tags, 'backend, auth, db');
  assert.equal(commasInQuotes[0].attributes.urgent, true);

  // 9. Equals signs inside values (e.g. URLs with query strings)
  const equalsInVal = parseTagTokens('@api[url="https://example.com/api?a=1&b=2"]');
  assert.equal(equalsInVal[0].attributes.url, 'https://example.com/api?a=1&b=2');

  // 10. Spaces around delimiters
  const spaces = parseTagTokens('@todo[  status  =  wip  ,  priority  =  1  ]');
  assert.equal(spaces[0].attributes.status, 'wip');
  assert.equal(spaces[0].attributes.priority, 1);
});

test('Tag Parser (Adversarial): Category C - Boundary & Context Traps', () => {
  // 11. Email addresses: must NOT parse @domain as a tag
  const email = parseTagTokens('Contact user@domain.com or admin@company.org');
  assert.equal(email.length, 0);

  // 12. URLs with @: must NOT parse
  const url = parseTagTokens('Visit https://github.com/@alice for code');
  assert.equal(url.length, 0);

  // 13. Attached punctuation
  const parens = parseTagTokens('Discussed plan (@todo[urgent]) yesterday');
  assert.equal(parens.length, 1);
  assert.equal(parens[0].tag, 'todo');
  assert.equal(parens[0].attributes.urgent, true);

  const exclamation = parseTagTokens('Review this now @important!');
  assert.equal(exclamation.length, 1);
  assert.equal(exclamation[0].tag, 'important');

  const question = parseTagTokens('Can we check @explore?');
  assert.equal(question.length, 1);
  assert.equal(question[0].tag, 'explore');

  const colon = parseTagTokens('Notice: @todo: remember milk');
  assert.equal(colon.length, 1);
  assert.equal(colon[0].tag, 'todo');
});

test('Tag Parser (Adversarial): Category D - CommonMark Backslash Escaping', () => {
  // 15. Single backslash: escaped -> isEscaped = true
  const single = parseTagTokens('\\@todo[urgent]');
  assert.equal(single.length, 1);
  assert.equal(single[0].isEscaped, true);

  // 16. Double backslash: even -> isEscaped = false (collapses to literal \)
  const double = parseTagTokens('\\\\@todo[urgent]');
  assert.equal(double.length, 1);
  assert.equal(double[0].isEscaped, false);

  // 17. Triple backslash: odd -> isEscaped = true
  const triple = parseTagTokens('\\\\\\@todo[urgent]');
  assert.equal(triple.length, 1);
  assert.equal(triple[0].isEscaped, true);

  // 18. Quadruple backslash: even -> isEscaped = false
  const quad = parseTagTokens('\\\\\\\\@todo[urgent]');
  assert.equal(quad.length, 1);
  assert.equal(quad[0].isEscaped, false);
});

test('Tag Parser (Adversarial): Category E - Resolution & Strikethrough Permutations', () => {
  // 19. Standard strike
  const std = parseTagTokens('~~@todo~~');
  assert.equal(std[0].isResolved, true);

  // 20. Strikethrough with bracket attributes
  const strikeWithAttrs = parseTagTokens('~~@todo[urgent, priority=1]~~');
  assert.equal(strikeWithAttrs[0].isResolved, true);
  assert.equal(strikeWithAttrs[0].attributes.urgent, true);
  assert.equal(strikeWithAttrs[0].attributes.priority, 1);

  // 21. Attribute flag resolved
  const attrResolved = parseTagTokens('@todo[resolved]');
  assert.equal(attrResolved[0].isResolved, true);

  // 22. Status done / dropped / migrated triggers resolution
  const statusDone = parseTagTokens('@todo[status=done]');
  assert.equal(statusDone[0].isResolved, true);

  const statusDropped = parseTagTokens('@todo[status=dropped]');
  assert.equal(statusDropped[0].isResolved, true);

  const statusWip = parseTagTokens('@todo[status=wip]');
  assert.equal(statusWip[0].isResolved, false);

  // Whole note struck cascades
  const struckNote = parseTagTokens('@todo[status=wip]', /* noteIsStruck */ true);
  assert.equal(struckNote[0].isResolved, true);
});

test('Tag Parser (Adversarial): Category F - Unicode, Emojis & Hyphens', () => {
  // 23. Emojis in values and flags
  const emojis = parseTagTokens('@mood[🔥, status="💯"]');
  assert.equal(emojis.length, 1);
  assert.equal(emojis[0].tag, 'mood');
  assert.equal(emojis[0].attributes['🔥'], true);
  assert.equal(emojis[0].attributes.status, '💯');

  // 24. CJK & Accents in attributes
  const accents = parseTagTokens('@projet[validé]');
  assert.equal(accents.length, 1);
  assert.equal(accents[0].tag, 'projet');
  assert.equal(accents[0].attributes['validé'], true);

  // 25. Hyphenated tags and attributes
  const hyphens = parseTagTokens('@deep-work[session-1, time-block=90m]');
  assert.equal(hyphens.length, 1);
  assert.equal(hyphens[0].tag, 'deep-work');
  assert.equal(hyphens[0].attributes['session-1'], true);
  assert.equal(hyphens[0].attributes['time-block'], '90m');
});

test('Tag Prototypes: Default Inheritance & Selective Overrides', () => {
  // Prototype defaults
  const todoToken = parseTagTokens('@todo')[0];
  const todoResolved = resolveTokenWithPrototype(todoToken);
  assert.equal(todoResolved.color, '#51C391');
  assert.equal(todoResolved.notable, true);
  assert.equal(todoResolved.isCore, true);

  const exploreToken = parseTagTokens('@explore')[0];
  const exploreResolved = resolveTokenWithPrototype(exploreToken);
  assert.equal(exploreResolved.notable, false);

  // Selective overrides
  const customExplore = parseTagTokens('@explore[notable=true]')[0];
  const customExploreResolved = resolveTokenWithPrototype(customExplore);
  assert.equal(customExploreResolved.notable, true);

  const customTodo = parseTagTokens('@todo[color="#FFAA00", notable=false]')[0];
  const customTodoResolved = resolveTokenWithPrototype(customTodo);
  assert.equal(customTodoResolved.color, '#FFAA00');
  assert.equal(customTodoResolved.notable, false);
});

test('AnnotationUtils Integration: parseNoteContent & splitNoteAnchorAndBody', () => {
  const content = '@todo[priority=1, status=wip] Review quarterly plans';
  const parsed = parseNoteContent(content);

  assert.equal(parsed.annotations.length, 1);
  const ann = parsed.annotations[0];
  assert.equal(ann.tag, 'todo');
  assert.equal(ann.priority, 1);
  assert.equal(ann.attributes?.status, 'wip');
  assert.equal(ann.isLeading, true);

  // Split leading anchor and body text
  const split = splitNoteAnchorAndBody(content);
  assert.equal(split.anchor?.tag, 'todo');
  assert.equal(split.bodyText, 'Review quarterly plans');

  // Escaping in parseNoteContent
  const escaped = parseNoteContent('\\@todo[urgent] plain text');
  assert.equal(escaped.annotations.length, 0);
  assert.equal(escaped.segments[0].text, '@todo[urgent] plain text');
});
