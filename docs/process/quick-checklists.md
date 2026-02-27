# Quick Checklists (Commit + Merge)

Use this page as the fastest pre-flight check.

## Before Commit

1. Re-read mandatory context pack:
   - `docs/contracts.md`
   - `docs/system-architecture.md`
   - `docs/process/merge-strategy.md`
   - latest merge capsule in `docs/context/merges/`
2. Confirm changed code follows js file structure (`MODULE INIT`, `FUNCTIONS`, `PUBLIC API`, `AUTO-RUN`).
3. Run non-UI suite:
   - `npm run test:non-ui`
   - details/config: `docs/process/non-ui-testing.md`
4. Update affected docs (contracts, architecture, ADR, version refs) if behavior/process changed.
5. Mark local test status clearly: `implemented`, `partially tested`, or `done tested`.
6. Manual interface testing (human-owned) completed for UI/UX changes.

## Before Merge (Human Trigger)

1. PR has linked issue and clear scope.
2. Docs checklist in PR is complete.
3. Merge capsule exists for non-trivial PR:
   - `docs/context/merges/YYYY-MM-DD-pr-<number>-<slug>.md`
4. ADR is added for architecture-impacting changes, or merge capsule states `No ADR required`.
5. Green checks are passing:
   - non-ui checks (`npm run test:non-ui`)
   - docs checklist validation
   - required context artifacts present
6. Human confirms interface testing for UI-relevant changes.
7. Merge strategy is respected:
   - code PR: human-approved squash merge (`1 PR = 1 commit`)
   - docs-only PR: may use AI-moderated auto-merge when policy conditions are met
