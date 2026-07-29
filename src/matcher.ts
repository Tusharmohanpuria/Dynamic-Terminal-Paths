import { CompiledMatcher, LinkData, MatcherConfig, ParsedLocation } from './types';

// Hot-path guard defaults: provideTerminalLinks runs on every rendered line, so
// bound the work per line to avoid regex backtracking blowups on pathological
// input. Both are overridable via settings.
export const DEFAULT_MAX_LINE_LENGTH = 5000;
export const DEFAULT_MAX_MATCHES_PER_LINE = 100;

export interface FindLimits {
	maxLineLength: number;
	maxMatchesPerLine: number;
}

const DEFAULT_LIMITS: FindLimits = {
	maxLineLength: DEFAULT_MAX_LINE_LENGTH,
	maxMatchesPerLine: DEFAULT_MAX_MATCHES_PER_LINE,
};

export interface LineMatch {
	startIndex: number;
	length: number;
	data: LinkData;
	tooltip: string;
}

// The `g` flag is needed to walk every match; `d` (hasIndices) lets us read the
// exact capture-group offset. Invalid regexes are reported, not thrown.
export function compileMatcher(config: MatcherConfig): CompiledMatcher {
	try {
		const flags = normalizeFlags(config.flags);
		const regex = new RegExp(config.regex, flags);
		return { config, regex };
	} catch (err) {
		return { config, error: err instanceof Error ? err.message : String(err) };
	}
}

function normalizeFlags(extra?: string): string {
	const set = new Set(['g', 'd']);
	for (const f of extra ?? '') {
		if (f !== 'g' && f !== 'd') {
			set.add(f);
		}
	}
	return [...set].join('');
}

// Matchers are tried in order; the first to claim a range wins, so settings order
// acts as priority. Returns matches sorted by start index.
export function findLineMatches(
	line: string,
	matchers: CompiledMatcher[],
	limits: FindLimits = DEFAULT_LIMITS,
): LineMatch[] {
	if (matchers.length === 0 || line.length === 0 || line.length > limits.maxLineLength) {
		return [];
	}

	const results: LineMatch[] = [];
	const claimed: Array<[number, number]> = [];

	for (const m of matchers) {
		if (!m.regex) {
			continue;
		}
		if (results.length >= limits.maxMatchesPerLine) {
			break;
		}
		m.regex.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = m.regex.exec(line)) !== null) {
			if (results.length >= limits.maxMatchesPerLine) {
				break;
			}
			if (match[0] === '') {
				m.regex.lastIndex++; // avoid an infinite loop on zero-width matches
				continue;
			}

			const span = pickGroupSpan(match, m.config.group);
			if (!span) {
				continue;
			}
			const [start, end] = span;
			const text = line.slice(start, end);
			if (text.trim() === '') {
				continue;
			}
			if (overlaps(claimed, start, end)) {
				continue;
			}
			claimed.push([start, end]);

			results.push({
				startIndex: start,
				length: end - start,
				tooltip: m.config.tooltip || m.config.name || defaultTooltip(m.config),
				data: {
					text,
					groups: match.map((g) => g ?? ''),
					matcher: m.config,
				},
			});
		}
	}

	return results.sort((a, b) => a.startIndex - b.startIndex);
}

// Prefers the requested capture group, then group 1, then the whole match, using
// the `d` flag's indices for exact offsets.
function pickGroupSpan(match: RegExpExecArray, group?: number): [number, number] | undefined {
	const indices = match.indices;
	if (!indices) {
		return [match.index, match.index + match[0].length];
	}

	const candidates: number[] = [];
	if (typeof group === 'number') {
		candidates.push(group);
	}
	candidates.push(1, 0);

	for (const g of candidates) {
		const span = indices[g];
		if (span) {
			return [span[0], span[1]];
		}
	}
	return undefined;
}

function overlaps(claimed: Array<[number, number]>, start: number, end: number): boolean {
	return claimed.some(([s, e]) => start < e && s < end);
}

function defaultTooltip(config: MatcherConfig): string {
	if (config.actions && config.actions.length > 1) {
		return 'Choose an action';
	}
	const single = config.actions?.[0] ?? config;
	const action = single.action ?? (single.uri ? 'openUri' : single.command ? 'runCommand' : 'openFile');
	switch (action) {
		case 'openUri':
			return 'Open link';
		case 'runCommand':
			return `Run ${single.command ?? 'command'}`;
		default:
			return 'Open file in VS Code';
	}
}

// Splits a trailing location off a path: path:LINE, path:LINE:COL, path(LINE),
// path(LINE,COL). Windows drive letters survive because the suffix must be at the
// end and be digits.
export function parseLocation(raw: string): ParsedLocation {
	const text = raw.trim();

	const paren = /^(.*?)\((\d+)(?:,(\d+))?\)$/.exec(text);
	if (paren && paren[1].length > 0) {
		return {
			path: paren[1],
			line: toInt(paren[2]),
			column: toInt(paren[3]),
		};
	}

	const colon = /^(.+?):(\d+)(?::(\d+))?$/.exec(text);
	if (colon && colon[1].length > 0) {
		return {
			path: colon[1],
			line: toInt(colon[2]),
			column: toInt(colon[3]),
		};
	}

	return { path: text };
}

function toInt(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const n = parseInt(value, 10);
	return Number.isFinite(n) ? n : undefined;
}

// Returns the raw text plus, if leading tokens have no separator, a variant
// starting at the first token containing "/" or "\". Lets resolution recover
// when a matcher captured leading words before the real path.
export function pathTextVariants(raw: string): string[] {
	const variants = [raw];
	const tokens = raw.split(' ');
	const idx = tokens.findIndex((t) => t.includes('/') || t.includes('\\'));
	if (idx > 0) {
		variants.push(tokens.slice(idx).join(' '));
	}
	return variants;
}
