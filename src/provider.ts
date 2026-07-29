import * as vscode from 'vscode';
import {
	compileMatcher,
	findLineMatches,
	FindLimits,
	DEFAULT_MAX_LINE_LENGTH,
	DEFAULT_MAX_MATCHES_PER_LINE,
} from './matcher';
import { resolveLink } from './resolver';
import { expand, ExpandContext, needsFile, resolveAction } from './template';
import { ActionConfig, CompiledMatcher, LinkData, MatcherConfig } from './types';

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
		const choice = await this.chooseAction(data.matcher);
		if (!choice) {
			return;
		}
		const action = resolveAction(choice);

		try {
			switch (action) {
				case 'openUri':
					return await this.openUri(data, choice);
				case 'runCommand':
					return await this.runCommand(data, choice);
				case 'openFile':
				default:
					return await this.openFile(data, choice);
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.output.appendLine(`handleTerminalLink failed (${action}): ${message}`);
			vscode.window.showErrorMessage(`Dynamic Terminal Paths: ${message}`);
		}
	}

	// Returns the single action, or prompts a picker when a matcher defines many.
	private async chooseAction(matcher: MatcherConfig): Promise<ActionConfig | undefined> {
		const actions = matcher.actions?.length ? matcher.actions : [matcher];
		if (actions.length === 1) {
			return actions[0];
		}
		const items = actions.map((a, index) => ({ label: a.label || resolveAction(a), index }));
		const pick = await vscode.window.showQuickPick(items, {
			placeHolder: matcher.name ? `${matcher.name}: choose an action` : 'Choose an action',
		});
		return pick ? actions[pick.index] : undefined;
	}

	// Resolves the matched file only when a template needs it, then builds the
	// expand context.
	private async buildContext(data: LinkData, cfg: ActionConfig): Promise<ExpandContext> {
		const ctx: ExpandContext = { cwd: data.cwd };
		if (needsFile(cfg.uri, ...(cfg.args ?? []).map((a) => (typeof a === 'string' ? a : undefined)))) {
			const base = cfg.base || '${workspaceFolder}';
			const resolved = await resolveLink(data.text, base, data.groups, { cwd: data.cwd });
			ctx.file = resolved?.uri.fsPath;
		}
		return ctx;
	}

	private async openFile(data: LinkData, cfg: ActionConfig): Promise<void> {
		const base = cfg.base || '${workspaceFolder}';
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

	private async openUri(data: LinkData, cfg: ActionConfig): Promise<void> {
		const template = cfg.uri;
		if (!template) {
			throw new Error('uri is required for the openUri action');
		}
		const ctx = await this.buildContext(data, cfg);
		const uri = vscode.Uri.parse(expand(template, data.groups, ctx), true);
		if (cfg.external) {
			await vscode.env.openExternal(uri);
		} else {
			await vscode.commands.executeCommand('vscode.open', uri);
		}
	}

	private async runCommand(data: LinkData, cfg: ActionConfig): Promise<void> {
		const command = cfg.command;
		if (!command) {
			throw new Error('command is required for the runCommand action');
		}
		const ctx = await this.buildContext(data, cfg);
		const args = (cfg.args ?? []).map((arg) =>
			typeof arg === 'string' ? expand(arg, data.groups, ctx) : arg,
		);
		await vscode.commands.executeCommand(command, ...args);
	}
}
