/** Deterministic, bounded JSON Schema samples. Not exhaustive or a satisfiability solver. */
export function generateSamples(root, { seed = 1, maxSamples = 200, maxDepth = 8 } = {}) {
  let state = seed >>> 0;
  let visits = 0;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const resolve = (ref) => {
    if (!ref.startsWith('#/')) return undefined;
    return ref.slice(2).split('/').reduce((s, k) => s?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], root);
  };
  const generic = [null, false, true, 0, 1, -1, 0.5, '', 'a', [], {}];
  function walk(s, depth) {
    if (++visits > maxSamples * 10 || depth > maxDepth || !s || typeof s !== 'object') return generic;
    if (s.$ref) return walk(resolve(s.$ref), depth + 1);
    const out = [];
    if ('const' in s) out.push(s.const);
    if (s.enum) out.push(...s.enum);
    if ('default' in s) out.push(s.default);
    for (const branches of [s.anyOf, s.oneOf, s.allOf]) {
      if (branches) for (const branch of branches) out.push(...walk(branch, depth + 1));
    }
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (types.includes('number') || types.includes('integer')) {
      const step = types.includes('integer') ? 1 : (s.multipleOf || 0.5);
      const lo = s.minimum ?? s.exclusiveMinimum ?? -2;
      const hi = s.maximum ?? s.exclusiveMaximum ?? lo + 4;
      for (const n of [lo, lo - step, lo + step, hi, hi - step, hi + step, (lo + hi) / 2, s.multipleOf, s.multipleOf && 3 * s.multipleOf]) if (Number.isFinite(n)) out.push(n);
      out.push(Math.floor(random() * 21) - 10);
    }
    if (types.includes('string')) {
      const min = Math.min(s.minLength ?? 0, 1024);
      const max = Math.min(s.maxLength ?? Math.max(min + 2, 4), 1024);
      for (const len of [0, min - 1, min, min + 1, max, max + 1]) if (len >= 0) out.push('a'.repeat(len));
      out.push('😀', '\n', 'user@example.com', 'https://example.com', '2026-01-01T00:00:00Z', '00000000-0000-4000-8000-000000000000');
    }
    if (types.includes('object') || s.properties || s.additionalProperties) {
      const props = s.properties || {};
      const base = {};
      for (const [k, child] of Object.entries(props).slice(0, 64)) {
        const values = walk(child, depth + 1);
        Object.defineProperty(base, k, { value: pickValid(child, values), enumerable: true, configurable: true, writable: true });
      }
      out.push(base);
      for (const k of Object.keys(props).slice(0, 64)) {
        const missing = { ...base }; delete missing[k]; out.push(missing);
        for (const value of walk(props[k], depth + 1).slice(0, 12)) out.push({ ...base, [k]: value });
      }
      out.push({ ...base, __extra: true });
      if (s.additionalProperties && typeof s.additionalProperties === 'object') {
        for (const v of walk(s.additionalProperties, depth + 1).slice(0, 8)) out.push({ key: v });
      }
    }
    if (types.includes('array') || s.prefixItems || s.items) {
      const prefix = (s.prefixItems || []).slice(0, 64);
      const base = prefix.map(child => pickValid(child, walk(child, depth + 1)));
      const item = typeof s.items === 'object' ? s.items : {};
      const val = pickValid(item, walk(item, depth + 1));
      const min = Math.min(s.minItems ?? prefix.length, 64);
      const max = Math.min(s.maxItems ?? min + 2, 64);
      for (const len of [0, min - 1, min, min + 1, max, max + 1]) {
        if (len >= 0) out.push(Array.from({ length: len }, (_, i) => i < base.length ? base[i] : val));
      }
      for (let i = 0; i < prefix.length; i++) for (const v of walk(prefix[i], depth + 1).slice(0, 8)) { const a = [...base]; a[i] = v; out.push(a); }
    }
    return [...out, ...generic].slice(0, maxSamples);
  }
  const seen = new Set();
  return walk(root, 0).filter(v => { const key = JSON.stringify(v); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, maxSamples);
}

// A small seed chooser, not a validator. Ajv performs all real validation later.
function pickValid(s, values) {
  if (s && typeof s === 'object') {
    if ('const' in s) return s.const;
    if (s.enum) return s.enum[0];
    if (s.type === 'string') return 'a'.repeat(Math.min(s.minLength ?? 1, 1024));
    if (s.type === 'number' || s.type === 'integer') return s.minimum ?? (s.exclusiveMinimum !== undefined ? s.exclusiveMinimum + 1 : s.multipleOf ?? 0);
    if (s.type === 'boolean') return true;
    if (s.type === 'null') return null;
  }
  return values[0] ?? null;
        }
