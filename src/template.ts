import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { MatcherAction, MatcherConfig } from './types';

export interface ExpandContext {
	cwd?: string;
}

export function expand(template: string, groups: string[], ctx: ExpandContext): string {
	return expandGroups(expandVariables(template, ctx), groups);
}

function expandVariables(template: string, ctx: ExpandContext): string {
	return template.replace(/\$\{([^}]+)\}/g, (whole, inner: string) => {
		// Numeric refs (${1}, ${1:enc}) are capture groups, handled in the second pass.
		if (/^\d+(?::enc)?$/.test(inner)) {
			return whole;
		}
		const { kind, arg, encode } = parseRef(inner);
		const value = variableValue(kind, arg, ctx);
		if (value === undefined) {
			return whole;
		}
		return encode ? encodeURIComponent(value) : value;
	});
}

function expandGroups(template: string, groups: string[]): string {
	return template.replace(/\$\$|\$\{(\d+)(:enc)?\}|\$(\d+)/g, (whole, braced, bracedEnc, bare) => {
		if (whole === '$$') {
			return '$';
		}
		const index = parseInt(braced ?? bare, 10);
		const value = groups[index] ?? '';
		return bracedEnc ? encodeURIComponent(value) : value;
	});
}

interface Ref {
	kind: string;
	arg: string;
	encode: boolean;
}

// A trailing ":enc" segment sets the encode flag; the rest after the kind is the
// argument, rejoined with ":" so ${env:A:B} keeps "A:B".
function parseRef(inner: string): Ref {
	const parts = inner.split(':');
	let encode = false;
	if (parts.length > 1 && parts[parts.length - 1] === 'enc') {
		encode = true;
		parts.pop();
	}
	return { kind: parts[0], arg: parts.slice(1).join(':'), encode };
}

function variableValue(kind: string, arg: string, ctx: ExpandContext): string | undefined {
	const folders = vscode.workspace.workspaceFolders ?? [];
	switch (kind) {
		case 'workspaceFolder':
			if (arg) {
				return folders.find((f) => f.name === arg)?.uri.fsPath ?? '';
			}
			return folders[0]?.uri.fsPath ?? '';
		case 'userHome':
			return os.homedir();
		case 'cwd':
			return ctx.cwd ?? '';
		case 'pathSeparator':
			return path.sep;
		case '/':
			return '/';
		case 'env':
			return process.env[arg] ?? '';
		default:
			return undefined;
	}
}

export function resolveAction(config: MatcherConfig): MatcherAction {
	if (config.action) {
		return config.action;
	}
	if (config.uri) {
		return 'openUri';
	}
	if (config.command) {
		return 'runCommand';
	}
	return 'openFile';
}
