# Repository instructions

These instructions apply to every human or coding agent working in this
repository.

## Required Git workflow

- Never commit or push directly to `main`.
- Before editing, confirm the worktree state and current branch.
- Start each feature, fix, refactor, test, docs, or chore change from an
  up-to-date `main`.
- Use a dedicated branch following `CONTRIBUTING.md`.
- Keep the branch focused on one coherent change.
- Run the relevant tests and the complete quality check before publishing.
- Push the branch and merge it through a pull request.
- Do not bypass branch protection or use force-push.
- After merge, switch to `main`, pull with `--ff-only`, delete the merged local
  branch with `git branch -d`, and prune remote-tracking branches.

## Implementation rules

- Use English for code, identifiers, comments, commit subjects, and PR titles.
- Add or update tests before completing behavior changes.
- Keep comments sparse and explain invariants or non-obvious protocol behavior.
- Preserve existing user data and avoid destructive migrations.
- Keep Threadleaf independent from Claudian data, modules, and application
  structure.
- Do not commit `main.js`, Vault data, local Obsidian branding assets, secrets,
  or machine-specific settings.

## Required checks

Before opening or updating a PR, run:

`npm run typecheck && npm test && npm run build`
