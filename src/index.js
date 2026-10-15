import { z } from 'zod';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { generateSamples } from './generate.js';
export { generateSamples } from './generate.js';

/** Strict JSON domain check: never silently stringify away bigint/undefined/NaN. */
export function isJsonValue(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  seen.add(value);
  const valid = (Array.isArray(value) ? Array.from(value) : Object.values(value)).every(v => isJsonValue(v, seen));
  seen.delete(value);
  return valid;
}

/** Check one Zod schema in a single io mode. Errors are reported, not mistaken for parity. */
export function checkSchema(schema, options = {}) {
  const { name = 'schema', io = 'input', seed = 1, maxSamples = 200, samples = [], unrepresentable = 'throw' } = options;
  const result = { name, io, status: 'ok', tested: 0, zodAccepted: 0, jsonSchemaAccepted: 0, skippedNonJson: 0, mismatches: [], warnings: [] };
  if (io !== 'input' && io !== 'output') throw new Error('io must be input or output');
  if (!Number.isSafeInteger(maxSamples) || maxSamples < 1 || maxSamples > 10000) throw new Error('maxSamples must be an integer from 1 to 10000');
  try {
    if (!schema?._zod || typeof schema.safeParse !== 'function') throw new Error('Not a Zod 4 schema');
    result.jsonSchema = z.toJSONSchema(schema, { io, target: 'draft-2020-12', unrepresentable });
    const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true, coerceTypes: false, useDefaults: false, removeAdditional: false, logger: { log() {}, warn(message) { result.warnings.push(String(message)); }, error(message) { result.warnings.push(String(message)); } } });
    addFormats(ajv);
    const validate = ajv.compile(result.jsonSchema);
    if (io === 'output') result.warnings.push('Output mode compares acceptance, not parsed outputs. Stripping, defaults and coercion can cause expected differences.');
    if (unrepresentable === 'any') result.warnings.push('Permissive conversion can lose non-JSON semantics. Differences may be expected.');
    const candidates = [...samples, ...generateSamples(result.jsonSchema, { seed, maxSamples })];
    const seen = new Set();
    for (const value of candidates) {
      if (!isJsonValue(value)) { result.skippedNonJson++; continue; }
      const key = JSON.stringify(value);
      if (seen.has(key) || result.tested >= maxSamples) continue;
      seen.add(key);
      // Both validators see the exact same JSON value; no transforms or JSON round-trip.
      const zod = schema.safeParse(value);
      const jsonSchemaAccepts = Boolean(validate(value));
      result.tested++;
      if (zod.success) result.zodAccepted++;
      if (jsonSchemaAccepts) result.jsonSchemaAccepted++;
      if (zod.success !== jsonSchemaAccepts) result.mismatches.push({
        value, zodAccepts: zod.success, jsonSchemaAccepts,
        zodIssues: zod.success ? [] : zod.error.issues.map(({ code, path, message }) => ({ code, path, message })),
        jsonSchemaErrors: validate.errors ? structuredClone(validate.errors) : [],
      });
    }
    if (!result.zodAccepted) result.warnings.push('No sampled value was accepted by Zod. Supply valid examples through the samples export.');
  } catch (error) {
    result.status = 'error';
    result.error = error instanceof Error ? error.message : String(error);
  }
  return result;
}
