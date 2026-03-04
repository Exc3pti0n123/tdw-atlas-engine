# Merge Capsule: 2026-03-04 PR-0000 security-policy-and-issue-closure

- Issue: #36, #39, #7, #23
- PR: PR-0000
- ADR: No ADR required

## Scope

1. Add public `SECURITY.md` for coordinated vulnerability reporting.
2. Link security policy into repo docs/release process.
3. Close security/release discussion issues with final status updates.
4. Close #7 and track remaining skeleton test backlog in #23.

## Changed Areas

1. `/SECURITY.md`
2. `/README.md`
3. `/docs/README.md`
4. `/docs/process/release-process.md`
5. `/docs/process/release-checklist.md`

## Decision Summary

1. Keep public security policy explicit and lightweight.
2. Keep read-only API and fail-closed baseline as mandatory rules.
3. Move remaining test backlog for #7 into #23.

## Contract Impact

1. No runtime/public API contract changes.
2. Process/documentation hardening only.

## Tests and Status

1. Docs/process change only.
2. Existing test status for runtime remains unchanged.

## Risks and Follow-ups

1. Add private advisory template later if needed.
2. Security hardening beyond baseline continues in #14/#36 follow-ups if required.
