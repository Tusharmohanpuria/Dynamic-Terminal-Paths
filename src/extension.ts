import * as vscode from 'vscode';
import { DynamicTerminalLinkProvider } from './provider';

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel('Dynamic Terminal Paths');
	context.subscriptions.push(output);

	const provider = new DynamicTerminalLinkProvider(output);
	context.subscriptions.push(vscode.window.registerTerminalLinkProvider(provider));

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('dynamicTerminalPaths')) {
				provider.reload();
			}
		}),
	);
}

export function deactivate(): void {}
