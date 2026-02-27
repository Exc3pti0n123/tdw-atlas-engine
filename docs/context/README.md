# Context Capsules

Context capsules preserve decision and implementation context across contributors and AI agents.

## Types

1. Branch capsule (optional working notes):
- `branches/<branch-name>.md`

2. Merge capsule (required for non-trivial merged PRs):
- `merges/YYYY-MM-DD-pr-<number>-<slug>.md`

Current baseline example:
- `merges/2026-02-22-pr-0000-docs-refactor-v0.1.4.md`
- `merges/2026-02-23-pr-0000-v0-2-0-functional-only.md`
- `merges/2026-02-25-pr-0000-db-first-runtime-v0-2-0.md`
- merge template in-context:
  - `merges/TEMPLATE-YYYY-MM-DD-pr-0000-slug.md`

## Merged Branches Register

- `merged-branches.md`
- Purpose: quick lookup of merged branches, PR numbers, and capsule references.

## Required Merge Capsule Fields

1. Scope
2. Changed areas
3. Decision summary
4. Contract impact
5. Tests and status
6. Risks/open follow-ups
7. Links to issue/PR/ADR

## Template

Use:
- `../templates/context-capsule-template.md`
