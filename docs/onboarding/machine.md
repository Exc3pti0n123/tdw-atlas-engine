# Machine Onboarding

This file defines mandatory behavior for AI contributors.

## Mandatory Context Pack (Read First)

1. `../contracts.md`
2. `../system-architecture.md`
3. `../process/merge-strategy.md`
4. latest merge capsule in `../context/merges/`

## Mandatory Responsibilities

1. Preserve and enforce runtime contracts.
2. Keep JS module section standard:
- `MODULE INIT`
- `FUNCTIONS`
- `PUBLIC API`
- `AUTO-RUN`
3. Keep docs synchronized with relevant changes:
- contracts
- architecture docs
- ADR
- version references
- merge capsule
4. Declare test status clearly in outputs:
- `implemented`
- `partially tested`
- `done tested`
5. Run and report non-UI suite for implementation changes:
- `npm run test:non-ui`
- reference: `../process/non-ui-testing.md`

## Testing Ownership

1. AI/Codex owns non-UI reproducible tests (CLI, HTTP, browser-console smoke).
2. Human owns interface/visual/UX testing and final UI acceptance.

## Required Escalation in Output

When uncertain or when assumptions affect architecture/contracts, AI must explicitly call out assumptions and their impact before merge.
