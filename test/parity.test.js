import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { checkSchema, generateSamples, isJsonValue } from '../src/index.js';

for (const [name, schema, sample] of [
  ['string', z.string().min(2).max(4), 'hi'],
  ['integer', z.number().int().min(2).max(5), 3],
  ['literal', z.literal('yes'), 'yes'],
  ['enum', z.enum(['red', 'blue']), 'red'],
  ['object', z.object({ n: z.number(), s: z.string() }), { n: 1, s: 'a' }],
  ['array', z.array(z.number()).min(1).max(3), [1]],
  ['tuple', z.tuple([z.string(), z.number()]), ['a', 1]],
  ['rest tuple', z.tuple([z.string()], z.number()), ['a', 1, 2]],
  ['union', z.union([z.string(), z.number()]), 'a'],
  ['optional', z.string().optional(), 'a'],
  ['nullable', z.string().nullable(), null],
  ['record', z.record(z.string(), z.number()), { a: 1 }],
  ['boolean', z.boolean(), false],
  ['null', z.null(), null],
  ['strict object', z.strictObject({ a: z.string() }), { a: 'x' }],
  ['passthrough object', z.looseObject({ a: z.string() }), { a: 'x', b: 1 }],
  ['intersection', z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })), { a: 'x', b: 1 }],
]) test(`${name}: parity and supplied valid sample`, () => {
  const r = checkSchema(schema, { samples: [sample] });
  assert.equal(r.status, 'ok', r.error);
  assert.equal(r.mismatches.length, 0, JSON.stringify(r.mismatches));
  assert.ok(r.tested > 0);
});

test('finds real floating-point multipleOf disagreement with schema path', () => {
  const r = checkSchema(z.number().multipleOf(0.1), { samples: [0.3] });
  const m = r.mismatches.find(m => m.value === 0.3);
  assert.equal(m.zodAccepts, true);
  assert.equal(m.jsonSchemaAccepts, false);
  assert.equal(m.jsonSchemaErrors[0].schemaPath, '#/multipleOf');
});

test('input vs output semantics are explicit, never mutates sample', () => {
  const s = z.object({ a: z.string() });
  const value = Object.freeze({ a: 'hi', __extra: true });
  assert.equal(checkSchema(s, { io: 'input', samples: [value] }).mismatches.length, 0);
  const r = checkSchema(s, { io: 'output', samples: [value] });
  assert.ok(r.mismatches.some(m => m.value.__extra === true));
  assert.match(r.warnings[0], /expected differences/);
  assert.deepEqual(value, { a: 'hi', __extra: true });
});

test('bigint defaults to error; permissive mode preserves rounded counterexample and skips bigint', () => {
  const schema = z.literal(9007199254740993n);
  assert.equal(checkSchema(schema).status, 'error');
  const r = checkSchema(schema, { unrepresentable: 'any', samples: [9007199254740993n] });
  assert.equal(r.skippedNonJson, 1);
  assert.ok(r.mismatches.some(m => m.value === 9007199254740992 && !m.zodAccepts && m.jsonSchemaAccepts));
  assert.match(r.warnings[0], /lose non-JSON semantics/);
});

test('transform conversion failure is not a clean result', () => {
  assert.equal(checkSchema(z.string().transform(s => s.length), { io: 'output' }).status, 'error');
});

test('strict JSON domain rejects undefined, holes, NaN, cycles and objects with prototypes', () => {
  const cycle = {}; cycle.self = cycle;
  for (const v of [undefined, 1n, NaN, Infinity, new Date(), cycle, { a: undefined }, [undefined], Array(1), /a/]) assert.equal(isJsonValue(v), false);
  const shared = { a: 1 }; assert.equal(isJsonValue([shared, shared]), true);
  assert.equal(isJsonValue({ a: [null, 0, false, 'ok'] }), true);
});

test('bounded, deterministic generator includes boundary values', () => {
  const schema = z.toJSONSchema(z.number().int().min(2).max(4));
  const a = generateSamples(schema, { seed: 42, maxSamples: 100 });
  assert.deepEqual(a, generateSamples(schema, { seed: 42, maxSamples: 100 }));
  for (const n of [1, 2, 3, 4, 5]) assert.ok(a.includes(n));
  assert.ok(generateSamples(schema, { maxSamples: 2 }).length <= 2);
});

test('supports recursive local references without infinite generation', () => {
  const Node = z.object({ value: z.string(), children: z.lazy(() => z.array(Node)) });
  const r = checkSchema(Node);
  assert.equal(r.status, 'ok', r.error); assert.ok(r.tested <= 200);
});

test('deduplication and supplied-sample precedence respect cap', () => {
  const r = checkSchema(z.number(), { maxSamples: 1, samples: [42, 42, 'bad'] });
  assert.equal(r.tested, 1); assert.equal(r.mismatches.length, 0);
});

test('rejects invalid programmatic options', () => {
  assert.throws(() => checkSchema(z.string(), { maxSamples: 0 }));
  assert.throws(() => checkSchema(z.string(), { io: 'wrong' }));
});

const cli = (...args) => spawnSync(process.execPath, [resolve('bin/zod-parity.js'), ...args], { encoding: 'utf8' });
test('CLI runs TypeScript, valid JSON report, mismatch exit 1', () => {
  const r = cli('examples/schemas.ts', '--json');
  assert.equal(r.status, 1, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.summary.errors, 0); assert.equal(report.summary.schemas, 3);
  assert.ok(report.summary.mismatches > 0);
});
test('CLI help and invalid arguments, missing module, unsupported export', () => {
  assert.equal(cli('--help').status, 0);
  for (const args of [[], ['missing.ts'], ['examples/schemas.ts', '--io', 'bad'], ['examples/schemas.ts', '--max-samples', 'NaN'], ['examples/schemas.ts', '--seed', '-1'], ['examples/schemas.ts', '--wat']]) assert.equal(cli(...args).status, 2);
});
test('CLI named/default object exports, samples, both modes, no schemas', () => {
  const dir = mkdtempSync(resolve('test/fixture-'));
  try {
    const file = join(dir, 'schemas.mjs');
    writeFileSync(file, "import { z } from 'zod'; export default { text: z.string() }; export const samples = { text: ['hello'] };");
    const r = cli(file, '--io', 'both', '--json');
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).summary.runs, 2);
    writeFileSync(file, 'export const notSchema = 1;');
    assert.equal(cli(file).status, 2);
    writeFileSync(file, "import { z } from 'zod'; export default z.string(); export const samples = { default: 1 };");
    assert.equal(cli(file).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('reports missing positive coverage rather than pretending exhaustive parity', () => {
  const r = checkSchema(z.string().regex(/^XYZZY$/));
  assert.equal(r.zodAccepted, 0);
  assert.ok(r.warnings.some(w => w.includes('No sampled value')));
  const withExample = checkSchema(z.string().regex(/^XYZZY$/), { samples: ['XYZZY'] });
  assert.ok(withExample.zodAccepted > 0);
});
test('async schemas and invalid schema values produce errors', () => {
  assert.equal(checkSchema(null).status, 'error');
  assert.equal(checkSchema(z.string().refine(async () => true)).status, 'error');
});
test('text CLI reports errors, skipped values, warnings and schema differences', () => {
  const out = cli('examples/bigint.mjs', '--unrepresentable', 'any');
  assert.equal(out.status, 1); assert.match(out.stdout, /Skipped 1 non-JSON/);
  assert.match(out.stdout, /Zod: reject/); assert.match(out.stdout, /Note:/);
  const error = cli('examples/bigint.mjs');
  assert.equal(error.status, 2); assert.match(error.stdout, /ERROR:/);
  const decimal = cli('examples/schemas.ts');
  assert.equal(decimal.status, 1); assert.match(decimal.stdout, /#\/multipleOf/);
});
