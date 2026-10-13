---
name: code-review
description: Use when reviewing code changes: check correctness, security, performance and readability by severity, with concrete fixes
---

# Code review checklist

Write the review in the user's language. Review the change, not the whole codebase.

## Order of checks (most important first)
1. **Correctness** — does it do what the task asked? Off-by-one errors, wrong conditions, unhandled empty/null input, wrong async handling, race conditions.
2. **Security** — user input reaching SQL, shell commands, file paths or HTML without escaping; secrets in code; missing permission checks.
3. **Data safety** — can it delete or overwrite data by mistake? Are errors swallowed silently?
4. **Performance** — work inside loops that could be done once, N+1 queries, reading whole large files into memory.
5. **Readability** — unclear names, functions doing several things, duplicated code, comments that no longer match the code.

## How to report
- One entry per problem: severity (blocker / should fix / nit), file and line, what is wrong, and the concrete fix.
- Blockers first. Do not pad the list with style nits.
- Say what is good only if it helps (e.g. "the retry logic is right; keep it").
- If you are not sure something is a bug, say why and what would confirm it.
