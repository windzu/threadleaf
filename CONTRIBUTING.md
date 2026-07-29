# Contributing to Threadleaf

Threadleaf uses a pull-request-only development workflow. The `main` branch is
protected and must always remain releasable.

## Branch workflow

Never commit or push directly to `main`.

1. Start from an up-to-date `main`:

   `git switch main`

   `git pull --ff-only`

2. Create a focused branch:

   - `feat/<short-description>` for product features
   - `fix/<short-description>` for bug fixes
   - `refactor/<short-description>` for behavior-preserving changes
   - `docs/<short-description>` for documentation only
   - `test/<short-description>` for test-only changes
   - `chore/<short-description>` for maintenance
   - `agent/<short-description>` for branches created by coding agents

3. Make focused commits. Use imperative commit subjects and prefer Conventional
   Commit prefixes such as `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, and
   `chore:`.

4. Push the branch and open a PR against `main`.

5. Merge only after the PR is current, its checks pass, and all review
   conversations are resolved. Prefer squash merge for a focused PR.

## Pull request requirements

Every feature, bug fix, refactor, documentation change, and maintenance change
must use a PR. A PR should:

- solve one coherent problem;
- explain what changed and why;
- describe user-visible behavior and risks;
- include or update tests for behavior changes;
- include before/after screenshots for visible UI changes;
- update architecture or product documentation when contracts change;
- pass `npm run typecheck`, `npm test`, and `npm run build`;
- avoid unrelated formatting or cleanup.

Do not mix generated local deployment artifacts, Vault data, secrets, or
personal branding assets into a PR.

## Architecture boundaries

- Threadleaf is an independent plugin, not a Claudian module or compatibility
  layer.
- Do not read or write `.claudian` data.
- Page navigation must not cancel background agent work.
- Page-to-conversation routing belongs in the page-context layer.
- Provider-specific protocol behavior belongs under `src/providers/`.
- Shared runtime contracts must remain provider-neutral.
- Storage changes must preserve existing Threadleaf data or include an explicit
  schema migration.

## Validation

Run the complete local check before requesting review:

`npm run typecheck && npm test && npm run build`

Use focused tests while iterating, then run the complete check before pushing
the final revision.

## After merge

GitHub automatically deletes the merged remote branch. Local branches cannot
be deleted by GitHub, so the person who merges the PR must clean up locally:

1. `git switch main`
2. `git pull --ff-only`
3. Confirm the PR is merged with
   `gh pr view <pr-number> --json state,mergedAt`
4. Delete the local branch:
   - use `git branch -d <merged-branch>` after merge or rebase merge;
   - after squash merge, use `git branch -D <merged-branch>` only after the PR
     is confirmed merged and the local branch has no unpublished work.
5. `git fetch --prune`

Squash merge does not preserve the feature commit as an ancestor of `main`, so
Git may reject `-d` even though GitHub has merged the PR. Never use `-D` based
only on a branch name or assumption; verify the exact PR and worktree first.
