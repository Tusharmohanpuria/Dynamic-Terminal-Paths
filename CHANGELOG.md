# Change Log

All notable changes to the "dynamic-terminal-paths" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- Regex-driven terminal link matchers configured via `dynamicTerminalPaths.matchers`.
- Paths with spaces support; quoted and separator-based default matchers.
- Three actions: `openFile`, `openUri`, `runCommand` (action inferred from `uri`/`command` when omitted).
- Unified template engine for `uri`, `base`, and string `args`: capture groups (`$0`, `$1`, `${12}`, `$$`), variables (`${workspaceFolder}`, `${workspaceFolder:Name}`, `${userHome}`, `${cwd}`, `${pathSeparator}`, `${/}`, `${env:VAR}`), and `:enc` URL-encoding modifier.
- `openFile` resolution tries terminal cwd first, then `base`, then workspace folders, opening the first path that exists; supports `:line:col` / `(line,col)`.
- Cross-platform (Windows, macOS, Linux) path handling.
- Performance guards `dynamicTerminalPaths.maxLineLength` and `dynamicTerminalPaths.maxMatchesPerLine`.
- Slash-anchored default matcher: detects paths with spaces (e.g. Git `create mode` output) without capturing leading prose.
- Multiple actions per matcher via `actions[]` with a click-time QuickPick (works around the terminal-link API having no modifier-key info).
- `${file}` / `${fileUri}` template variables (resolved matched file) for `openUri`/`runCommand` — e.g. passing a `.mmd` file to a Mermaid preview command.
- Resolution safety net: recovers the real path when a matcher captures leading words before it.