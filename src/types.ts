export type MatcherAction = 'openFile' | 'openUri' | 'runCommand';

// One thing a link can do. Used both directly on a matcher (single action) and
// inside a matcher's `actions` list (picker).
export interface ActionConfig {
	// Label shown in the action picker when a matcher has multiple actions.
	label?: string;
	// Defaults per action inference: uri => openUri, command => runCommand, else openFile.
	action?: MatcherAction;

	// openFile: base directory for relative matches (template-expanded).
	base?: string;

	// openUri: URI template (template-expanded).
	uri?: string;
	// openUri: open externally (browser) instead of inside VS Code.
	external?: boolean;

	// runCommand: command id and args (string args are template-expanded).
	command?: string;
	args?: unknown[];
	// runCommand: open the resolved matched file before running the command
	// (for commands that act on the active editor).
	openFirst?: boolean;
}

export interface MatcherConfig extends ActionConfig {
	name?: string;
	regex: string;
	// Extra regex flags; g and d are always added.
	flags?: string;
	// Capture group to underline. Defaults to 1, falls back to 0.
	group?: number;
	tooltip?: string;
	// Multiple actions; clicking shows a picker to choose one.
	actions?: ActionConfig[];
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
