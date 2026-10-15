# Verification

Local verification on 2026-10-16, Node 22.23.3 / npm 10.9.9:

- `npm ci --ignore-scripts`: dependency install succeeds from the lockfile.
- `npm run check`: source and CLI syntax checks pass.
- `npm test`: 32 tests pass. Covers all v0.1 schema shapes, boundaries, JSON-domain safety, recursion, deterministic generation, input/output mode differences, non-JSON skips, async/unsupported errors, module export forms, CLI JSON/text reports, exit codes and invalid inputs.
- Source-based dogfood: 23 selected schemas, 419 values, 0 differences, 0 errors. See `dogfood.md`.
- Separate demo: 3 schemas, 88 values, 4 decimal multipleOf differences, 0 errors; intentional exit 1.
- `npm pack`, then installation of the tarball into an empty npm project with `--ignore-scripts`: executable runs against a copied TypeScript fixture, producing the same 88/4/0 result and exit 1. No registry publishing was performed.
- `npm audit --omit=dev`: 0 known vulnerabilities reported at this check. This is a point-in-time registry result, not a security guarantee.

CI is configured on Node 22 and 24. This file records local results, not an assertion that hosted CI has run or passed. The project deliberately has no install scripts and needs no build step.
