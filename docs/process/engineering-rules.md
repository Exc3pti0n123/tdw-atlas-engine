# Engineering Rules

## Core Rules

1. English-only repository content.
2. No commit without explicit human confirmation.
3. No silent compatibility layers unless explicitly requested.
4. Fail fast on contract violations.
5. Update docs with behavior changes.
6. Prefer `rg` and `rg --files` for repository search.
7. Prefer parallel read and analysis work where practical.
8. Use ASCII by default unless there is a clear reason for Unicode.
9. Use `apply_patch` for manual file edits.
10. Do not use Python for trivial file reads or writes when shell or patch is sufficient.

## Implementation Bias

1. Build context before making large changes.
2. Avoid premature assumptions.
3. Prefer real implementation work over long theoretical discussion once context is sufficient.
4. Respect existing design systems and established patterns where they exist.
5. Avoid generic frontend boilerplate when new UI work is introduced.
6. Initialize every new project or epic with both requirements and specification docs before implementation breakdown starts.

## Git Safety

1. No `git reset --hard`.
2. No `git checkout --`.
3. Do not undo changes you did not make.
4. Do not amend commits unless explicitly requested.
5. Stop and ask when unexpected conflicting changes appear.
6. Use non-interactive Git commands only.

## Testing Rules

1. Every non-trivial behavior change needs tests or updated tests.
2. Static and non-UI suites should stay green.
3. Input schemas and contracts should have negative coverage where relevant.
4. Smoke flows should stay green.

## Agent Communication

1. State what you are going to inspect before deep work.
2. Provide short progress updates while working.
3. State what you are about to edit before editing files.
4. Clearly report what changed, what did not change, and what still needs review.
5. Keep updates short and regular.
6. Keep final responses concise and high-signal.

## Delivery Expectations

1. Every implementation response includes a concise UI/UX test checklist.
2. Every implementation response states whether automated tests were run.
3. If issue tracker state cannot be changed directly, say so explicitly.
4. Findings come first in review mode, prioritized by bugs, risks, and regressions.
