---
name: git-commit
description: Generate high-quality Conventional Commit messages with an essential, non-filler body summary. Use for drafting commit messages from staged git changes in this repository.
metadata:
  short-description: Conventional commit message generator with meaningful body summary
---

# git-commit Skill

## Goal
Produce a Conventional Commit message that accurately reflects the staged changes, with a body that captures the essential improvements (no filler).

## Rules
- English-only output.
- Base the message on **staged** changes only (`git diff --cached`).
- Do not stage files automatically.
- Output only the commit message text unless the user explicitly asks for analysis.
- Avoid vague text ("update stuff", "minor changes"). Be specific.

## Context gathering (recommended)
- `git status --porcelain`
- `git diff --cached --stat`
- `git diff --cached`
- Optional: `git log -n 20 --oneline`

## Output format (required)
```
<type>(<scope>): <imperative summary>

- What: <specific change 1>
- What: <specific change 2>
- Why: <rationale / bug cause / user value>
- Impact: <behavior, perf, breaking, migration, none>

<optional footers>
```

## Subject line guidance
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`
- Use a meaningful scope when it helps; omit scope if unclear.
- Keep it short and action-oriented.

## Footers
- Add `Closes #NN` when clearly applicable.
- By default, append the AI attribution block after the What/Why/Impact summary as the final footer; omit only if the user explicitly asks to omit attribution.
- Use this exact block:
```
🤖 Assisted by [OpenAI Codex](https://github.com/openai/codex)

Co-Authored-By: Codex <codex@users.noreply.github.com>
```

## Final check
- Matches staged diff exactly.
- Body includes "What/Why/Impact" with no filler.
- English-only.
