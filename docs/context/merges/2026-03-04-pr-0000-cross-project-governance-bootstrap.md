# Merge Capsule: 2026-03-04 PR-0000 cross-project-governance-bootstrap

## Scope

1. Added cross-project documentation references from Atlas to sibling plugins (`tdw-core`, `tdw-design`).
2. Documented explicit Atlas token fallback obligations when Design tokens are unavailable.

## Changed areas

1. `docs/contracts.md`
2. `docs/system-architecture.md`
3. `docs/README.md`
4. `docs/onboarding/human.md`
5. `docs/onboarding/machine.md`

## Decision summary

1. Atlas remains runtime-owner for map rendering and keeps local CSS fallback values.
2. Cross-project contracts are now redundantly documented to support new-thread/new-agent handover.

## Contract impact

1. Clarified Contract 13 fallback requirements in Atlas.
2. No runtime API break and no REST contract change.

## Tests and status

1. docs-only changes in Atlas for this capsule scope
2. status: `implemented`

## Risks / open follow-ups

1. Keep fallback table synchronized with actual `assets/atlas.css` values.
2. AdminGUI write contracts still pending in #14/#35.

## Links to issue/PR/ADR

1. Issue: #14, #35
2. PR: 0000
3. ADR: none
