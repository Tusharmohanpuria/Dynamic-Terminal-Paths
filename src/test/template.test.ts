import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { expand, needsFile, resolveAction } from '../template';

const groups = ['ISSUE-42', '42', 'my app'];
const ctx = { cwd: '/tmp/work' };

suite('expand: capture groups', () => {
	test('replaces $n and ${n}', () => {
		assert.strictEqual(expand('id=$1 name=${2}', groups, ctx), 'id=42 name=my app');
	});

	test('$$ is a literal dollar', () => {
		assert.strictEqual(expand('cost $$5 for $1', groups, ctx), 'cost $5 for 42');
	});

	test('unknown group becomes empty', () => {
		assert.strictEqual(expand('x=$9', groups, ctx), 'x=');
	});

	test('${n:enc} url-encodes a group', () => {
		assert.strictEqual(expand('q=${2:enc}', groups, ctx), 'q=my%20app');
	});
});

suite('expand: variables', () => {
	test('${userHome}', () => {
		assert.strictEqual(expand('${userHome}', groups, ctx), os.homedir());
	});

	test('${cwd}', () => {
		assert.strictEqual(expand('${cwd}/x', groups, ctx), '/tmp/work/x');
	});

	test('${pathSeparator}', () => {
		assert.strictEqual(expand('a${pathSeparator}b', groups, ctx), `a${path.sep}b`);
	});

	test('${/} is a literal forward slash', () => {
		assert.strictEqual(expand('a${/}b', groups, ctx), 'a/b');
	});

	test('${env:VAR}', () => {
		process.env.DTP_TEST = 'hello';
		assert.strictEqual(expand('${env:DTP_TEST}', groups, ctx), 'hello');
		delete process.env.DTP_TEST;
	});

	test('${env:VAR:enc} url-encodes', () => {
		process.env.DTP_TEST = 'a b';
		assert.strictEqual(expand('${env:DTP_TEST:enc}', groups, ctx), 'a%20b');
		delete process.env.DTP_TEST;
	});

	test('unknown variable is left untouched', () => {
		assert.strictEqual(expand('${nope}', groups, ctx), '${nope}');
	});
});

suite('expand: order and mixing', () => {
	test('variables expand before groups', () => {
		// A group whose text looks like a variable must NOT be re-expanded.
		assert.strictEqual(expand('$0', ['${userHome}'], ctx), '${userHome}');
	});

	test('vscode file uri with encoded workspace and group', () => {
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			return; // no workspace in this test host
		}
		const out = expand('vscode://file/${workspaceFolder:enc}${/}$1', ['ISSUE-42'], ctx);
		assert.ok(out.startsWith('vscode://file/'));
		assert.ok(out.endsWith('/ISSUE-42'));
	});
});

suite('resolveAction', () => {
	test('explicit action wins', () => {
		assert.strictEqual(resolveAction({ action: 'openFile', uri: 'y' }), 'openFile');
	});

	test('uri implies openUri', () => {
		assert.strictEqual(resolveAction({ uri: 'y' }), 'openUri');
	});

	test('command implies runCommand', () => {
		assert.strictEqual(resolveAction({ command: 'c' }), 'runCommand');
	});

	test('default is openFile', () => {
		assert.strictEqual(resolveAction({}), 'openFile');
	});
});

suite('${file} / ${fileUri}', () => {
	test('expand file vars from context', () => {
		const out = expand('${file}', groups, { ...ctx, file: '/tmp/a.mmd' });
		assert.strictEqual(out, '/tmp/a.mmd');
	});

	test('fileUri is a file:// URI', () => {
		const out = expand('${fileUri}', groups, { ...ctx, file: '/tmp/a.mmd' });
		assert.ok(out.startsWith('file://'));
	});

	test('missing file expands to empty', () => {
		assert.strictEqual(expand('${file}', groups, ctx), '');
	});

	test('needsFile detects references', () => {
		assert.strictEqual(needsFile('open ${fileUri}'), true);
		assert.strictEqual(needsFile('a', '${file:enc}'), true);
		assert.strictEqual(needsFile('no vars', undefined), false);
	});
});
