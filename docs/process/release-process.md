# Release Process

Use this runbook for every tagged milestone release (alpha, beta, final).

## Scope

1. Prepare release candidate from tested `main`.
2. Run mandatory validation gates.
3. Build deployable plugin ZIP (runtime-only payload).
4. Publish tag + release notes.

## 1) Prepare

1. Confirm issue status and known risks are documented.
2. Update version strings consistently:
- `/Users/justin/Local Sites/thedesertwhale/app/public/wp-content/plugins/tdw-atlas-engine/tdw-atlas-engine.php`
- `/Users/justin/Local Sites/thedesertwhale/app/public/wp-content/plugins/tdw-atlas-engine/atlas.seed.json`
- `/Users/justin/Local Sites/thedesertwhale/app/public/wp-content/plugins/tdw-atlas-engine/readme.txt` (`Stable tag`, changelog)
3. Ensure relevant docs/contracts are already updated in the same release branch.

## 2) Validate

1. `npm run test:static`
2. `npm run test:non-ui`
3. Human UI/UX acceptance on key flows:
- world -> region -> country
- sea click back chain
- preview close and link click behavior
- no console fatal errors in valid flow

## 3) Package ZIP (runtime-only)

Goal: include only deployment-required files, exclude contributor/process artifacts.

### Include

1. `tdw-atlas-engine.php`
2. `includes/`
3. `assets/`
4. `data/`
5. `atlas.seed.json`
6. `readme.txt`
7. `LICENSE` (when present)

### Exclude

1. `.git/`, `.github/`, `.vscode/`
2. `docs/`, `tests/`, `node_modules/`
3. local OS files (`.DS_Store`)
4. contributor/process-only files not needed at runtime

## 4) Tag + Publish

1. Create milestone commit message:
- implemented
- tested
- consciously untested/open
2. Tag release (example): `v0.2.0-alpha4`.
3. Push commit + tag.
4. Create GitHub release with:
- short summary
- breaking changes (if any)
- known follow-ups/issues

## 5) Post-release

1. Add merge capsule in `docs/context/merges/`.
2. Move tested issues to final state.
3. Open follow-up issues for intentionally deferred work.
