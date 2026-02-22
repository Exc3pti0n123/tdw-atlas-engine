# Merge Capsule: 2026-02-22 PR-0000 docs-refactor-v0.1.4

- Issue: #24 (Docs Overhaul), #18 (0.1.4 mini-addons), #17 (ADR process)
- PR: #0000 (local/pre-PR baseline capsule)
- ADR: No ADR required (documentation/process refactor only)

## Scope

Refactor repository documentation into a one-click onboarding system for human and AI contributors.
No runtime JS/PHP feature behavior changes were introduced.

## Changed Areas

1. Root docs entrypoints:
- `README.md`
- `CONTRIBUTING.md`

2. New docs architecture:
- `docs/README.md`
- `docs/definitions.md`
- `docs/system-architecture.md`
- `docs/architecture/*`
- `docs/diagrams/*`
- `docs/onboarding/*`
- `docs/process/*`
- `docs/adr/*`
- `docs/context/*`
- `docs/templates/context-capsule-template.md`

3. Contract additions:
- `docs/contracts.md` now includes:
  - Contract 18 (AI context pack and documentation duty)
  - Contract 19 (merge context capsule requirement)
  - Contract 20 (ADR requirement from v0.1.4 onward)

4. Cleanup:
- removed legacy docs paths (`docs/architectural.md`, `docs/arch/*`)
- removed legacy `vibe-code-guide/*` files

5. Governance follow-up:
- created issue #25 for hard CI docs gate (future strict enforcement)

6. Version alignment:
- plugin version strings updated to `0.1.4`

## Decision Summary

1. Documentation is now the primary onboarding medium for both human and AI contributors.
2. AI responsibilities are explicit and mandatory in docs.
3. Merge context capsules are required for non-trivial merged PRs.
4. ADR workflow starts from v0.1.4.
5. Legacy paths are removed completely (no pointer stubs).

## Contract Impact

- Runtime contracts stayed stable.
- Process/documentation contracts expanded (18-20).
- Public runtime plugin APIs unchanged.

## Tests and Status

- Documentation structure and links validated for active paths.
- Version strings updated and rechecked.
- Status: `implemented` (documentation/process baseline established; broader workflow validation continues in real PR usage).

## Risks and Follow-ups

1. Checklist-based governance can miss omissions without CI enforcement.
2. Follow-up issue #25 should implement hard gate checks for required docs artifacts.
3. Real PR workflow should now consume this capsule format to validate process clarity.
