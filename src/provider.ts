import * as vscode from 'vscode';
import {
	compileMatcher,
	findLineMatches,
	FindLimits,
	DEFAULT_MAX_LINE_LENGTH,
	DEFAULT_MAX_MATCHES_PER_LINE,
} from './matcher';
import { resolveLink } from './resolver';
import { expand, resolveAction } from './template';
import { CompiledMatcher, LinkData, MatcherConfig } from './types';

const CONFIG_SECTION = 'dynamicTerminalPaths';

export interface DtpTerminalLink extends vscode.TerminalLink {
	data: LinkData;
}

export class DynamicTerminalLinkProvider
	implements vscode.TerminalLinkProvider<DtpTerminalLink>
{
	private compiled: CompiledMatcher[] = [];
	private limits: FindLimits = {
		maxLineLength: DEFAULT_MAX_LINE_LENGTH,
		maxMatchesPerLine: DEFAULT_MAX_MATCHES_PER_LINE,
	};

	constructor(private readonly output: vscode.OutputChannel) {
		this.reload();
	}

	reload(): void {
		const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
		const raw = config.get<MatcherConfig[]>('matchers', []);

		this.compiled = raw
			.filter((m) => m && typeof m.regex === 'string' && m.regex.length > 0)
			.map(compileMatcher);

		this.limits = {
			maxLineLength: config.get<number>('maxLineLength', DEFAULT_MAX_LINE_LENGTH),
			maxMatchesPerLine: config.get<number>('maxMatchesPerLine', DEFAULT_MAX_MATCHES_PER_LINE),
		};

		for (const m of this.compiled) {
			if (m.error) {
				this.output.appendLine(
					`Invalid regex for matcher "${m.config.name ?? m.config.regex}": ${m.error}`,
				);
			}
		}
	}

	provideTerminalLinks(
		context: vscode.TerminalLinkContext,
		_token: vscode.CancellationToken,
	): DtpTerminalLink[] {
		const cwd = context.terminal.shellIntegration?.cwd?.fsPath;

		return findLineMatches(context.line, this.compiled, this.limits).map((m) => ({
			startIndex: m.startIndex,
			length: m.length,
			tooltip: m.tooltip,
			data: { ...m.data, cwd },
		}));
	}

	async handleTerminalLink(link: DtpTerminalLink): Promise<void> {
		const { data } = link;
		const action = resolveAction(data.matcher);

		try {
			switch (action) {
				case 'openUri':
					return await this.openUri(data);
				case 'runCommand':
					return await this.runCommand(data);
				case 'openFile':
				default:
					return await this.openFile(data);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.output.appendLine(`handleTerminalLink failed (${action}): ${message}`);
			vscode.window.showErrorMessage(`Dynamic Terminal Paths: ${message}`);
		}
	}

	private async openFile(data: LinkData): Promise<void> {
		const base = data.matcher.base || '${workspaceFolder}';
		const resolved = await resolveLink(data.text, base, data.groups, { cwd: data.cwd });
		if (!resolved) {
			vscode.window.showWarningMessage(
				`Dynamic Terminal Paths: could not find "${data.text.trim()}" in the workspace.`,
			);
			return;
		}

		const options: vscode.TextDocumentShowOptions = {};
		if (resolved.line !== undefined) {
			// line/col are 1-based; Position is 0-based.
			const pos = new vscode.Position(
				Math.max(0, resolved.line - 1),
				Math.max(0, (resolved.column ?? 1) - 1),
			);
			options.selection = new vscode.Range(pos, pos);
		}

		await vscode.commands.executeCommand('vscode.open', resolved.uri, options);
	}

	private async openUri(data: LinkData): Promise<void> {
		const template = data.matcher.uri;
		if (!template) {
			throw new Error('matcher.uri is required for the openUri action');
		}
		const ctx = { cwd: data.cwd };
		const uri = vscode.Uri.parse(expand(template, data.groups, ctx), true);
		if (data.matcher.external) {
			await vscode.env.openExternal(uri);
		} else {
			await vscode.commands.executeCommand('vscode.open', uri);
		}
	}

	private async runCommand(data: LinkData): Promise<void> {
		const command = data.matcher.command;
		if (!command) {
			throw new Error('matcher.command is required for the runCommand action');
		}
		const ctx = { cwd: data.cwd };
		const args = (data.matcher.args ?? []).map((arg) =>
			typeof arg === 'string' ? expand(arg, data.groups, ctx) : arg,
		);
		await vscode.commands.executeCommand(command, ...args);
	}
}
