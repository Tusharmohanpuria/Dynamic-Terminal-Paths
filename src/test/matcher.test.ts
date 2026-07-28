import * as assert from 'assert';
import {
	compileMatcher,
	findLineMatches,
	parseLocation,
	DEFAULT_MAX_LINE_LENGTH,
	DEFAULT_MAX_MATCHES_PER_LINE,
} from '../matcher';
import { MatcherConfig } from '../types';

// The strict default matcher shipped in package.json (regex source, not
// JSON-escaped): requires a path separator, no spaces, so prose is not matched.
const STRICT_MATCHER: MatcherConfig = {
	name: 'File paths',
	regex: '((?:\\.{1,2}[/\\\\]|~[/\\\\]|[A-Za-z]:[/\\\\])?[\\w.-]+(?:[/\\\\][\\w.-]+)+\\.[A-Za-z0-9_]+(?:[:(]\\d+(?:[:,]\\d+)?\\)?)?)',
	group: 1,
	action: 'openFile',
};

// The exact regex from the project spec (spaces allowed), kept to prove it works
// — but note it is greedy across spaces, which is why it is not a default.
const SPEC_MATCHER: MatcherConfig = {
	name: 'Spec regex',
	regex: '([A-Za-z0-9_./\\-]+(?:\\s[A-Za-z0-9_./\\-]+)*\\.[A-Za-z0-9_]+)',
	group: 1,
	action: 'openFile',
};

suite('matcher', () => {
	test('spec regex matches a simple path', () => {
		const compiled = [compileMatcher(SPEC_MATCHER)];
		const line = 'modified: diagrams/subcategories/Camden/Calls/IceMaker.mmd';
		const matches = findLineMatches(line, compiled);
		assert.strictEqual(matches.length, 1);
		assert.strictEqual(matches[0].data.text, 'diagrams/subcategories/Camden/Calls/IceMaker.mmd');
	});

	test('spec regex matches a path containing spaces', () => {
		const compiled = [compileMatcher(SPEC_MATCHER)];
		const line = 'diagrams/Smelling smoke while using heaterHeater M.mmd';
		const matches = findLineMatches(line, compiled);
		assert.strictEqual(matches.length, 1);
		assert.strictEqual(matches[0].data.text, line);
	});

	test('strict matcher extracts only the path from surrounding prose', () => {
		const compiled = [compileMatcher(STRICT_MATCHER)];
		const line = 'ERROR at src/app.ts:12:5';
		const matches = findLineMatches(line, compiled);
		assert.strictEqual(matches.length, 1);
		assert.strictEqual(
			line.substr(matches[0].startIndex, matches[0].length),
			'src/app.ts:12:5',
		);
	});

	test('strict matcher ignores a bare filename (no separator)', () => {
		const compiled = [compileMatcher(STRICT_MATCHER)];
		const matches = findLineMatches('see README.md for details', compiled);
		assert.strictEqual(matches.length, 0);
	});

	test('invalid regex is reported, not thrown', () => {
		const compiled = compileMatcher({ regex: '([', action: 'openFile' });
		assert.ok(compiled.error);
		assert.strictEqual(compiled.regex, undefined);
	});

	test('overlapping matchers: first one wins', () => {
		const compiled = [compileMatcher(STRICT_MATCHER), compileMatcher(SPEC_MATCHER)];
		const line = 'see src/app.ts';
		const matches = findLineMatches(line, compiled);
		assert.strictEqual(matches.length, 1);
	});

	test('captures all groups for substitution', () => {
		const compiled = [
			compileMatcher({ regex: 'ISSUE-(\\d+)', group: 0, action: 'openUri' }),
		];
		const matches = findLineMatches('fixes ISSUE-42 today', compiled);
		assert.strictEqual(matches.length, 1);
		assert.deepStrictEqual(matches[0].data.groups, ['ISSUE-42', '42']);
	});

	test('empty line and no matchers short-circuit', () => {
		const compiled = [compileMatcher(STRICT_MATCHER)];
		assert.strictEqual(findLineMatches('', compiled).length, 0);
		assert.strictEqual(findLineMatches('src/app.ts', []).length, 0);
	});

	test('over-long lines are skipped', () => {
		const compiled = [compileMatcher(STRICT_MATCHER)];
		const line = 'x'.repeat(DEFAULT_MAX_LINE_LENGTH) + ' src/app.ts';
		assert.strictEqual(findLineMatches(line, compiled).length, 0);
	});

	test('matches per line are capped', () => {
		const compiled = [compileMatcher({ regex: 'a/(\\w)\\.ts', group: 0 })];
		const line = Array.from({ length: DEFAULT_MAX_MATCHES_PER_LINE + 20 }, (_, i) =>
			`a/${String.fromCharCode(97 + (i % 26))}.ts`,
		).join(' ');
		assert.strictEqual(findLineMatches(line, compiled).length, DEFAULT_MAX_MATCHES_PER_LINE);
	});

	test('custom limits are honored', () => {
		const compiled = [compileMatcher({ regex: 'a/(\\w)\\.ts', group: 0 })];
		const line = 'a/b.ts a/c.ts a/d.ts';
		const matches = findLineMatches(line, compiled, {
			maxLineLength: 5000,
			maxMatchesPerLine: 2,
		});
		assert.strictEqual(matches.length, 2);
	});
});

suite('parseLocation', () => {
	test('plain path', () => {
		assert.deepStrictEqual(parseLocation('src/app.ts'), { path: 'src/app.ts' });
	});

	test('path:line', () => {
		assert.deepStrictEqual(parseLocation('src/app.ts:12'), {
			path: 'src/app.ts',
			line: 12,
			column: undefined,
		});
	});

	test('path:line:col', () => {
		assert.deepStrictEqual(parseLocation('src/app.ts:12:5'), {
			path: 'src/app.ts',
			line: 12,
			column: 5,
		});
	});

	test('path(line,col)', () => {
		assert.deepStrictEqual(parseLocation('src/app.ts(12,5)'), {
			path: 'src/app.ts',
			line: 12,
			column: 5,
		});
	});

	test('windows drive path is preserved', () => {
		assert.deepStrictEqual(parseLocation('C:\\repo\\app.ts:12'), {
			path: 'C:\\repo\\app.ts',
			line: 12,
			column: undefined,
		});
	});
});
