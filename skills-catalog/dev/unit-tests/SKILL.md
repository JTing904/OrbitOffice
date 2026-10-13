---
name: unit-tests
description: Use when writing automated tests: normal cases first, then edge cases and errors, and make sure the tests actually run
---

# Writing unit tests

## Steps
1. Find the project's test setup (package.json scripts, pytest.ini, existing tests folder) and follow it. Do not introduce a new framework if one exists.
2. For each function under test, write cases in this order:
   - the normal, expected use;
   - edge cases: empty input, zero, one item, very large values, unicode text, missing optional fields;
   - errors: invalid input, failing dependencies (mock network, file system, time).
3. One behaviour per test, with a name that says it: `returns empty list when no orders`.
4. Tests must not depend on each other, on the current date, on network, or on files outside a temp folder.
5. Run the tests if commands are allowed. Report the exact command and the result. If a test fails because the code is wrong, do not change the test to pass — report the bug.

## Good test shape
Arrange (set up input) → Act (call once) → Assert (check the result, and only what matters).
