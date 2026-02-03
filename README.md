# cc-statusline-custom

## Purpose

Support Claude Code users by providing a customizable statusline that reads JSON from stdin and always prints a single line.

## Statusline Examples

Default (with `subscription_usage_all`):
```
🤖 Opus | 💰 $0.23 | 🧠 84.0k/200k [███░░░░░] (42%) | ⌛️ 55% [██░░] (~3:45pm)  🌙 55% [██░░] (~10:45pm, Feb 1)
```

`--no-emojis`:
```
Opus | $0.23 | ctx: 84.0k/200k [███░░░░░] (42%) | 5h: 55% [██░░] (~3:45pm)  7d: 55% [██░░] (~10:45pm, Feb 1)
```

`--no-bars`:
```
🤖 Opus | 💰 $0.23 | 🧠 84.0k/200k (42%) | ⌛️ 55% (~3:45pm)  🌙 55% (~10:45pm, Feb 1)
```

`--no-emojis --no-bars`:
```
Opus | $0.23 | ctx: 84.0k/200k (42%) | 5h: 55% (~3:45pm)  7d: 55% (~10:45pm, Feb 1)
```

## settings.json Example

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js",
    "padding": 0
  }
}
```

If you want `subscription_usage_all` by default:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --segments=model,context,cost_session,subscription_usage_all",
    "padding": 0
  }
}
```

With display options:

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --segments=model,context,cost_session,subscription_usage_all --no-emojis --no-bars",
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

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `CCSTATUSLINE_SEGMENTS` | Segment order/visibility (CSV). | Uses default order |
| `CCSTATUSLINE_NO_EMOJIS` | `true`/`1` disables emojis. | `false` |
| `CCSTATUSLINE_NO_BARS` | `true`/`1` disables bars. | `false` |
| `CCSTATUSLINE_DEBUG` | `true`/`1` enables debug mode. | `false` |
| `CCSTATUSLINE_CACHE_DIR` | Cache directory path. | `~/.cache/cc-statusline-custom` |
| `CCSTATUSLINE_CACHE_TTL` | Cache TTL in seconds. | `60` |
| `CCSTATUSLINE_SUBSCRIPTION_CACHE_TTL` | Subscription cache TTL in seconds. | `60` |
| `CCSTATUSLINE_CONTEXT_LOW_THRESHOLD` | Context low threshold percentage. | `50` |
| `CCSTATUSLINE_CONTEXT_MEDIUM_THRESHOLD` | Context medium threshold percentage. | `80` |

## License

MIT. See `LICENSE`.
