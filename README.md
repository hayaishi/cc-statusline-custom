# cc-statusline-custom

A customizable statusline command for Claude Code.
It reads JSON from stdin and **always prints one line** with model, cost, subscription usage, context, and optional plugin segments.

## Install

```bash
git clone https://github.com/hayaishi/cc-statusline-custom.git
cd cc-statusline-custom
npm install
npm install -g .
```

Then add this to your `settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "cc-statusline-custom --segments=model,cost,ctx",
    "padding": 0
  }
}
```

Example output:

```text
🤖 Opus | 💰 $0.23 | 🧠 31,616 [█░░░░░░░] (16%)
```

### Update

```bash
cd cc-statusline-custom
git pull
npm install
npm install -g .
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
| `--update-cache` | Update plugin cache and print the result. |
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

| Canonical ID | Aliases | Example output |
| --- | --- | --- |
| `model` | - | `🤖 Opus` |
| `cost_session` | `cost`, `cost_usd`, `cost_sess`, `sess` | `💰 $0.23` |
| `subscription_usage` | `usage`, `subscription`, `sub`, `sub_usage` | `⌛️ 55% [████░░░░] (~3:45pm)` |
| `subscription_usage_all` | `sub_all`, `usage_all` | `⌛️ 55% [████░░░░] (~3:45pm) 🌙 20% [██░░] (~10:45pm, Feb 1)` |
| `context` | `ctx` | `🧠 31,616 [█░░░░░░░] (16%)` |

`subscription_usage` and `subscription_usage_all` render from the `rate_limits` field in Claude Code's stdin JSON. They return an empty string when the field is absent (segment is silently omitted).

Unknown segment tokens are ignored.

## Plugin support (advanced)

Plugins add custom shell-command segments (for example `:git_branch`, `:node_version`, `:cpu`).

Load your plugin file explicitly with the `--config` option:

```json
{
  "statusLine": {
    "type": "command",
    "command": "cc-statusline-custom --config=your.plugins.yml --segments=model,:git_branch,cost_session,context",
    "padding": 0
  }
}
```

Note: Bundled presets are loaded by default when `--config` is omitted.

For full plugin setup, fields, cache behavior, and troubleshooting, see:

- [Plugin Usage Guide](docs/plugin-usage-guide.md)
- [Plugin Development Guide](docs/plugin-development-guide.md)

## Development

```bash
npm i
git config core.hooksPath .githooks
npm run check
```

## License

MIT. See `LICENSE`.
