# TDW Atlas Engine — Agent Rules

This file is the local, binding rule set for AI coding agents in this repository.

## 1) Mandatory Context (read before planning/coding)

1. `docs/contracts.md`
2. `docs/system-architecture.md`
3. `docs/project-kickoff.md`
4. `docs/process/merge-strategy.md`
5. `docs/process/engineering-rules.md`
6. Latest file in `docs/context/merges/`

## 2) Language Rule

1. Repository content is English-only.
2. Filenames, docs, code comments, ADRs, and issue text must be English.

## 3) Required JS Module Structure (do not remove)

Every Atlas JS module must keep these sections:

1. `MODULE INIT`
2. `FUNCTIONS`
3. `PUBLIC API`
4. `AUTO-RUN`

If a section is intentionally empty, keep the header and write `n/a`.

Use templates:

1. `docs/templates/module-template.md`
2. `docs/templates/module-template-custom.md`

## 4) JSDoc Rule (strict)

Every function must have JSDoc directly above it.

Includes:

1. function declarations
2. exported functions
3. module-internal helpers
4. object methods in public API blocks (`init`, `destroy`, etc.)

Minimum:

1. short purpose line
2. `@param` for every parameter
3. `@returns` when value is returned
4. `@throws` when relevant

## 5) Logger Rule (strict shape, no hard-fail)

Use this compact boilerplate in Atlas modules:

```js
const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};
```

Reason:
1. no hard-fail when logger contract is temporarily unavailable
2. fatal errors still surface via `console.error`

Do not replace it with different custom logger wiring in module files.
Direct `_logger` usage is reserved for `assets/shared/tdw-logger.js`.

## 6) Fail-Fast Rule

Intentional hard-stops must keep the ATTENTION marker comment:

```js
// ATTENTION: intentional hard-stop for diagnosability; runtime could continue.
```

Do not silently swallow contract violations.

## 7) Dev-Only Policy

No legacy compatibility layers in dev-only refactors:

1. no shims/wrappers for old names
2. no dual codepaths for old/new contracts
3. no migration/legacy fallbacks unless explicitly requested

Hard-cut and update code/docs/tests in the same patch.

## 8) Documentation Duty

When behavior/contracts/structure change, update in the same change:

1. `docs/contracts.md`
2. `docs/project-kickoff.md` when project governance or scope shifts
3. relevant architecture docs
4. diagrams if flow/module edges changed
5. merge context capsule
6. ADR when architecture changed, otherwise explicitly state `No ADR required`

## 9) Testing Duty

For implementation changes run and report:

1. `npm run test:static`
2. `npm run test:non-ui`
3. update or add tests for non-trivial behavior changes

Human remains owner of UI/UX acceptance testing.

## 10) Security Baseline Duty (mandatory)

All agents must enforce the minimal 5-rule baseline:

1. Public Atlas REST routes stay read-only.
2. Admin write operations (when added) must require capability + nonce + strict schema.
3. No dynamic execution/path resolution from request or DB-controlled values.
4. Fail-closed for invalid security-relevant input (no sanitize-and-continue).
5. SQL with variable input must use prepared statements.

## 11) Git Safety Rule

1. Never create a commit without explicit human confirmation in the current thread.
2. Never use `git reset --hard`.
3. Never use `git checkout --`.
4. Never revert changes you did not make unless explicitly requested.
5. Never use interactive Git flows.
6. Never amend commits unless explicitly requested.
7. If unexpected conflicting changes appear, stop and ask how to proceed.

## 12) Review Rule

When asked for a review:

1. findings come first
2. prioritize bugs, risks, regressions, and missing tests
3. keep summary secondary

## 13) Issue and Project Governance

1. Keep GitHub issues and project state current when direct access exists.
2. After implementation, move issues to the equivalent of `AI-Implemented (UI/UX untested)` when project access exists.
3. Close work only after human acceptance.

## 14) Project and Epic Initialization Rule

Every new project-scale effort or epic must start with both:

1. a requirements document
2. a specification document

Do not start implementation breakdown from issue titles or chat summaries alone.
