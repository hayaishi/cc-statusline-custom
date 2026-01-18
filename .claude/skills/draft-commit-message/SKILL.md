---
name: draft-commit-message
description: Draft commit message only (generation-only). Use when the user asks to write a commit message, prepare a commit message draft, or summarize staged changes for git commit.
---

# draft-commit-message Skill

## Goal
Draft a Conventional Commit message only (generation-only) for the current change set, with a body that captures the *essential* improvements (no filler).

## Operating rules
- Repository language is **English-only** (subject, body, footers).
- Use **only staged changes** for the commit message. If nothing is staged, say so and suggest staging first.
- Do **not** run `git add` automatically or run `git commit`.
- Prefer precision over verbosity. Avoid vague phrases like "update", "tweak", "fix bug" unless you specify what and why.
- Output **only** the commit message text (ready to paste into `git commit -m` with a body), unless the user explicitly asks for analysis.

## How to gather context (when tools are available)
1. `git status --porcelain`
2. `git diff --cached --stat`
3. `git diff --cached`
4. Optional: `git log -n 20 --oneline` (to infer scope naming and style)

## Required output format
```
<type>(<scope>): <imperative summary>

- What: <specific change 1>
- What: <specific change 2>
- Why: <rationale / user value / bug cause>
- Impact: <behavioral change, perf, risk, migration, none>

<optional footers>
```

### Subject line rules
- Use Conventional Commit types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`.
- `<scope>` should be a meaningful area (e.g., `statusline`, `parser`, `cache`, `docs`). If unknown, omit scope: `<type>: <description>`.
- Keep the subject concise and action-oriented (imperative mood).

### Body rules (no filler)
The body **must** include an essential summary. At minimum include:
- **What** changed (concrete behavior or structure)
- **Why** it changed (intent / bug cause / user benefit)
- **Impact** (observable behavior, perf, breaking change, or explicitly "none")

### Footers
- If the diff references an issue/PR, add `Closes #NN` (or equivalent) when appropriate.
- By default, append the AI attribution block after the What/Why/Impact summary as the final footer; omit only if the user explicitly asks to omit attribution.
- Use this exact block and keep a blank line between the tool line and the `Co-Authored-By` line. `Co-Authored-By` must start at column 1.
```
🤖 Assisted by [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>
```
Do not include sensitive data (tokens, prompts, internal URLs).

## Quality checklist (before finalizing)
- Subject matches the actual change.
- Body contains "What/Why/Impact" and no filler.
- No secrets, no internal-only details.
- English-only.
