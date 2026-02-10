# Plugin Usage Guide

This guide explains how to use and configure plugins for cc-statusline-custom.

## Table of Contents

- [Quick Start](#quick-start)
- [Using Presets](#using-presets)
- [Configuration Reference](#configuration-reference)
- [Adding Plugins to Segments](#adding-plugins-to-segments)
- [Cache Behavior](#cache-behavior)
- [Troubleshooting](#troubleshooting)

## Quick Start

The fastest way to get started is to use the provided preset configuration:

### 1. Use the preset file

```bash
# From the repository root
node dist/index.js --config=config.presets.yml --segments=model,:git_branch,cost_session,context
```

### 2. Configure Claude Code settings.json

```json
{
  "statusLine": {
    "type": "command",
    "command": "/path/to/cc-statusline-custom/dist/index.js --config=/path/to/cc-statusline-custom/config.presets.yml --segments=model,:git_branch,cost_session,context",
    "padding": 0
  }
}
```

### 3. Result

```
🤖 Opus | 🌿 main* | 💰 $0.23 | 🧠 84.0k/200k [███░░░░░] (42%)
```

## Using Presets

The `config.presets.yml` file includes ready-to-use plugins:

| Plugin ID | Description | Emoji | Update Frequency |
|-----------|-------------|-------|------------------|
| `git_branch` | Current git branch with dirty indicator (`*`) | 🌿 | Every 10 seconds |
| `git_commit` | Short commit hash (7 chars) | 📌 | Every 60 seconds |
| `node_version` | Node.js version | 📦 | Once per session |
| `cpu` | CPU usage (macOS only) | 💻 | Every 5 seconds |

### Customize the preset file

You can edit `config.presets.yml` to:

1. **Comment out unused plugins:**

```yaml
plugins:
  - id: git_branch
    command: git rev-parse --abbrev-ref HEAD
    emoji: "🌿"
    ttl: 10

  # Disable CPU monitoring
  # - id: cpu
  #   command: top -l 1 | grep "CPU usage" | awk '{print $3}'
  #   emoji: "💻"
  #   ttl: 5
```

2. **Adjust TTL values:**

```yaml
  - id: git_branch
    command: git rev-parse --abbrev-ref HEAD
    emoji: "🌿"
    ttl: 30  # Changed from 10 to 30 seconds
```

3. **Change emojis or add text alternatives:**

```yaml
  - id: git_branch
    command: git rev-parse --abbrev-ref HEAD
    emoji: "🔀"  # Changed emoji
    alt: "git"   # Added text alternative for --no-emojis mode
    ttl: 10
```

## Configuration Reference

### Plugin Configuration Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | Yes | string | Unique identifier (alphanumeric, `-`, `_`). Used as `:<id>` in segments |
| `command` | Yes | string | Shell command to execute via `/bin/sh -c` |
| `ttl` | Yes | number | Cache time-to-live in seconds. `0` = always refresh |
| `emoji` | No | string | Emoji prefix (hidden with `--no-emojis`) |
| `alt` | No | string | Text prefix when `--no-emojis` is set |
| `fallbackValue` | No | string | Display value when cache is missing or stale (default: `…`) |
| `maxLength` | No | number | Maximum output length in characters (default: 32) |
| `timeout` | No | number | Command timeout in milliseconds (default: 5000, max: 30000) |
| `workingDir` | No | string | Working directory for command execution (default: project root) |
| `refreshOn` | No | string | Special refresh timing: `"session_start"` |

### Example Configuration

```yaml
plugins:
  - id: custom_status
    command: cat .project-status 2>/dev/null || echo "ready"
    emoji: "✅"
    alt: "status"
    fallbackValue: "unknown"
    maxLength: 16
    timeout: 3000
    ttl: 60
```

## Adding Plugins to Segments

Plugin segments are prefixed with `:` (colon).

### Basic Usage

```bash
# Single plugin
--segments=model,:git_branch,cost_session

# Multiple plugins
--segments=model,:git_branch,:node_version,cost_session,context
```

### Order Control

Plugins appear in the order specified:

```bash
# Git branch first, then built-in segments
--segments=:git_branch,model,cost_session,context

# Built-in segments first, then plugins
--segments=model,cost_session,:git_branch,:cpu,context
```

### Environment Variable

Set default segments via environment variable:

```bash
export CCSTATUSLINE_SEGMENTS="model,:git_branch,cost_session,context"
```

CLI flags override environment variables:

```bash
# Uses CLI segments, ignoring environment variable
node dist/index.js --segments=model,context
```

## Cache Behavior

Understanding cache behavior helps optimize plugin performance and freshness.

### TTL (Time-To-Live)

The `ttl` field controls how often the plugin command is executed:

| TTL Value | Behavior | Use Case |
|-----------|----------|----------|
| `0` | No caching, always refresh | Real-time data that changes constantly |
| `5-10` | Very frequent updates | Fast-changing data (CPU, memory) |
| `30-60` | Frequent updates | Moderately changing data (git status) |
| `300-600` | Infrequent updates | Slow-changing data (versions, configuration) |
| `3600+` | Rare updates | Static or session-scoped data |

### Stale-While-Revalidate Pattern

Plugins use a stale-while-revalidate strategy:

1. **First render:** Shows `fallbackValue` if cache is missing
2. **Background update:** Command runs in background to populate cache
3. **Subsequent renders:** Shows cached value while refreshing in background when TTL expires

This ensures the statusline **never blocks** waiting for plugin commands.

### Maximum Cache Age

Even with stale-while-revalidate, caches older than **10 minutes** are rejected and trigger a refresh. This prevents showing extremely outdated data.

### Session-Based Refresh

Use `refreshOn: "session_start"` to update once per Claude Code session:

```yaml
  - id: node_version
    command: node -v | sed 's/^v//'
    emoji: "📦"
    ttl: 3600
    refreshOn: session_start
```

This plugin:
- Updates when Claude Code starts a new session
- Also respects `ttl` for time-based refresh
- Ideal for environment data that's constant during a session

### Background Updates

When a cache expires:

1. The statusline prints immediately with the current (possibly stale) cache
2. A background process spawns to refresh stale plugin caches
3. Next statusline render uses the updated cache

Disable background updates with `--disable-bg-update` (not recommended).

## Troubleshooting

### Plugin Shows Fallback Value

**Possible causes:**

1. **Command failed:** Check command syntax and test it manually in shell
2. **Timeout:** Command took longer than `timeout` milliseconds
3. **Cache not yet populated:** First run shows fallback, subsequent runs show actual value

**Debug steps:**

```bash
# Enable debug logging
node dist/index.js --debug --config=config.presets.yml --segments=:your_plugin

# Check debug log
tail -f ~/.cache/cc-statusline-custom/debug.log
```

See [debug-logging.md](./debug-logging.md) for detailed logging guide.

### Plugin Not Appearing

**Checklist:**

1. ✅ Plugin ID uses valid characters: `[a-zA-Z0-9_-]+`
2. ✅ Segment includes `:` prefix: `--segments=:plugin_id`
3. ✅ Config file path is correct and accessible
4. ✅ YAML syntax is valid (no tab characters, proper indentation)

**Test the config file:**

```bash
# This should show the plugin segment
node dist/index.js --config=config.presets.yml --segments=:git_branch
```

### Command Works in Shell But Not in Plugin

**Common issues:**

1. **Environment differences:** Plugins run via `/bin/sh -c`, which may have different PATH or environment than your interactive shell
2. **Working directory:** Ensure `workingDir` is set correctly if command depends on location
3. **Shell features:** Avoid bash-specific syntax; stick to POSIX shell

**Solution: Make commands explicit:**

```yaml
# Bad: relies on PATH and bash features
command: nvm current

# Good: uses explicit variable check (POSIX-safe)
command: |
  v=$(node -v 2>/dev/null)
  [ -n "$v" ] && printf '%s\n' "${v#v}" || echo "-"
```

### Performance Issues

If the statusline feels slow:

1. **Check command performance:** Run commands manually and measure time
2. **Adjust TTL:** Increase `ttl` for expensive commands
3. **Use session_start:** For static data, use `refreshOn: "session_start"`
4. **Reduce timeout:** Lower `timeout` for fast-fail behavior

### Working Directory Issues

If your command needs a specific directory:

```yaml
  - id: project_info
    command: cat .project-info
    workingDir: /path/to/project
    ttl: 60
```

Or use absolute paths in the command:

```yaml
  - id: project_info
    command: cat /path/to/project/.project-info 2>/dev/null || echo "-"
    ttl: 60
```

## Next Steps

- **Create custom plugins:** See [plugin-development-guide.md](./plugin-development-guide.md)
- **Debug plugin issues:** See [debug-logging.md](./debug-logging.md)
- **Understand the architecture:** See main README.md for system design
