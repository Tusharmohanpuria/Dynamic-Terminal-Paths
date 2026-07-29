import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseLocation, pathTextVariants } from './matcher';
import { expand, ExpandContext } from './template';

export type ResolveContext = ExpandContext;

export interface ResolveResult {
	uri: vscode.Uri;
	line?: number;
	column?: number;
}

// Returns the first candidate that exists on disk, or undefined.
export async function resolveLink(
	text: string,
	base: string,
	groups: string[],
	ctx: ResolveContext,
): Promise<ResolveResult | undefined> {
	const { path: rawPath, line, column } = parseLocation(text);

	for (const variant of pathTextVariants(rawPath)) {
		const normalized = normalizeSeparators(variant);
		for (const uri of candidateUris(normalized, base, groups, ctx)) {
			if (await exists(uri)) {
				return { uri, line, column };
			}
		}
	}
	return undefined;
}

function* candidateUris(
	relOrAbs: string,
	base: string,
	groups: string[],
	ctx: ResolveContext,
): Generator<vscode.Uri> {
	const seen = new Set<string>();
	const emit = function* (uri: vscode.Uri | undefined): Generator<vscode.Uri> {
		if (uri && !seen.has(uri.toString())) {
			seen.add(uri.toString());
			yield uri;
		}
	};

	const abs = toAbsolute(relOrAbs);
	if (abs) {
		yield* emit(vscode.Uri.file(abs));
	}

	// cwd first: a relative path printed in the terminal is relative to the shell,
	// not the workspace root. Needs shell integration.
	if (ctx.cwd) {
		yield* emit(vscode.Uri.file(path.join(ctx.cwd, relOrAbs)));
	}

	const baseDir = expand(base, groups, ctx).trim();
	if (baseDir) {
		yield* emit(vscode.Uri.file(path.join(baseDir, relOrAbs)));
	}

	for (const folder of vscode.workspace.workspaceFolders ?? []) {
		yield* emit(vscode.Uri.joinPath(folder.uri, relOrAbs));
	}
}

// On Windows, convert backslash separators to forward slashes (drive-absolute
// paths are left intact). On POSIX a backslash is a legal filename char or shell
// escape, so it is preserved.
function normalizeSeparators(p: string): string {
	if (path.sep !== '\\') {
		return p;
	}
	if (/^[A-Za-z]:[\\/]/.test(p)) {
		return p;
	}
	return p.replace(/\\/g, '/');
}

function toAbsolute(p: string): string | undefined {
	if (p.startsWith('~')) {
		return path.join(os.homedir(), p.slice(1));
	}
	if (path.isAbsolute(p)) {
		return p;
	}
	if (/^[A-Za-z]:[\\/]/.test(p)) {
		return p;
	}
	return undefined;
}

async function exists(uri: vscode.Uri): Promise<boolean> {
	try {
		const stat = await vscode.workspace.fs.stat(uri);
		return (stat.type & vscode.FileType.File) !== 0;
	} catch {
		return false;
	}
}
