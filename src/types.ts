export type MatcherAction = 'openFile' | 'openUri' | 'runCommand';

export interface MatcherConfig {
	name?: string;
	regex: string;
	// Extra regex flags; g and d are always added.
	flags?: string;
	// Capture group to underline. Defaults to 1, falls back to 0.
	group?: number;
	// Defaults per action inference: uri => openUri, command => runCommand, else openFile.
	action?: MatcherAction;
	tooltip?: string;

	// openFile: base directory for relative matches (template-expanded).
	base?: string;

	// openUri: URI template (template-expanded).
	uri?: string;
	// openUri: open externally (browser) instead of inside VS Code.
	external?: boolean;

	// runCommand: command id and args (string args are template-expanded).
	command?: string;
	args?: unknown[];
}

export interface CompiledMatcher {
	config: MatcherConfig;
	regex?: RegExp;
	error?: string;
}

export interface LinkData {
	// The underlined text (chosen capture group).
	text: string;
	// All capture groups; index 0 is the whole match, missing groups are ''.
	groups: string[];
	matcher: MatcherConfig;
	// Terminal cwd captured at provide time (shell integration).
	cwd?: string;
}

export interface ParsedLocation {
	path: string;
	line?: number;
	column?: number;
}
