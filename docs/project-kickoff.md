# TDW Atlas Engine — Project Kickoff

## 1. Project Profile

- Project name: `TDW Atlas Engine`
- Repository: `tdw-atlas-engine`
- Owner(s): Human product owner and engineering collaborators
- Tech stack: WordPress PHP, JavaScript, Leaflet, REST, DB-backed runtime config
- Environment status: `DEV_ONLY`
- Current version: `v0.2.0-alpha`
- Target milestone: tighten governance and continue Atlas admin/runtime work on explicit contracts

## 2. Scope

### In scope

- Atlas runtime and adapter orchestration
- Leaflet-based rendering and map interaction
- Atlas admin GUI and DB-backed map configuration
- Runtime/public contracts, admin contracts, and project governance

### Out of scope

- generic journey ingestion and analytics ownership
- design-system ownership outside Atlas-specific UI behavior
- production-ready migration compatibility guarantees while still `DEV_ONLY`

## 3. Engineering Principles

1. Explicit contracts
2. Separation of concerns
3. Fail-fast behavior
4. Structured observability with `log`, `warn`, and `error`
5. Small, testable increments

## 4. Governance Trio

The primary governance trio for Atlas is:

1. `docs/project-kickoff.md`
2. `docs/contracts.md`
3. `docs/system-architecture.md`

These documents are the baseline source of truth for project direction, public contracts, and top-level architecture.

## 5. Mandatory Module Structure

Every non-trivial Atlas JS module keeps these sections:

1. `MODULE INIT`
2. `FUNCTIONS`
3. `PUBLIC API`
4. `AUTO-RUN`

If a section is intentionally empty, keep the header and write `n/a`.

## 6. Project and Epic Initialization Rule

Every new project-scale effort or epic must start with both:

1. a requirements document
2. a specification document

Implementation breakdown must not begin from issue titles or chat summaries alone.

## 7. Fail-Fast Policy

1. Invalid states stop the current flow.
2. Contract violations do not continue silently.
3. Graceful degradation requires an explicit `warn`.
4. Intentional hard stops keep this marker:

```text
ATTENTION: intentional hard-stop for diagnosability; runtime could continue.
```

## 8. Documentation and ADR Rules

1. Docs update in the same change set as behavior changes.
2. Architecture decisions require an ADR.
3. If no ADR is needed, explicitly state `No ADR required`.
4. Non-trivial merges require a context capsule.

## 9. Testing Ownership

1. AI/tooling owns automatable non-UI checks.
2. Human owns UI/UX/look/device acceptance.

## 10. Commit and Collaboration Rules

1. No commit without explicit human confirmation.
2. No destructive Git commands.
3. No revert of unrelated changes.
4. No interactive Git flows.
5. Keep communication direct, concise, and pragmatic.

## 11. Definition of Done

1. Contracts updated
2. Architecture and process docs updated
3. Tests executed and reported where applicable
4. Status declared
5. Risks and follow-ups documented
