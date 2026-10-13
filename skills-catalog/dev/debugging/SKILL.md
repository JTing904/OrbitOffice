---
name: debugging
description: Use when fixing a bug: reproduce it, narrow it down to the root cause, fix, verify and prevent it coming back
---

# Systematic debugging

## Steps
1. **Reproduce**: write down the exact steps, input and the wrong vs. expected result. If you cannot reproduce it, say so and ask for details instead of guessing.
2. **Read the error**: the full message and stack trace; find the first line that is in the project's own code.
3. **Narrow down**: check assumptions one at a time (log values, run a smaller input, comment out parts). Change one thing at a time.
4. **Find the root cause**, not just the line that crashed: why did the bad value get there?
5. **Fix** the cause with the smallest change that is clearly right. Do not refactor unrelated code in the same fix.
6. **Verify**: run the reproduction again; run the existing tests. Add a test that would have caught this bug.
7. **Report**: cause, fix, how you verified it, and anything you could not verify.
