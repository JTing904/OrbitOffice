---
name: github-release
description: Use when publishing a new version on GitHub: checks, tag, release notes and uploading build files, confirming each step
---

# Publishing a GitHub release

Needs commands allowed and the GitHub CLI (gh) logged in. Pushing and creating releases always ask the user first.

## Steps
1. **Check the state**: `git status` must be clean; `git branch --show-current` is the branch the user wants to release from; `gh auth status` is logged in.
2. **Pick the version**: read the current version (package.json or similar) and the last tag (`git describe --tags --abbrev=0`). Follow semantic versioning: fixes → patch, new features → minor, breaking changes → major. If unsure, ask the user.
3. **Write release notes** from `git log <last-tag>..HEAD --oneline`: group into New, Improved, Fixed; write for users, not developers; mention anything they must do when upgrading.
4. **Build** the artifacts the project ships (follow the README or package.json scripts) and check the files exist.
5. **Tag and push**: `git tag vX.Y.Z` then `git push origin vX.Y.Z`.
6. **Create the release**: `gh release create vX.Y.Z <files> --title "vX.Y.Z" --notes-file <notes.md>`. Use `--draft` unless the user said to publish directly.
7. Report the release URL and what was uploaded.

## Never
- Force-push, delete tags, or release from a dirty working tree.
- Upload files containing secrets (.env, keys).
