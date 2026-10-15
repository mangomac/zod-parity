# Source-based dogfood

Checked 2026-10-16 against npm Zod 4.6.7, Ajv 8.20.0 and ajv-formats 3.0.1 on Node 22.23.3.

The 23 small schemas in `examples/dogfood.mjs` were selected/adapted from Zod's `packages/zod/src/v4/classic/tests/to-json-schema.test.ts`, as read at upstream git revision `680d19f7d1e042e55934209caeb79bc843b94f44`. Upstream source repository: https://github.com/colinhacks/zod . Snapshot expectations were not copied. Copyright notice is retained in `THIRD_PARTY_NOTICES.md`.

Selections: primitives, any/unknown/never, email/datetime, bounds and exclusive bounds, tighter integer bounds, chained divisors, inconsistent length bounds, chained string patterns, arrays, unions, nullable, records with string and enum keys, default-valued enum records, tuples and rest tuples. Supplied values cover valid formats/patterns and enum record key combinations.

Command from repository root:

```sh
node bin/zod-parity.js examples/dogfood.mjs --json > docs/dogfood-results.json
```

Observed exit code 0: 23 schema runs, 419 tested JSON values, 0 mismatches, 0 errors. `never` and contradictory length constraints correctly have no accepted samples and produce warnings. All other selected schemas had at least one sampled Zod-accepted value.

This is a source-based selection running against the installed npm release, not execution of the upstream repository's entire tests or its main-branch code. The separate decimal fixture and permissive bigint example demonstrate differences; neither is presented as a new converter defect.
