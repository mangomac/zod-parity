#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { checkSchema } from '../src/index.js';
const help = `zod-parity <schemas.ts|schemas.mjs> [options]

Compare Zod 4 acceptance with its generated draft-2020-12 JSON Schema.
Runs your module as code. Only load modules you trust.

  --io input|output|both      Mode (default: input)
  --seed N                   Deterministic sample seed (default: 1)
  --max-samples N            Per schema/mode cap, 1..10000 (default: 200)
  --unrepresentable throw|any Default: throw. 'any' allows expected gaps.
  --json                     Machine-readable report
  --help                     Show help

Export named schemas, a default schema, or a default object of schemas.
Optional export 'samples': { schemaName: [JSON values...] }.
Exit: 0 no sampled differences; 1 differences; 2 load/conversion/validation error.
No sampled differences is NOT proof of equivalence.`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    io: { type: 'string', default: 'input' }, seed: { type: 'string', default: '1' },
    'max-samples': { type: 'string', default: '200' }, unrepresentable: { type: 'string', default: 'throw' },
    json: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } });
  if (values.help) { console.log(help); process.exit(0); }
  if (positionals.length !== 1) throw new Error('Expected one module path. Use --help for usage.');
  if (!['input', 'output', 'both'].includes(values.io)) throw new Error('--io must be input, output, or both');
  if (!['throw', 'any'].includes(values.unrepresentable)) throw new Error('--unrepresentable must be throw or any');
  const seed = Number(values.seed), maxSamples = Number(values['max-samples']);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('--seed must be an integer from 0 to 4294967295');
  if (!Number.isSafeInteger(maxSamples) || maxSamples < 1 || maxSamples > 10000) throw new Error('--max-samples must be an integer from 1 to 10000');
  const mod = await import(pathToFileURL(resolve(positionals[0])).href);
  const schemas = new Map();
  const add = (name, value) => { if (value?._zod && typeof value.safeParse === 'function') schemas.set(name, value); };
  for (const [name, value] of Object.entries(mod)) {
    if (name === 'default' && value && !value._zod && typeof value === 'object') for (const [key, schema] of Object.entries(value)) add(key, schema);
    else add(name, value);
  }
  if (!schemas.size) throw new Error('No exported Zod 4 schemas found');
  if (mod.samples !== undefined && (!mod.samples || typeof mod.samples !== 'object' || Array.isArray(mod.samples))) throw new Error('samples must be an object mapping schema names to arrays');
  const results = [];
  for (const [name, schema] of schemas) {
    const samples = mod.samples?.[name] ?? [];
    if (!Array.isArray(samples)) throw new Error(`samples.${name} must be an array`);
    for (const io of values.io === 'both' ? ['input', 'output'] : [values.io]) results.push(checkSchema(schema, { name, io, seed, maxSamples, samples, unrepresentable: values.unrepresentable }));
  }
  const report = { tool: 'zod-parity', version: '0.1.0', seed, maxSamples, results,
    summary: { schemas: schemas.size, runs: results.length, tested: results.reduce((a, r) => a + r.tested, 0), mismatches: results.reduce((a, r) => a + r.mismatches.length, 0), errors: results.filter(r => r.status === 'error').length } };
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('zod-parity 0.1.0 | Zod 4 vs JSON Schema draft-2020-12');
    for (const r of results) {
      console.log(`${r.name} [${r.io}]: ${r.status === 'error' ? 'ERROR: ' + r.error : r.tested + ' samples, ' + r.mismatches.length + ' differences'}`);
      for (const m of r.mismatches) {
        console.log(`  ${JSON.stringify(m.value)} | Zod: ${m.zodAccepts ? 'accept' : 'reject'} | JSON Schema: ${m.jsonSchemaAccepts ? 'accept' : 'reject'}`);
        for (const e of m.jsonSchemaErrors) console.log(`    ${e.instancePath || '/'} -> ${e.schemaPath}: ${e.message}`);
        if (!m.zodAccepts) for (const e of m.zodIssues) console.log(`    Zod ${JSON.stringify(e.path)}: ${e.message}`);
      }
      for (const w of r.warnings) console.log(`  Note: ${w}`);
      if (r.skippedNonJson) console.log(`  Skipped ${r.skippedNonJson} non-JSON supplied values (no lossy conversion).`);
    }
    console.log(`Total: ${report.summary.tested} samples, ${report.summary.mismatches} differences, ${report.summary.errors} errors.`);
    console.log('Sampling is not proof of equivalence. A difference is not automatically a Zod bug.');
  }
  process.exitCode = report.summary.errors ? 2 : report.summary.mismatches ? 1 : 0;
} catch (error) {
  console.error(`zod-parity: ${error.message}`);
  process.exitCode = 2;
}
