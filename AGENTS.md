# AGENTS.md - ccusage-statusline-custom Development Guidelines

> **About this document**: This file defines ground rules for Claude Code, GitHub Copilot, Cursor, other AI coding assistants, and human developers working on this project.

---

## 🎯 Project Overview

**ccusage-statusline-custom** integrates ccusage usage statistics into Claude Code's `/statusline` feature.

### Primary Goals

1. **Reliability**: Statusline must ALWAYS produce output (no silent failures)
2. **Performance**: Response within 300ms
3. **Cross-platform**: Works on macOS and Linux
4. **Maintainability**: TDD-based quality assurance, clear code structure

> **Language note**: This repository is English-only. See **Language Rules** near the end of this document.

---

## 📋 Development Rules

### 1. Coding Standards

#### Language: TypeScript (ESModules)

```typescript
// ✅ Good
export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

// ❌ Bad - CommonJS
module.exports = { formatCost };
```

#### Naming Conventions

| Target | Convention | Example |
|--------|------------|---------|
| File names | kebab-case | `progress-bar.ts` |
| Classes | PascalCase | `CacheManager` |
| Functions/Variables | camelCase | `getCachedData` |
| Constants | SCREAMING_SNAKE_CASE | `DEFAULT_TTL_SECONDS` |
| Types/Interfaces | PascalCase | `ClaudeCodeInput` |
| Environment variables | SCREAMING_SNAKE_CASE with prefix | `CCUSAGE_CACHE_TTL` |

#### Import Order

```typescript
// 1. Node.js built-ins
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// 2. External packages
import { describe, it, expect } from 'vitest';

// 3. Internal absolute imports
import { CacheManager } from '@/core/cache';

// 4. Internal relative imports
import { formatTime } from './utils';

// 5. Types (type-only imports)
import type { ClaudeCodeInput } from '@/types';
```

### 2. Error Handling Principles

#### ⚠️ CRITICAL RULE: Statusline must NEVER be silent

```typescript
// ✅ Good - Always produce output
export async function generateStatusline(input: string): Promise<string> {
  try {
    const data = parseInput(input);
    return await buildStatusline(data);
  } catch (error) {
    // Log for debugging, but ALWAYS return a fallback
    console.error('[ccusage-statusline-custom]', error);
    return '🤖 ? | ⏳ Loading...';
  }
}

// ❌ Bad - Can exit silently
export async function generateStatusline(input: string): Promise<string> {
  const data = JSON.parse(input); // Throws on invalid JSON
  return await buildStatusline(data);
}
```

#### Error Recovery Hierarchy

1. **Immediate recovery**: Use default values and continue
2. **Delayed recovery**: Use cached data
3. **Unrecoverable**: Output fallback display

### 3. Test-Driven Development (TDD)

#### TDD Cycle

```
1. RED   - Write a failing test
2. GREEN - Write minimal code to pass the test
3. REFACTOR - Improve code while keeping tests passing
```

#### Test File Placement

```
src/
├── core/
│   ├── parser.ts
│   └── parser.test.ts      # Unit tests next to implementation
tests/
├── integration/
│   └── statusline.test.ts  # Integration tests in tests/
└── fixtures/
    └── sample-input.json   # Test data
```

#### Test Naming Convention

```typescript
describe('parseClaudeCodeInput', () => {
  // Format: "should <expected behavior> when <condition>"
  it('should return model display name when present', () => {});
  it('should fallback to model id when display name is missing', () => {});
  it('should return "?" when model is completely missing', () => {});
});
```

#### Coverage Requirements

| Type | Minimum Coverage |
|------|------------------|
| Unit tests | 80% |
| Integration tests | 100% of main paths |

### 4. Git Workflow

#### Branch Naming

```
feature/<issue-number>-<short-description>
fix/<issue-number>-<short-description>
refactor/<description>
docs/<description>
test/<description>
```

#### Commit Messages (Conventional Commits)

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Refactoring
- `test`: Test additions/modifications
- `docs`: Documentation
- `chore`: Build/configuration changes
- `perf`: Performance improvements

**Example:**
```
feat(oauth): add macOS keychain token retrieval

- Implement security CLI wrapper for keychain access
- Add fallback to config file when keychain fails
- Include timeout handling for slow keychain responses

Closes #42
```

#### AI Agent Attribution (Recommended)

If an AI coding assistant made a meaningful contribution to the change, we recommend adding an attribution footer in the commit body when feasible.

- Prefer **Co-Authored-By** for substantial pair-programming contributions.
- If co-authoring is not appropriate, add a short `Generated with ...` line instead.
- Keep attribution **non-sensitive** (no tokens, prompts, internal URLs).

When using **Co-Authored-By**, prefer an email that GitHub can map to a real account (e.g., a GitHub no-reply address like `<username>@users.noreply.github.com>`).

**Example (Claude Code):**

```text
🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Example (GitHub Copilot):**

```text
🤖 Assisted by [GitHub Copilot](https://github.com/features/copilot)

Co-Authored-By: GitHub Copilot <copilot@users.noreply.github.com>
```

**Example (OpenAI Codex):**

```text
🤖 Assisted by [OpenAI Codex](https://github.com/openai/codex)

Co-Authored-By: Codex <codex@users.noreply.github.com>
```

**Example (Gemini CLI):**

```text
🤖 Assisted by [Gemini CLI](https://github.com/google-gemini/gemini-cli)

Co-Authored-By: Gemini CLI <gemini-cli@users.noreply.github.com>
```

### 5. Dependency Management

#### Rules for Adding Dependencies

1. **Necessity**: Can it be implemented in-house?
2. **Bundle size**: Keep minimal, following ccusage's approach
3. **Maintenance status**: Last update within 1 year
4. **Security**: No warnings from `npm audit`

#### Recommended Packages

| Purpose | Package |
|---------|---------|
| CLI argument parsing | `citty` or `commander` |
| ANSI colors | `picocolors` (ultra-lightweight) |
| JSON schema | `zod` (with type inference) |
| Lock management | `proper-lockfile` |
| Testing | `vitest` |

#### Prohibited Packages

- `chalk` (heavy, use picocolors)
- `moment` (heavy, use date-fns or custom implementation)
- `lodash` (hard to tree-shake, use es-toolkit or custom implementation)

---

## 🏗️ Architecture Guidelines

### Directory Structure

```
ccusage-statusline-custom/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── types/                # Type definitions
│   │   ├── claude-code.ts    # Claude Code input types
│   │   ├── ccusage.ts        # ccusage output types
│   │   └── config.ts         # Configuration types
│   ├── core/                 # Core logic
│   │   ├── parser.ts         # Input parser
│   │   ├── cache.ts          # Cache management
│   │   ├── oauth.ts          # OAuth API
│   │   └── statusline.ts     # Output generation
│   ├── presets/              # Preset configurations
│   │   ├── percentage.ts     # Block usage percentage display
│   │   ├── simple.ts         # Simple display
│   │   └── full.ts           # Full-featured display
│   └── utils/                # Utilities
│       ├── colors.ts         # ANSI colors
│       ├── progress-bar.ts   # Progress bar
│       └── time.ts           # Time processing
├── tests/
│   ├── integration/          # Integration tests
│   └── fixtures/             # Test data
├── scripts/                  # Build/deploy scripts
└── legacy/                   # Old shell scripts (for reference)
```

### Dependency Direction

```
        ┌─────────┐
        │   CLI   │  (entry point)
        └────┬────┘
             │
        ┌────▼────┐
        │ Presets │  (preset configurations)
        └────┬────┘
             │
        ┌────▼────┐
        │  Core   │  (core logic)
        └────┬────┘
             │
        ┌────▼────┐
        │  Utils  │  (utilities)
        └────┬────┘
             │
        ┌────▼────┐
        │  Types  │  (type definitions only)
        └─────────┘

※ Dependencies flow top-to-bottom only
※ Circular references are prohibited
```

---

## 🔒 Security Guidelines

### Handling Sensitive Information

1. **OAuth tokens**: Keep in memory only, never log
2. **Cache files**: Use `600` permissions (owner read/write only)
3. **Environment variables**: Mask sensitive values in logs

```typescript
// ✅ Good
console.log(`Token: ${token.slice(0, 4)}...${token.slice(-4)}`);

// ❌ Bad
console.log(`Token: ${token}`);
```

### Input Validation

Validate all external input (stdin, environment variables, files).

```typescript
import { z } from 'zod';

const InputSchema = z.object({
  model: z.object({
    id: z.string().optional(),
    display_name: z.string().optional(),
  }).optional(),
  // ...
});

export function parseInput(raw: string): ClaudeCodeInput {
  try {
    const json = JSON.parse(raw);
    return InputSchema.parse(json);
  } catch {
    return getDefaultInput();
  }
}
```

---

## 🌐 Language Rules

**All repository content must be in English:**

- Source code and comments
- Variable names, function names, class names
- Commit messages (Conventional Commits format)
- Documentation (README, CHANGELOG, etc.)
- Issues and Pull Requests
- Error messages and log output

---

## 🤖 Notes for AI Agents

This section applies to all AI coding assistants working on this project:

- **Claude Code** (Anthropic)
- **Gemini CLI** (Google)
- **Codex CLI** (OpenAI)
- **GitHub Copilot**
- **Cursor**
- **Windsurf**
- **Aider**
- **Other AI coding assistants**

### General Instructions

1. **When generating code**: Always generate tests simultaneously
2. **When modifying existing code**: Don't forget to update related tests
3. **When uncertain**: Don't guess - refer to this file or related documentation
4. **Breaking changes**: Mark explicitly in PR, record in CHANGELOG
5. **Before starting work**: Read this AGENTS.md file completely
6. **Context awareness**: Check existing code patterns before implementing new features

### Task Request Template

Use this format when requesting tasks from AI:

```markdown
## Task
[What to do]

## Background
[Why it's needed]

## Constraints
[Rules to follow]

## Expected Output
[Files to generate / changes to make]

## References
[Related files / documentation]
```

### Prohibited Practices

1. ❌ Using `any` type (use `unknown` with type guards)
2. ❌ Leaving `console.log` debug statements (use dedicated logger)
3. ❌ Hardcoded secrets
4. ❌ Adding features without tests
5. ❌ Using `set -e` in shell scripts (for statusline purposes)
6. ❌ Non-English content in repository files

### Agent-Specific Notes

#### Claude Code
- Use `/cost` to monitor token usage during long sessions
- Leverage `CLAUDE.md` if present for project-specific context

#### Gemini CLI
- Respect the `GEMINI.md` file if present for additional context
- Use `@workspace` for codebase-wide understanding

#### Codex CLI
- Follow the `AGENTS.md` conventions (this file)
- Use `--model` flag appropriately for complex tasks

#### GitHub Copilot / Cursor / Windsurf
- Refer to this file when workspace instructions are needed
- Follow existing code patterns visible in the codebase

---

## 📚 Reference Documentation

### External Resources

- [Claude Code Statusline Official Docs](https://code.claude.com/docs/en/statusline)
- [ccusage GitHub](https://github.com/ryoppippi/ccusage)
- [ccusage Statusline Guide](https://ccusage.com/guide/statusline)

### Project Documentation

- `README.md` - User documentation
- `CHANGELOG.md` - Change history
- `CONTRIBUTING.md` - Contribution guide (to be created)

---

## 📝 Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-18 | 1.0.0 | Initial version |

---

> **Note**: This is a living document. Update it as the project evolves.
> Change proposals are accepted via Issues or PRs.
