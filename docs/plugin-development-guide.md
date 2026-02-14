# Plugin Development Guide

This guide explains how to create effective plugins for cc-statusline-custom.

## Table of Contents

- [Plugin Architecture](#plugin-architecture)
- [Command Design Best Practices](#command-design-best-practices)
- [TTL Design Guidelines](#ttl-design-guidelines)
- [Advanced Features](#advanced-features)
- [Debugging Plugins](#debugging-plugins)
- [Constraints and Limits](#constraints-and-limits)

## Plugin Architecture

Understanding the plugin execution flow helps design efficient and reliable plugins.

### Execution Flow

```
┌─────────────────┐
│  Statusline     │
│  Render Request │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Read Plugin    │◄───── stale-while-revalidate
│  Cache          │       (never blocks)
└────────┬────────┘
         │
         ├──────► Cache fresh? ──► Display value
         │
         └──────► Cache stale? ──► Display cached value
                                   + spawn background update
                                        │
                                        ▼
                                  ┌──────────────┐
                                  │ Execute      │
                                  │ Plugin       │
                                  │ Command      │
                                  └──────┬───────┘
                                         │
                                         ▼
                                  ┌──────────────┐
                                  │ Write Cache  │
                                  └──────────────┘
```

### Key Principles

1. **Never blocks rendering:** Cache is always read synchronously; commands run asynchronously
2. **Fail-safe:** Command errors don't crash the statusline; `fallbackValue` is shown
3. **Project-aware:** Commands run in project root by default (from `workspace.project_dir`)
4. **Atomic updates:** Cache writes use temp file + rename for consistency

## Command Design Best Practices

### 1. Fast Execution

Keep commands fast to minimize background update overhead:

```yaml
# Good: ~10ms
- id: git_branch
  command: git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "-"
  ttl: 30

# Avoid: slow operations (multiple seconds)
- id: slow_status
  command: complex-analysis-tool --deep-scan
  ttl: 300
```

**Target:** < 100ms for typical commands

### 2. Single-Line Output

Only the **first line** of output is used. Ensure your command produces one line:

```yaml
# Good: explicitly gets first line
- id: git_commit
  command: git log -1 --format=%h 2>/dev/null | head -1

# Good: naturally produces single line
- id: current_user
  command: whoami
```

Output is automatically trimmed and truncated to `maxLength` (default: 32 characters).

### 3. Error Handling

Always handle errors gracefully:

```yaml
# Good: simple command (no pipeline) — || works correctly
- id: git_branch
  command: git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "-"
  fallbackValue: "-"

# Good: checks for file existence
- id: project_status
  command: test -f .status && cat .status || echo "unknown"
  fallbackValue: "unknown"

# Good: pipeline with explicit variable check (POSIX-safe)
- id: node_version
  command: |
    v=$(node -v 2>/dev/null)
    [ -n "$v" ] && printf '%s\n' "${v#v}" || echo "-"
  fallbackValue: "-"
```

> **Note:** In POSIX `/bin/sh`, `||` after a pipeline checks only the **last** command's exit status.
> `cmd1 | cmd2 || echo fallback` will not trigger the fallback if `cmd1` fails but `cmd2` succeeds
> (with empty input). Use explicit variable assignment and `[ -n ]` checks instead.

**Redirect stderr** to avoid noise:

```bash
command: some-tool 2>/dev/null || echo "fallback"
```

### 4. Portable Shell Commands

Commands run via `/bin/sh -c`, **not bash**. Use POSIX-compatible syntax:

```yaml
# Good: POSIX shell
- id: status
  command: |
    if [ -f .status ]; then
      cat .status
    else
      echo "none"
    fi

# Avoid: bash-specific features
- id: status
  command: |
    [[ -f .status ]] && cat .status || echo "none"  # [[ ]] is bash-specific
```

### 5. Environment Variables

The shell environment is minimal. Don't rely on:
- `~/.bashrc`, `~/.zshrc` not sourced
- Custom PATH modifications may not be present
- Shell aliases don't work

**Solution: Use absolute paths or explicit commands:**

```yaml
# Good: explicit variable check (POSIX-safe pipeline fallback)
- id: node_version
  command: |
    v=$(node -v 2>/dev/null)
    [ -n "$v" ] && printf '%s\n' "${v#v}" || echo "-"

# Good: absolute path (simple command — || works correctly)
- id: custom_tool
  command: /usr/local/bin/custom-tool --version 2>/dev/null || echo "-"
```

## TTL Design Guidelines

Choosing the right TTL balances data freshness and performance.

### TTL Decision Matrix

| Data Change Frequency | Recommended TTL | Example |
|-----------------------|-----------------|---------|
| Constant (per-session) | 3600 + `session_start` | Node.js version, OS info |
| Very rarely (minutes) | 300-600 | Package versions, configuration |
| Infrequently (tens of seconds) | 30-60 | Git branch, commit hash |
| Frequently (seconds) | 5-10 | Git dirty status, system load |
| Constantly (sub-second) | Not recommended | Use TTL=5 minimum |

### TTL=0 vs. Low TTL

```yaml
# TTL=0: refresh every session, never cached
- id: always_fresh
  command: date +%s
  ttl: 0

# TTL=5: refresh every 5 seconds, cached between
- id: mostly_fresh
  command: date +%s
  ttl: 5
```

**Recommendation:** Prefer TTL≥5 over TTL=0 for better performance.

### Session-Start Refresh

Use `refreshOn: "session_start"` for data that's constant during a Claude Code session:

```yaml
- id: env_info
  command: echo "$NODE_ENV $(node -v)"
  emoji: "🔧"
  ttl: 3600
  refreshOn: session_start
```

This plugin:
- Updates when a new Claude Code session starts
- Also updates every 3600 seconds (1 hour) as a fallback
- Ideal for environment information

## Advanced Features

### Multi-Line Commands

Use YAML's `|` for multi-line commands:

```yaml
- id: git_status
  command: |
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
    [ -z "$branch" ] && echo "-" && exit
    [ -n "$(git status --porcelain 2>/dev/null)" ] && branch="$branch*"
    echo "$branch"
  emoji: "🌿"
  ttl: 10
```

### Working Directory

Control where the command runs:

```yaml
# Default: runs in project root (workspace.project_dir)
- id: project_files
  command: ls -1 | wc -l
  ttl: 60

# Explicit working directory
- id: home_files
  command: ls -1 | wc -l
  workingDir: /Users/username
  ttl: 60
```

### Output Formatting

Shape the output to fit the statusline:

```yaml
# Format with awk (macOS-only, with platform guard)
- id: cpu
  command: |
    [ "$(uname -s)" = "Darwin" ] || { echo "-"; exit; }
    v=$(top -l 1 2>/dev/null | grep "CPU usage" | awk '{print $3}')
    [ -n "$v" ] && echo "$v" || echo "-"
  emoji: "💻"
  ttl: 5

# Format with parameter expansion (POSIX-safe)
- id: node_version
  command: |
    v=$(node -v 2>/dev/null)
    [ -n "$v" ] && printf '%s\n' "${v#v}" || echo "-"
  emoji: "📦"
  ttl: 3600

# Combine multiple tools (with explicit check)
- id: disk_usage
  command: |
    v=$(df -h / 2>/dev/null | tail -1 | awk '{print $5}')
    [ -n "$v" ] && echo "$v" || echo "-"
  emoji: "💾"
  ttl: 60
```

### Timeout Control

Adjust timeout based on expected command duration:

```yaml
# Fast command: short timeout
- id: git_branch
  command: git rev-parse --abbrev-ref HEAD
  timeout: 1000  # 1 second
  ttl: 30

# Slower command: longer timeout
- id: test_status
  command: npm test 2>&1 | grep -c PASS
  timeout: 10000  # 10 seconds
  ttl: 300
```

**Max timeout:** 30000ms (30 seconds)

### Length Limits

Control output truncation:

```yaml
# Short output
- id: status_code
  command: cat .status-code
  maxLength: 8
  ttl: 60

# Longer output
- id: description
  command: cat .description
  maxLength: 64  # Longer than default 32
  ttl: 60
```

## Debugging Plugins

### Enable Debug Logging

```bash
node dist/index.js --debug --config=your-config.yml --segments=:your_plugin
```

Debug log location: `~/.cache/cc-statusline-custom/debug.log`

### Debug Log Format

Each line is a JSON object:

```json
{"level":"info","timestamp":"2024-02-09T12:00:00.000Z","message":"Plugin execution","plugin":"git_branch","result":"main*"}
{"level":"error","timestamp":"2024-02-09T12:00:01.000Z","message":"Plugin command failed","plugin":"cpu","error":"Command not found"}
```

### Inspect Logs with jq

```bash
# View recent plugin executions
tail -100 ~/.cache/cc-statusline-custom/debug.log | jq 'select(.plugin != null)'

# Find errors
cat ~/.cache/cc-statusline-custom/debug.log | jq 'select(.level == "error")'

# Track specific plugin
cat ~/.cache/cc-statusline-custom/debug.log | jq 'select(.plugin == "git_branch")'
```

See [debug-logging.md](./debug-logging.md) for comprehensive logging documentation.

### Manual Command Testing

Test plugin commands directly in shell:

```bash
# Navigate to project directory
cd /path/to/project

# Run the exact command
/bin/sh -c 'git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "-"'

# Measure execution time
time /bin/sh -c 'git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "-"'
```

### Cache Inspection

Plugin caches are stored at:

```
~/.cache/cc-statusline-custom/plugins/<workdir_hash>/<plugin_id>.json
```

View cache contents:

```bash
# Find plugin cache
find ~/.cache/cc-statusline-custom/plugins -name "git_branch.json"

# View cache
cat ~/.cache/cc-statusline-custom/plugins/abc12345/git_branch.json | jq .
```

Cache structure:

```json
{
  "value": "main*",
  "updatedAt": "2024-02-09T12:00:00.000Z",
  "error": null,
  "sessionId": "abc123def456"
}
```

## Constraints and Limits

Be aware of these system constraints:

| Constraint | Limit | Reason |
|------------|-------|--------|
| Command timeout | 30000ms (30s) | Prevent indefinite hangs |
| Max output length | Configurable (default: 32 chars) | Statusline space constraints |
| Cache max age | 600s (10 minutes) | Prevent extremely stale data |
| Plugin ID format | `[a-zA-Z0-9_-]+` | Filesystem safety |
| Cache file size | 4096 bytes | Prevent cache bloat |
| Shell | `/bin/sh` | POSIX compatibility |

### Security Considerations

1. **Command injection:** Avoid user input in commands
2. **File permissions:** Cache files are `0o600` (user-only read/write)
3. **Working directory:** Validate `workingDir` if user-configurable
4. **Resource limits:** Commands can consume CPU/memory until timeout

### Performance Guidelines

- Keep commands under 100ms when possible
- Use appropriate TTL to avoid over-polling
- Prefer built-in shell commands over external tools
- Test commands on slower systems

## Examples Collection

### Git Plugins

```yaml
# Current branch
- id: git_branch
  command: git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "-"
  emoji: "🌿"
  ttl: 30

# Commit hash (short)
- id: git_commit
  command: git rev-parse --short HEAD 2>/dev/null || echo "-"
  emoji: "📌"
  ttl: 60

# Uncommitted changes count
- id: git_changes
  command: git status --porcelain 2>/dev/null | wc -l | tr -d ' '
  emoji: "📝"
  ttl: 10
```

### System Information

```yaml
# CPU usage (macOS)
- id: cpu
  command: |
    [ "$(uname -s)" = "Darwin" ] || { echo "-"; exit; }
    v=$(top -l 1 2>/dev/null | grep "CPU usage" | awk '{print $3}')
    [ -n "$v" ] && echo "$v" || echo "-"
  emoji: "💻"
  ttl: 5

# Memory usage (macOS)
- id: memory
  command: |
    [ "$(uname -s)" = "Darwin" ] || { echo "-"; exit; }
    v=$(top -l 1 2>/dev/null | grep PhysMem | awk '{print $2}')
    [ -n "$v" ] && echo "$v" || echo "-"
  emoji: "🧠"
  ttl: 10

# Disk usage
- id: disk
  command: |
    v=$(df -h / 2>/dev/null | tail -1 | awk '{print $5}')
    [ -n "$v" ] && echo "$v" || echo "-"
  emoji: "💾"
  ttl: 60
```

### Development Environment

```yaml
# Node.js version
- id: node_version
  command: |
    v=$(node -v 2>/dev/null)
    [ -n "$v" ] && printf '%s\n' "${v#v}" || echo "-"
  emoji: "📦"
  ttl: 3600
  refreshOn: session_start

# Python version
- id: python_version
  command: |
    v=$(python3 --version 2>&1 | awk '{print $2}')
    [ -n "$v" ] && echo "$v" || echo "-"
  emoji: "🐍"
  ttl: 3600
  refreshOn: session_start

# Docker status (simple command — || works correctly)
- id: docker_status
  command: docker info >/dev/null 2>&1 && echo "up" || echo "down"
  emoji: "🐳"
  ttl: 30
```

### Project-Specific

```yaml
# Test count
- id: test_count
  command: find tests -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' '
  emoji: "🧪"
  ttl: 300

# Coverage percentage
- id: coverage
  command: |
    v=$(cat coverage/coverage-summary.json 2>/dev/null | jq -r '.total.lines.pct' 2>/dev/null)
    [ -n "$v" ] && [ "$v" != "null" ] && echo "${v}%" || echo "-"
  emoji: "📊"
  ttl: 300

# Last deploy timestamp
- id: last_deploy
  command: cat .last-deploy 2>/dev/null || echo "never"
  emoji: "🚀"
  ttl: 60
```

## Next Steps

- **Use plugins:** See [plugin-usage-guide.md](./plugin-usage-guide.md)
- **Debug issues:** See [debug-logging.md](./debug-logging.md)
- **Share plugins:** Consider contributing useful plugins to the repository
