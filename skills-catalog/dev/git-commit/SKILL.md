---
name: git-commit
description: Use when committing code: a one-line summary plus why the change was made, one logical change per commit
---

# Writing commit messages

## Rules
- One logical change per commit. If the change does two things, make two commits.
- Subject line: imperative mood, under 72 characters, no trailing period. "Add retry to upload", not "Added retry" or "Fixes".
- Blank line, then a body that explains **why** (the problem, the reason for this approach). The diff already shows what changed.
- Mention user-visible effects and anything a reviewer must know (migrations, config changes, breaking changes).
- Do not include secrets, tokens or personal data.

## Steps
1. `git status` and `git diff --staged` to see exactly what is included.
2. Stage only the files that belong to this change.
3. Write the message following the rules above.
4. Do not push unless the user asked for it.

## Example
```
Retry failed uploads up to three times

Uploads on slow networks failed on the first timeout and the user had to
start over. Retrying with a short backoff fixes most of these without
user action. Permanent errors (4xx) are not retried.
```
