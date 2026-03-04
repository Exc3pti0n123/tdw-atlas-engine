# Security Policy

## Supported Versions

This project currently supports security fixes for the latest beta line:

| Version | Supported |
| --- | --- |
| `0.2.x` (beta) | Yes |
| `< 0.2.0` | No |

## Reporting a Vulnerability

Please do not open a public issue for suspected vulnerabilities.

Report privately to:

- `justin.errica@gmail.com`

Include:

1. affected version/tag
2. reproduction steps
3. impact assessment
4. proof of concept (if available)

## Response Targets

1. Initial response target: within 72 hours.
2. Triage target: within 7 days.
3. Fix/release target depends on severity and reproducibility.

## Disclosure Policy

1. Coordinated disclosure is required.
2. A fix should be prepared before public details are published.
3. After release, a brief public advisory may be published in release notes.

## Scope

In scope:

1. Plugin PHP runtime (`includes/*`, `tdw-atlas-engine.php`)
2. Public REST routes (`/wp-json/tdw-atlas/v1/config`, `/wp-json/tdw-atlas/v1/preview`)
3. JS runtime modules under `assets/*`

Out of scope:

1. Host/server hardening outside this plugin
2. Third-party infrastructure not controlled by this repository

## Security Baseline (Project Rules)

The project enforces these minimum rules:

1. Public Atlas REST surface remains read-only.
2. Admin write paths (future) require capability + nonce + strict schema validation.
3. No dynamic path execution from request/DB-controlled input.
4. Invalid security-relevant input fails closed.
5. SQL with variable input uses prepared statements.
