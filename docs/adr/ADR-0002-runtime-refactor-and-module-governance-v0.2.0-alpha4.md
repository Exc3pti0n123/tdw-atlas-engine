# ADR-0002: Runtime Refactor and Module Governance (v0.2.0-alpha4)

- Status: Accepted
- Date: 2026-02-28
- Related Issue: #38, #37, #32
- Related PR: #0000

## Context

The runtime changed significantly during `0.2.0` work:

1. data preparation moved from legacy pipeline naming to a preprocessor model.
2. Leaflet runtime behavior became more complex (stage machine + hybrid model + preview coupling).
3. module quality standards drifted across files (logger wiring, JSDoc coverage, section markers).

Without one explicit governance decision, contributor/AI behavior diverges and review cost rises.

## Decision

1. Runtime naming is hard-cut to **preprocessor**:
- `atlas-map-pipeline` is removed.
- preprocessor modules are canonical runtime data-prep path.
- no compatibility alias in dev-only workflow.

2. Leaflet transition logic remains **single-file**:
- `assets/adapter/leaflet/atlas-leaflet-transition.js` stays standalone.
- `atlas-leaflet.js` uses in-file orchestration blocks and state-driven lifecycle.

3. Logger module contract is **soft-fail by design** (no hard-stop on missing logger):

```js
const { dlog = () => {}, dwarn = () => {},
  derror = (...args) => console.error('[TDW ATLAS FATAL]', `[${SCOPE}]`, ...args),
} = window.TDW?.Logger?.createScopedLogger?.(SCOPE) || {};
```

4. Module governance is strict and universal for Atlas JS files:
- required section markers: `MODULE INIT`, `FUNCTIONS`, `PUBLIC API`, `AUTO-RUN`.
- JSDoc required on every function, including API methods (`init`, `destroy`, etc.).
- intentional hard-stops must carry ATTENTION marker comment.

5. Shared modules align to same section-marker governance:
- `assets/shared/tdw-bridge.js`
- `assets/shared/tdw-logger.js`

## Consequences

Positive:
1. clearer runtime boundaries (`Boot -> Preprocessor -> Core -> Adapter`).
2. consistent contributor expectations across all JS modules.
3. better diagnosability with explicit ATTENTION hard-stop markers.
4. safer boot in dev when logger contract loads late (soft logger fallback).

Trade-offs:
1. more documentation discipline and update overhead.
2. more comments/JSDoc volume in module files.
3. soft logger fallback can hide enqueue/dependency order errors unless monitored via tests/log review.

## Alternatives Considered

1. Keep legacy runtime name (`pipeline`) with aliases.
2. Enforce hard-fail logger contract (`window.TDW.Logger.createScopedLogger(SCOPE)` only).
3. Keep JSDoc optional and rely on code review only.
4. Split transition into multiple files immediately.

## Follow-up

1. Add automated governance check script (sections + logger form + JSDoc + ATTENTION markers).
2. Keep UI/UX acceptance human-owned; keep non-UI suite AI-owned and mandatory.
3. Revisit logger hard-fail policy after plugin load-order stabilization and CI maturity.
