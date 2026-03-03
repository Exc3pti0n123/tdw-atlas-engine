# Release Checklist

## Pre-Release

1. Version strings updated where applicable.
2. Contracts reviewed for changes.
3. Architecture docs aligned with final runtime.
4. ADRs added/updated for architecture decisions.
5. Merge capsules present for non-trivial merged PRs.

## Validation

1. PHP syntax checks pass.
2. JS syntax checks pass.
3. Non-UI suite passes (`npm run test:non-ui`).
4. Human interface testing executed for UI/UX changes.
5. Test status clearly reported.
6. Security baseline checks pass:
   - no public write/reset/import route introduced
   - strict REST schema validation active (`400` negative cases)
   - path validation active for runtime/seed inputs

## Release Notes Input

1. Summary of changes.
2. Breaking contract/process changes.
3. Open known risks.
