# cc-statusline-custom

A customizable statusline command for Claude Code.
It reads JSON from stdin and **always prints one line** with useful usage information (model, cost, context, and optional plugin/experimental segments).

## Quick Start

### 1) Install

```bash
git clone https://github.com/hayaishi/cc-statusline-custom.git
cd cc-statusline-custom
npm install
npm run build
```

### 2) Configure Claude Code

Add this to your `settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --segments=model,cost,ctx",
    "padding": 0
  }
}
```

### 3) Confirm output

Example:

```text
🤖 Opus | 💰 $0.23 | 🧠 31,616 [█░░░░░░░] (16%)
```

## Common Examples

- Basic: `--segments=model,cost,ctx`
- No emojis: `--segments=model,cost,ctx --no-emojis`
- No bars: `--segments=model,cost,ctx --no-bars`
- No emojis + no bars: `--segments=model,cost,ctx --no-emojis --no-bars`
- Load your plugin file: `--config=your.plugins.yml --segments=model,:git_branch,cost,ctx`

## Configuration (CLI options + environment variables)

Resolution order: **CLI > ENV > default**.

### CLI options

| Option | Description |
| --- | --- |
| `--segments <csv>` / `-s <csv>` | Segment order and visibility (last flag wins). |
| `--config <path>` / `-c <path>` | Path to plugin config YAML file. |
| `--no-emojis` | Disable emojis in output. |
| `--no-bars` | Disable progress bars in output. |
| `--debug` | Enable debug mode. See `docs/debug-logging.md`. |
| `--disable-bg-update` | Disable background cache updates. |
| `--update-cache` | Update subscription/plugin cache and print the result. |
| `--auto` | Internal flag for background updates (usually not needed manually). |

### Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `CCSTATUSLINE_SEGMENTS` | Segment order/visibility (CSV). | Uses built-in default |
| `CCSTATUSLINE_NO_EMOJIS` | `true`/`1` disables emojis. | `false` |
| `CCSTATUSLINE_NO_BARS` | `true`/`1` disables bars. | `false` |
| `CCSTATUSLINE_DEBUG` | `true`/`1` enables debug mode. | `false` |
| `CCSTATUSLINE_CACHE_DIR` | Cache directory path. | `~/.cache/cc-statusline-custom` |
| `CCSTATUSLINE_PLUGIN_CONFIG` | Path to plugin config YAML file. | (none) |
| `CCSTATUSLINE_PLUGIN_CACHE_TTL` | Plugin cache TTL in seconds. | `60` |
| `CCSTATUSLINE_CONTEXT_LOW_THRESHOLD` | Context low threshold percentage. | `50` |
| `CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD` | Context medium threshold percentage. | `80` |

### Built-in segments

| Canonical ID | Aliases |
| --- | --- |
| `model` | - |
| `cost_session` | `cost`, `cost_usd`, `cost_sess`, `sess` |
| `context` | `ctx` |

Unknown segment tokens are ignored.

## Plugin support (advanced)

Plugins let you add custom shell-command segments (for example `:git_branch`, `:node_version`, `:cpu`).

Load your plugin file explicitly:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --config=your.plugins.yml --segments=model,:git_branch,cost_session,context",
    "padding": 0
  }
}
```

Note: bundled presets are loaded by default when `--config` is omitted.

For full plugin setup, fields, cache behavior, and troubleshooting, see:

- [Plugin Usage Guide](docs/plugin-usage-guide.md)
- [Plugin Development Guide](docs/plugin-development-guide.md)

## Experimental features

`subscription_usage` / `subscription_usage_all` segments are experimental.

⚠️ **Strong disclaimer**

- These segments rely on private/undocumented Claude API behavior.
- They may break at any time, change without notice, or be removed from this project.
- Stability is not guaranteed; use only if you accept this risk.
- Enable explicitly via `--segments` (opt-in).

Example output:

```text
🤖 Opus | 💰 $0.23 | ⌛️ 55% [██░░] (~3:45pm) | 🧠 31,616 [█░░░░░░░] (16%)
```

With both limits:

```text
🤖 Opus | 💰 $0.23 | ⌛️ 55% [██░░] (~3:45pm)  🌙 55% [██░░] (~10:45pm, Feb 1) | 🧠 31,616 [█░░░░░░░] (16%)
```

For debug details, see [Debug Logging](docs/debug-logging.md).

## Development

```bash
npm i
git config core.hooksPath .githooks
npm run check
```

## License

MIT. See `LICENSE`.
