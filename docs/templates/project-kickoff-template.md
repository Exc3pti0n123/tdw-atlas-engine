# Project Kickoff Template (Universal)

Use this file at project start. Copy it to your project docs (for example `docs/project-kickoff.md`) and fill it before implementation begins.

## 1. Project Profile

- Project name:
- Repository:
- Owner(s):
- Tech stack:
- Environment status: `DEV_ONLY` | `PRODUCTION_READY`
- Current version:
- Target milestone:

## 2. Scope

### In scope

- 

### Out of scope

- 

## 3. Engineering Principles (Mandatory)

1. Explicit contracts:
- Define input/output/error behavior for every public boundary.
2. Separation of responsibilities:
- Keep data loading, data transformation, orchestration, and rendering isolated.
3. Explicit dependencies:
- No implicit load order assumptions.
4. Instance isolation:
- No shared mutable runtime state across instances unless explicitly designed.
5. Observability:
- Structured `log/warn/error`, clear cause in errors.

## 4. Template Usage (Mandatory)

List all templates that must be used for this project:

- Module/file template:
- API/contract template:
- Context/merge template:
- ADR template:
- Test-case template:

Rules:

1. New modules must start from templates, not ad-hoc files.
2. If a needed template does not exist, create template first, then implement.
3. Keep generated files aligned with template structure.

## 5. Fail-Fast Policy (Mandatory)

Unexpected states must fail fast during development.

Rules:

1. Contract violation -> hard error and stop current flow.
2. Do not silently continue on unexpected state.
3. Optional features may degrade gracefully, but must emit `warn` with reason.
4. If you intentionally stop where runtime could continue, mark it with a short comment.

Example marker:

```text
ATTENTION: intentional hard-stop for diagnosability; runtime could continue.
```

## 6. Data/Schema Policy by Environment Status

### If `DEV_ONLY` (default for early builds)

1. No legacy compatibility layer.
2. No migration path required.
3. Prefer reset/reseed over migration complexity.
4. Corrupt state should fail fast, not self-heal silently.

### If `PRODUCTION_READY`

1. Introduce versioned migrations.
2. Keep backward compatibility rules explicit.
3. Add rollback and recovery plan.
4. Document data-contract changes before release.

## 7. Testing Ownership Model

- Automation owner (AI/tooling): non-UI reproducible tests.
- Human owner: interface/visual/UX acceptance.

### Automated checks required

- Static checks:
- API/integration checks:
- Runtime/console checks:
- Data consistency checks:

### Manual checks required

- UI behavior:
- UX quality:
- Cross-device verification:

## 8. Merge and Documentation Governance

1. Every behavioral change updates docs in same change-set.
2. Architecture-impacting decisions require ADR (or explicit "No ADR required" note).
3. Non-trivial merges require a context capsule.
4. Use small, testable increments; avoid oversized commits.
5. Commit taxonomy is mandatory:
- `wip(snapshot): ...` for safe intermediate checkpoints before larger refactors.
- `release(vX.Y.Z-alphaN|betaN|rcN): ...` as milestone completion markers.
6. Release-marker commits must always include:
- implemented scope summary
- tested scope summary
- intentionally untested/open items
7. Solo mode policy (single coder) can use `main` directly only with strict checkpoint discipline:
- checkpoint commit before every major restructure
- release marker commit when a milestone is considered "finished"
8. Multi-contributor policy:
- switch to issue branches (`feat/*`, `fix/*`, `refactor/*`, `docs/*`) and merge into `main` only after review/testing.

## 9. Definition of Done

- Contracts updated.
- Architecture docs updated.
- Tests executed and reported.
- Status declared: `implemented` | `partially tested` | `done tested`.
- Open risks and follow-ups listed.

## 10. Initial Implementation Plan

1. Step 1:
2. Step 2:
3. Step 3:
4. Step 4:

## 11. Open Questions

1. 
2. 
3. 
