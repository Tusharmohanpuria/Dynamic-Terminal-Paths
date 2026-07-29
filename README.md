# Dynamic Terminal Paths

Make file paths printed in the VS Code integrated terminal **clickable** — including
paths **with spaces** (Git output, test logs, stack traces) — and open them directly
in an editor tab instead of the Explorer.

Everything is **regex-driven and configured from `settings.json`**. No hardcoded
patterns.

## How it works

1. A [`TerminalLinkProvider`](https://code.visualstudio.com/api/references/vscode-api#TerminalLinkProvider)
   runs your matchers against every terminal line.
2. Matches are underlined with a tooltip.
3. Ctrl/Cmd+click runs the matcher's **action** — open a file, open a URI, or run a
   VS Code command.

For `openFile`, the matched text is resolved against several candidate locations and
the **first one that actually exists on disk** is opened, so bad matches don't open
empty tabs.

### Path resolution order

Relative paths are resolved **against the terminal's current directory first**, not
the workspace root — a path printed after you `cd` into a subfolder resolves relative
to where the shell actually is. The order is:

1. Absolute path / `~` home (used as-is).
2. **Terminal cwd** (from shell integration).
3. The matcher's `base`.
4. Each workspace folder root (fallback).

> The terminal cwd comes from
> [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration).
> If it isn't active for your shell, resolution falls back to `base` / workspace
> folders.

## Configuration

The main setting is `dynamicTerminalPaths.matchers` — an array of matcher objects.
Two performance settings are covered under [Performance](#performance).

| Field | Applies to | Description |
| --- | --- | --- |
| `regex` *(required)* | all | Applied to each terminal line. `g` and `d` flags are added automatically. Escape backslashes for JSON (`\\s`, `\\.`). |
| `name` | all | Tooltip / label. |
| `flags` | all | Extra regex flags, e.g. `"i"`. |
| `group` | all | Capture group to underline. Default `1`, falls back to whole match. |
| `tooltip` | all | Overrides `name` for the hover text. |
| `action` | all | `openFile`, `openUri`, or `runCommand`. **Optional** — inferred: `uri` ⇒ openUri, `command` ⇒ runCommand, else openFile. |
| `base` | `openFile` | Base dir for relative paths (tried after terminal cwd). Template-expanded. Default `${workspaceFolder}`. |
| `uri` | `openUri` | URI template. |
| `external` | `openUri` | Open in a browser instead of inside VS Code. |
| `command` | `runCommand` | VS Code command id. |
| `args` | `runCommand` | Command arguments; string args are template-expanded. |
| `openFirst` | `runCommand` | Open the resolved file before running the command (for commands that act on the active editor, e.g. a preview). |

### Template engine

`uri`, `base`, and string `args` are expanded with the same engine:

- **Capture groups:** `$0` (whole match), `$1`, `$2`, …, `${12}` (multi-digit),
  `$$` = literal `$`.
- **Variables:** `${workspaceFolder}`, `${workspaceFolder:Name}`, `${userHome}`,
  `${cwd}` (terminal cwd), `${pathSeparator}`, `${/}` (literal `/`, for URL paths),
  `${env:VAR}`, `${file}` / `${fileUri}` (the resolved matched file — for
  `openUri`/`runCommand` templates).
- **Encoding:** append `:enc` to any variable or braced group to URL-encode it
  (`${1:enc}`, `${workspaceFolder:enc}`) — e.g. so a `vscode://file` URI survives
  spaces.

Variables expand first, then capture groups, so matched text is never
re-interpreted as a variable.

### Cross-platform

Works on Windows, macOS, and Linux — path separators, home dir, and absolute-path
detection follow the host OS. `${pathSeparator}` is `\` on Windows and `/`
elsewhere.

### Line & column

A trailing `:LINE`, `:LINE:COL`, `(LINE)` or `(LINE,COL)` on an `openFile` match
opens the file at that position. Include it in your capture group.

### Multiple actions per link (picker)

A matcher can offer several actions via `actions`. Clicking a link shows a
QuickPick to choose one. Each entry uses the same fields (`action`, `base`, `uri`,
`external`, `command`, `args`) plus a `label`.

> **Why not Shift+click?** VS Code's terminal-link API does not report which
> modifier was held on click (and Shift/Alt+click are reserved for terminal text
> selection). So per-modifier routing isn't possible — the picker is the supported
> way to offer more than one action.

Example — a `.mmd` link that can open the file **or** its Mermaid preview. Replace
`command` with your Mermaid extension's actual preview command id:

```jsonc
{
  "name": "Mermaid diagrams",
  "regex": "((?:[A-Za-z]:)?[/\\\\]?[^\\s/\\\\]+(?:[/\\\\][^/\\\\\\n]+)+\\.mmd)",
  "group": 1,
  "actions": [
    { "label": "Open file", "action": "openFile" },
    {
      "label": "Open Mermaid preview",
      "action": "runCommand",
      "command": "mermaidChart.preview",
      "openFirst": true
    }
  ]
}
```

`openFirst: true` opens the file before running the command — needed for preview
commands (like `mermaidChart.preview`) that act on the **active editor**. If your
command instead takes the file as an argument, drop `openFirst` and use
`"args": ["${fileUri}"]`.

## Defaults

Two **safe** matchers ship out of the box:

1. **Quoted file paths** — anything inside `"…"` / `'…'` ending in an extension.
   Quotes make spaces unambiguous.
2. **Relative/absolute paths** — path-like tokens that contain a separator
   (`src/app.ts`, `./a/b.py`, `C:\repo\x.cs:12:3`). Requires a separator, so prose
   and bare words are not underlined.

> **Spaces without quotes:** matching unquoted paths that contain spaces is
> inherently greedy — `ERROR at foo.ts` looks like one path. It is **not** a default
> to avoid underlining prose. Opt in with the example below if your paths are always
> file-like.

## Examples

Add to `settings.json`:

```jsonc
"dynamicTerminalPaths.matchers": [
  // Unquoted paths WITH spaces (opt-in; greedy — use if your lines are path-only)
  {
    "name": "Paths with spaces",
    "regex": "([A-Za-z0-9_./\\\\-]+(?:\\s[A-Za-z0-9_./\\\\-]+)*\\.[A-Za-z0-9_]+)",
    "group": 1,
    "base": "${workspaceFolder}",
    "action": "openFile"
  },

  // Turn issue ids into GitHub links (action inferred: openUri)
  {
    "name": "GitHub issue",
    "regex": "\\b(?:ISSUE|FC)-(\\d+)\\b",
    "uri": "https://github.com/org/repo/issues/$1",
    "external": true
  },

  // Open a matched path via an explicit vscode://file URI (spaces encoded)
  {
    "regex": "([A-Za-z0-9_./\\\\-]+(?:\\s[A-Za-z0-9_./\\\\-]+)*\\.[A-Za-z0-9_]+)",
    "uri": "vscode://file/${workspaceFolder:enc}${/}${1:enc}"
  },

  // Feed the match into quick open (action inferred: runCommand)
  {
    "regex": "([A-Za-z0-9_./\\\\-]+(?:\\s[A-Za-z0-9_./\\\\-]+)*\\.[A-Za-z0-9_]+)",
    "command": "workbench.action.quickOpen",
    "args": ["$1"]
  }
]
```

## Performance

Link detection runs on **every** terminal line, so the work per line is bounded.
Matchers are compiled once and cached (recompiled only when settings change), and
file-existence checks happen only on click — never while scanning lines.

Two settings tune the per-line guards:

| Setting | Default | Description |
| --- | --- | --- |
| `dynamicTerminalPaths.maxLineLength` | `5000` | Skip lines longer than this many characters (guards against slow regex backtracking on minified/base64 output). `0` disables detection entirely. |
| `dynamicTerminalPaths.maxMatchesPerLine` | `100` | Maximum links created per line. |

Keep matcher regexes anchored where possible and put more specific matchers first —
the first matcher to claim a span wins, so later ones skip overlapping ranges.

## Development

```sh
npm install
npm run compile   # tsc
npm run lint      # eslint
npm test          # vscode-test (unit tests for the matching/parsing logic)
```

Press `F5` in VS Code to launch an Extension Development Host and try it in a real
terminal.
