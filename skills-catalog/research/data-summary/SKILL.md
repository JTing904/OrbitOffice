---
name: data-summary
description: Use when turning a table or CSV into findings: check the data first, compute key numbers, explain the findings in tables and plain words
---

# Data summary

Write in the user's language.

## Steps
1. **Inspect** the data: columns, number of rows, date range, missing or odd values. Report problems before analysing.
2. **Compute** with a script when commands are allowed (Python or Node); otherwise only for small data you can count reliably. Show the script you used.
3. Key numbers: totals, averages, changes over time, top and bottom items, anything unusual.
4. **Explain**: 3-5 findings, each one sentence plus the supporting number. Say what the data cannot tell.

## Output
docs/analysis/<topic>-<date>.md with a summary, small tables (not huge dumps), and the method.

## Rules
- Never round in a way that changes the conclusion; show units.
- Do not claim causes from correlations.
