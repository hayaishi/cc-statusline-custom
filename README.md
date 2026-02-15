# cc-statusline-custom

## Purpose

Support Claude Code users by providing a customizable statusline that reads JSON from stdin and always prints a single line.

**Key Feature: Plugin System** — Unlike standard statuslines, this tool lets you extend output with custom shell commands via plugins. Display git branch, system stats, or any project-specific information you need.

## Statusline Examples

### Recommended Configurations

**Basic usage (recommended):**
`--segments=model,cost,ctx`
```
🤖 Opus | 💰 $0.23 | 🧠 31,616 [█░░░░░░░] (16%)
```

**With preset plugin (`:git_branch`):**
`--config=/path/to/cc-statusline-custom/config.presets.yml --segments=model,:git_branch,cost,ctx`
```
🤖 Opus | 🌿 main | 💰 $0.23 | 🧠 31,616 [█░░░░░░░] (16%)
```

**No emojis:**
`--segments=model,cost,ctx --no-emojis`
```
Opus | $0.23 | ctx: 31,616 [█░░░░░░░] (16%)
```

**No progress bars:**
`--segments=model,cost,ctx --no-bars`
```
🤖 Opus | 💰 $0.23 | 🧠 31,616 (16%)
```

**No emojis + no progress bars:**
`--segments=model,cost,ctx --no-emojis --no-bars`
```
Opus | $0.23 | ctx: 31,616 (16%)
```

## settings.json Example

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --segments=model,cost,ctx",
    "padding": 0
  }
}
```

With display options:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --segments=model,cost,ctx --no-emojis --no-bars",
    "padding": 0
  }
}
```

## Install

Build from source:

```bash
git clone https://github.com/hayaishi/cc-statusline-custom.git
cd cc-statusline-custom
npm install
npm run build
```

## Development Checks

Setup:

```bash
npm i
git config core.hooksPath .githooks
```

What it enforces: `npm run check` (lint + typecheck).

Bypass: `git commit --no-verify` can bypass locally; CI still enforces.

Codex CLI: no Claude-like hook mechanism found in this repository setup; we rely on npm scripts + git hooks + CI for enforcement.

## Options

All options are flags and can be combined.

| Option | Description |
| --- | --- |
| `--update-cache` | Update the subscription usage cache and print the result. |
| `--auto` | Internal flag for background updates (usually not needed manually). |
| `--debug` | Enable debug mode. See `docs/debug-logging.md`. |
| `--disable-bg-update` | Disable background cache updates. |
| `--segments <csv>` / `-s <csv>` | Segment order and visibility (last flag wins). |
| `--config <path>` / `-c <path>` | Path to plugin config YAML file. |
| `--no-emojis` | Disable emojis in output. |
| `--no-bars` | Disable progress bars in output. |

### Segments

Canonical IDs and aliases:

| Canonical ID | Aliases |
| --- | --- |
| `model` | - |
| `cost_session` | `cost`, `cost_usd`, `cost_sess`, `sess` |
| `context` | `ctx` |

Resolution order: CLI > ENV > DEFAULT. Unknown tokens are ignored.

## Plugins (Extensibility)

**Plugins allow you to extend the statusline with any shell command.** This is powerful for displaying project-specific information like git branch, Docker status, test coverage, or any custom data.

### Using Presets (Recommended)

The easiest way to get started is using the included preset configuration:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --config=/path/to/cc-statusline-custom/config.presets.yml --segments=model,:git_branch,cost_session,context",
    "padding": 0
  }
}
```

**Available presets:**

| Plugin | Description | Example Output |
|--------|-------------|----------------|
| `:git_branch` | Current branch with dirty indicator | `🌿 main*` |
| `:git_commit` | Short commit hash | `📌 a3f7b2c` |
| `:node_version` | Node.js version | `📦 20.11.0` |
| `:cpu` | CPU usage (macOS only) | `💻 23.5%` |

You can customize `config.presets.yml` by commenting out unused plugins or adjusting their settings.

### Quick Start (Custom Config)

1. Create a plugin config file (e.g., `~/.config/cc-statusline/plugins.yaml`):

```yaml
plugins:
  - id: git_branch
    command: git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-'
    emoji: "🌿"
    alt: "branch"
    fallbackValue: "-"
    ttl: 30
```

2. Update your `settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --config=~/.config/cc-statusline/plugins.yaml --segments=model,:git_branch,cost_session,context",
    "padding": 0
  }
}
```

3. Result:

```
🤖 Opus | 🌿 main | 💰 $0.23 | 🧠 84.0k/200k [███░░░░░] (42%)
```

### Plugin Config Reference

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | Unique identifier. Use in segments as `:<id>` |
| `command` | Yes | Shell command to execute (`/bin/sh -c`) |
| `ttl` | Yes | Cache TTL in seconds. `0` = refresh per session |
| `emoji` | No | Emoji prefix when `--no-emojis` is not set |
| `alt` | No | Text prefix when `--no-emojis` is set |
| `fallbackValue` | No | Value shown when command fails or cache missing (default: `?`) |
| `maxLength` | No | Truncate output to N characters (default: 32) |
| `timeout` | No | Command timeout in ms (default: 5000, max: 30000) |
| `workingDir` | No | Working directory for command (default: project root) |
| `refreshOn` | No | `"session_start"` = refresh once per Claude Code session |

### Example Plugins

**Git branch with dirty indicator:**
```yaml
plugins:
  - id: git_status
    command: |
      branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
      [ -z "$branch" ] && echo "-" && exit
      [ -n "$(git status --porcelain 2>/dev/null)" ] && branch="$branch*"
      echo "$branch"
    emoji: "🌿"
    fallbackValue: "-"
    ttl: 10
```

**Node.js version:**
```yaml
  - id: node_version
    command: |
      v=$(node -v 2>/dev/null)
      [ -n "$v" ] && printf '%s\n' "${v#v}" || echo "-"
    emoji: "📦"
    alt: "node"
    ttl: 3600
    refreshOn: session_start
```

**CPU load (macOS):**
```yaml
  - id: cpu
    command: |
      [ "$(uname -s)" = "Darwin" ] || { echo "-"; exit; }
      v=$(top -l 1 2>/dev/null | grep "CPU usage" | awk '{print $3}')
      [ -n "$v" ] && echo "$v" || echo "-"
    emoji: "💻"
    alt: "cpu"
    ttl: 5
```

### CLI Options for Plugins

| Option | Description |
| --- | --- |
| `--config <path>` / `-c <path>` | Path to plugin config YAML file |

Environment variable: `CCSTATUSLINE_PLUGIN_CONFIG` (CLI takes precedence)

### How Plugins Work

1. **Cache-first rendering** — Commands never block the statusline. Results are read from cache.
2. **Background refresh** — Stale caches trigger a background update after printing.
3. **Project-aware** — Commands run in the project root by default (from `workspace.project_dir`).
4. **Fail-safe** — Command errors show `fallbackValue`; the statusline never crashes.

### Documentation

- **[Plugin Usage Guide](docs/plugin-usage-guide.md)** — How to use and configure plugins, preset details, cache behavior, troubleshooting
- **[Plugin Development Guide](docs/plugin-development-guide.md)** — Create custom plugins, best practices, TTL design, debugging
- **[Debug Logging](docs/debug-logging.md)** — Enable debug mode and inspect logs

## Experimental Features

### Subscription Usage Tracking

**⚠️ EXPERIMENTAL**: These features are experimental and may change or be removed without notice. They call the Claude API directly and are provided as-is with no warranty.

The `subscription_usage` and `subscription_usage_all` segments display your Claude subscription usage limits (5-hour and weekly limits).

#### Available Segments

| Segment | Aliases | Description |
|---------|---------|-------------|
| `subscription_usage` | `usage`, `subscription`, `sub_usage`, `sub` | Shows 5-hour usage limit |
| `subscription_usage_all` | `sub_all`, `usage_all` | Shows both 5-hour and weekly limits |

#### Example

**5-hour limit + weekly limit (both displayed):**
`--segments=model,cost,subscription_usage_all,ctx`
```
🤖 Opus | 💰 $0.23 | ⌛️ 55% [██░░] (~3:45pm)  🌙 55% [██░░] (~10:45pm, Feb 1) | 🧠 31,616 [█░░░░░░░] (16%)
```

**5-hour limit only:**
`--segments=model,cost,subscription_usage,ctx`
```
🤖 Opus | 💰 $0.23 | ⌛️ 55% [██░░] (~3:45pm) | 🧠 31,616 [█░░░░░░░] (16%)
```

#### How to Enable

Add the segment to your `--segments` list in `settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --segments=model,cost,sub_all,ctx",
    "padding": 0
  }
}
```

#### ⚠️ Disclaimer

- **Experimental feature**: This functionality is experimental and may break or be removed in future versions
- **No warranty**: We cannot guarantee stability or take responsibility for any issues
- **Direct API calls**: This feature calls the Claude API directly using your credentials
- **Opt-in only**: You must explicitly enable this feature — use at your own risk
- **May stop working**: Claude API changes may cause this feature to stop functioning without notice

#### Troubleshooting

**Loading never finishes:**
- Press `Ctrl+O` to switch between panes — this triggers a statusline refresh and may display the data

**401 Authentication Error:**
- Execute any prompt in Claude Code to refresh the internal authentication token
- The next statusline refresh should work correctly

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `CCSTATUSLINE_SEGMENTS` | Segment order/visibility (CSV). | Uses default order |
| `CCSTATUSLINE_NO_EMOJIS` | `true`/`1` disables emojis. | `false` |
| `CCSTATUSLINE_NO_BARS` | `true`/`1` disables bars. | `false` |
| `CCSTATUSLINE_DEBUG` | `true`/`1` enables debug mode (see `docs/debug-logging.md`). | `false` |
| `CCSTATUSLINE_CACHE_DIR` | Cache directory path. | `~/.cache/cc-statusline-custom` |
| `CCSTATUSLINE_PLUGIN_CONFIG` | Path to plugin config YAML file. | (none) |
| `CCSTATUSLINE_PLUGIN_CACHE_TTL` | Cache TTL in seconds. | `60` |
| `CCSTATUSLINE_CONTEXT_LOW_THRESHOLD` | Context low threshold percentage. | `50` |
| `CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD` | Context medium threshold percentage. | `80` |

Experimental subscription usage segments do not require dedicated environment variables; enable them explicitly via `--segments`.

## License

MIT. See `LICENSE`.
