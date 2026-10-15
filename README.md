# zod-parity

Find inputs that Zod 4 and its own generated JSON Schema disagree about.

A small, deterministic CLI. Load your schemas, generate boundary samples, validate the same JSON values with Zod and Ajv, and get a counterexample with error paths. Add your own examples when the generated samples are not enough.

**Early v0.1.** Sampling is not proof of equivalence. A difference is not automatically a Zod bug: validator precision, formats, input/output modes and intentionally lossy conversion all matter.

## Try it

Requires Node **22.18+** (or Node 24+) for native TypeScript type stripping. No transpilation or build step. TypeScript modules must use Node-compatible imports and erasable syntax; `.mjs` works too.

```sh
git clone https://github.com/mangomac/zod-parity.git
cd zod-parity
npm ci --ignore-scripts
npm test
node bin/zod-parity.js examples/schemas.ts
```

The demo intentionally exits **1** because it finds differences. It does not mean installation failed. No npm registry release has been made. `npx zod-parity` is **not** the installation command for this version.

To make the command available locally after cloning:

```sh
npm link
zod-parity ./examples/schemas.ts --json
```

To check a module in your own project, install Zod there so that the module's `import { z } from 'zod'` can resolve. The checker uses Zod 4's JSON Schema conversion.

## A real result

With the lockfile's Zod 4.6.7, Ajv 8.20.0 and ajv-formats 3.0.1:

```ts
import { z } from 'zod';
export const decimal = z.number().multipleOf(0.1);
export const samples = { decimal: [0.3] };
```

```text
decimal [input]: 21 samples, 4 differences
  0.3 | Zod: accept | JSON Schema: reject
    / -> #/multipleOf: must be multiple of 0.1
```

Excerpt from the [recorded demo](docs/demo.txt). This is a floating-point validation difference, **not a claim of a new converter bug**. Ajv's `multipleOfPrecision` option could change the result; this tool leaves Ajv's default precision behavior unchanged.

## Your schemas

Export named Zod schemas, one default schema, or a default object of schemas:

```ts
import { z } from 'zod';

export const user = z.object({
  name: z.string().min(1),
  age: z.number().int().min(0).max(120),
});

// Optional. Supplied samples run first and count toward the per-schema cap.
export const samples = {
  user: [{ name: 'Mango', age: 20 }, { name: '', age: -1 }],
};
```

```sh
zod-parity ./schemas.ts --io input --seed 42 --max-samples 200
zod-parity ./schemas.ts --io both --json > report.json
```

**Only load modules you trust.** Loading a module executes its code with your local process permissions. This is not a sandbox. Reports include actual input values, so keep reports containing private examples private.

## Options and exit codes

| Option | Default | Meaning |
| --- | --- | --- |
| `--io input\|output\|both` | `input` | JSON Schema conversion mode |
| `--seed N` | `1` | Repeatable sample variation, unsigned 32-bit integer |
| `--max-samples N` | `200` | Total tested values per schema/mode, including supplied samples (1..10000) |
| `--unrepresentable throw\|any` | `throw` | Stop on unsupported conversion or explicitly allow lossy conversion |
| `--json` | off | Full machine-readable report, emitted JSON Schema and validator errors |
| `--help` | | Usage |

- **0:** no differences among the tested samples.
- **1:** one or more acceptance differences.
- **2:** argument, loading, conversion or validation error. Errors take precedence over differences. Inspect the JSON report for partial results.

Zod and Ajv receive the same value. Ajv coercion, defaults and property removal are disabled. Zod's parsed/transformed result is not substituted for the original input.

`input` is the useful default for acceptance checks. `output` often produces expected differences: Zod may accept an object with extra keys and strip them, while output JSON Schema rejects those keys. `both` labels the modes separately. The tool does not compare transformed output values.

## Coverage and limits

- Generator handles JSON primitives, literal/enum values, object properties, required-key omissions, extra keys, records, arrays, tuples, union branches and local JSON Schema references.
- It probes numeric and length boundaries and uses a small repeatable sample variation. It is **not** a general regex solver, property-based fuzzer, satisfiability solver or minimizer.
- Generation depth is capped at 8; string lengths at 1024; generated array lengths at 65; sampled object properties at 64. A visit budget limits recursive expansion. Large/complex schemas can therefore be under-sampled.
- Explicit valid samples are especially useful for patterns, formats, unions and intersections. A report warns when no tested sample was accepted by Zod. That can mean an unsatisfiable schema or simply weak sampling.
- Only JSON data is tested. `undefined`, bigint, NaN, Infinity, dates, sparse arrays and cyclic objects are skipped, not silently coerced. Optional properties are tested through omissions, not `undefined` values.
- Draft 2020-12 only, with Ajv formats enabled. No remote schema fetching, other drafts, OpenAPI, cross-library adapters or web UI.
- Refinements, transforms, custom checks and coercion are not fully representable in JSON Schema. Conversion can fail or lose constraints. Do not interpret those differences as proof of a defect. Async schemas are not supported; synchronous parse errors are reported as errors.
- A seed guarantees repeatability for the same installed versions and module, not across dependency upgrades or changes to your module.

### The bigint motivating example

[Zod #6625](https://github.com/colinhacks/zod/issues/6625) motivated this project. The original plan overstated how it could be demonstrated: bigint itself is not JSON. On the tested version, default conversion correctly errors. In explicit permissive mode:

```sh
zod-parity examples/bigint.mjs --unrepresentable any
```

The bigint input is skipped. The **JSON number** `9007199254740992` is accepted by the rounded generated `const`, while the Zod bigint literal rejects it. This is labeled a lossy-conversion difference, not validation of a bigint through JSON. No input is rounded by the checker.

## Programmatic use

```js
import { checkSchema } from 'zod-parity';
const result = checkSchema(schema, {
  io: 'input', seed: 1, maxSamples: 200,
  samples: [{ name: 'Mango', age: 20 }],
});
console.log(result.mismatches);
```

Results include `status`, `tested`, `zodAccepted`, `jsonSchemaAccepted`, `skippedNonJson`, `warnings`, `jsonSchema` and `mismatches`. Each mismatch preserves the input, both verdicts, Zod issue paths and Ajv instance/schema paths. Conversion and parse failures set `status: 'error'` and `error`.

## Verification

```sh
npm run check
npm test
node bin/zod-parity.js examples/dogfood.mjs --json
```

The source-based dogfood set covers 23 schemas selected from Zod's JSON Schema tests, with supplied examples where needed: 419 tested values, 0 differences, 0 errors on the lockfile versions. That is a bounded selection, **not the full upstream test suite** and not proof of parity. [Method and source revision](docs/dogfood.md), [saved report](docs/dogfood-results.json).

The separate decimal fixture does find a confirmed current-version disagreement. No additional converter bug is claimed. CI runs tests on Node 22 and 24; local tests and clean-package installation are recorded in [verification](docs/verification.md).

## Related work

This tool checks acceptance parity with Zod's generated JSON Schema; it does not replace converters or schema comparison tools. Related projects include [zod-to-json-schema](https://www.npmjs.com/package/zod-to-json-schema), [zod-compare](https://github.com/lawvs/zod-compare) and [Standard Schema Playground](https://www.osbytes.io/tools/standard-schema-playground). No claim of uniqueness is made.

References: [Zod JSON Schema docs](https://zod.dev/json-schema), [Ajv options](https://ajv.js.org/options.html).

## License

MIT. Original implementation by Mango. Selected dogfood fixtures are adapted from Zod's MIT-licensed tests; attribution is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
