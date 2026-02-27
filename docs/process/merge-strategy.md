# Merge Strategy

## Standard Rule

1. Code PRs:
- AI prepares PR.
- Human reviews/approves.
- Squash merge only (`1 PR = 1 commit`).

2. Docs-only PRs:
- AI-moderated auto-merge is allowed when all conditions below are true.

## Docs-only Auto-Merge Conditions

1. Changed files are only docs/process/onboarding/templates/context/ADR files.
2. Docs checklist in PR is complete.
3. Green checks pass.

## Green Checks Definition

1. non-ui suite passes (`npm run test:non-ui`) where applicable
2. docs update checklist passes
3. required context capsule exists when applicable
4. interface testing confirmation from human reviewer when UI/UX is touched

## Checklist Enforcement (Current)

Current enforcement is checklist-based.
A separate follow-up issue can introduce hard CI gates that block merges on missing required docs updates:

- `#25 process: add hard CI gate for required docs/ADR/context artifacts`
