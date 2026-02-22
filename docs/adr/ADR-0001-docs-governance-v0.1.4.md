# ADR-0001: Docs Governance and AI Context Workflow (v0.1.4)

- Status: Accepted
- Date: 2026-02-22
- Related Issue: #24, #18, #17
- Related PR: #0000

## Context

Atlas is now maintained by multiple humans and AI agents working in parallel branches.
Without a strict documentation workflow, architecture intent and reasoning are easily lost between merges.

## Decision

1. Documentation is restructured into one-click onboarding with canonical entrypoints:
- `README.md`
- `docs/README.md`
- `docs/onboarding/human.md`
- `docs/onboarding/machine.md`

2. Contracts remain single source of truth in `docs/contracts.md`.

3. AI contributors must consume a mandatory context pack before planning/coding/docs updates:
- `docs/contracts.md`
- `docs/system-architecture.md`
- `docs/process/merge-strategy.md`
- latest merge capsule in `docs/context/merges/`

4. Non-trivial merged PRs require merge context capsules in `docs/context/merges/`.

5. ADR workflow starts from v0.1.4 and records architecture/process decisions separately from changelog.

6. Legacy docs paths are removed completely (no pointer stubs).

## Consequences

Positive:
- faster onboarding for both humans and AIs
- explicit ownership for architecture/process updates
- reduced context loss across branch merges

Trade-offs:
- higher discipline needed on docs updates per PR
- checklist-driven enforcement until hard CI gate is implemented

## Alternatives Considered

1. Keep previous docs layout and rely on chat context.
2. Keep legacy docs as redirect stubs.
3. Defer ADR and context capsules to later versions.

## Follow-up

1. Implement hard CI docs gate (issue #25).
2. Enforce PR templates/checks so required docs artifacts are guaranteed before merge.
