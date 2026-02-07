# cc-statusline-custom

## Purpose

Support Claude Code users by providing a customizable statusline that reads JSON from stdin and always prints a single line.

**Key Feature: Plugin System** — Unlike standard statuslines, this tool lets you extend output with custom shell commands via plugins. Display git branch, system stats, or any project-specific information you need.

## Statusline Examples

### Recommended Configurations

**5-hour limit + weekly limit (both displayed):**
`--segments=model,cost,usage_all,ctx`
```
🤖 Opus | 💰 $0.23 | ⌛️ 55% [██░░] (~3:45pm)  🌙 55% [██░░] (~10:45pm, Feb 1) | 🧠 31,616 [█░░░░░░░] (16%)
```

**5-hour limit only:**
`--segments=model,cost,usage,ctx`
```
🤖 Opus | 💰 $0.23 | ⌛️ 55% [██░░] (~3:45pm) | 🧠 31,616 [█░░░░░░░] (16%)
```

**No emojis:**
`--segments=model,cost,usage,ctx --no-emojis`
```
Opus | $0.23 | 5h: 55% [██░░] (~3:45pm) | ctx: 31,616 [█░░░░░░░] (16%)
```

**No progress bars:**
`--segments=model,cost,usage,ctx --no-bars`
```
🤖 Opus | 💰 $0.23 | ⌛️ 55% (~3:45pm) | 🧠 31,616 (16%)
```

**No emojis + no progress bars:**
`--segments=model,cost,usage,ctx --no-emojis --no-bars`
```
Opus | $0.23 | 5h: 55% (~3:45pm) | ctx: 31,616 (16%)
```

## settings.json Example

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --segments=model,cost,usage_all,ctx",
    "padding": 0
  }
}
```

With display options:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --segments=model,cost,usage,ctx --no-emojis --no-bars",
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

## Options

All options are flags and can be combined.

| Option | Description |
| --- | --- |
| `--update-cache` | Update the subscription usage cache and print the result. |
| `--auto` | Internal flag for background updates (usually not needed manually). |
| `--debug` | Enable debug mode (stores raw response body in cache on failure). |
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
| `subscription_usage` | `usage`, `subscription`, `sub_usage`, `sub` |
| `subscription_usage_all` | `sub_all`, `usage_all` |

Resolution order: CLI > ENV > DEFAULT. Unknown tokens are ignored.

## Plugins (Extensibility)

**Plugins allow you to extend the statusline with any shell command.** This is powerful for displaying project-specific information like git branch, Docker status, test coverage, or any custom data.

### Quick Start

1. Create a plugin config file (e.g., `~/.config/cc-statusline/plugins.yaml`):

```yaml
plugins:
  - id: git_branch
    command: git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '-'
    emoji: "🌿"
    fallbackText: "branch"
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
| `fallbackText` | No | Text prefix when `--no-emojis` is set |
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
    command: node -v | sed 's/^v//'
    emoji: "📦"
    fallbackText: "node"
    ttl: 3600
    refreshOn: session_start
```

**CPU load (macOS):**
```yaml
  - id: cpu
    command: top -l 1 | grep "CPU usage" | awk '{print $3}'
    emoji: "💻"
    fallbackText: "cpu"
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

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `CCSTATUSLINE_SEGMENTS` | Segment order/visibility (CSV). | Uses default order |
| `CCSTATUSLINE_NO_EMOJIS` | `true`/`1` disables emojis. | `false` |
| `CCSTATUSLINE_NO_BARS` | `true`/`1` disables bars. | `false` |
| `CCSTATUSLINE_DEBUG` | `true`/`1` enables debug mode. | `false` |
| `CCSTATUSLINE_CACHE_DIR` | Cache directory path. | `~/.cache/cc-statusline-custom` |
| `CCSTATUSLINE_PLUGIN_CONFIG` | Path to plugin config YAML file. | (none) |
| `CCSTATUSLINE_CACHE_TTL` | Cache TTL in seconds. | `60` |
| `CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL` | Subscription cache TTL in seconds. | `60` |
| `CCSTATUSLINE_CONTEXT_LOW_THRESHOLD` | Context low threshold percentage. | `50` |
| `CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD` | Context medium threshold percentage. | `80` |

## License

MIT. See `LICENSE`.
