import { z } from 'zod';
// Source-based fixture selection from Zod's to-json-schema tests.
// See THIRD_PARTY_NOTICES.md and docs/dogfood.md. This is not the full upstream suite.
export const string = z.string();
export const number = z.number();
export const boolean = z.boolean();
export const nullValue = z.null();
export const anything = z.any();
export const unknown = z.unknown();
export const never = z.never();
export const email = z.email();
export const datetime = z.iso.datetime();
export const bounded = z.number().min(5).max(10);
export const exclusive = z.number().gt(5).gt(10);
export const tightInteger = z.number().int().min(0).max(23);
export const divisors = z.number().multipleOf(2).multipleOf(3);
export const impossibleLength = z.string().min(8).length(5);
export const patterns = z.string().startsWith('hello').includes('cruel').includes('dark', { position: 10 }).endsWith('world').regex(/stuff/);
export const array = z.array(z.string());
export const union = z.union([z.string(), z.number()]);
export const nullable = z.string().nullable();
export const record = z.record(z.string(), z.boolean());
export const enumRecord = z.record(z.enum(['key1', 'key2']), z.number());
export const enumDefaultRecord = z.record(z.enum(['key1', 'key2']), z.number().default(0));
export const tuple = z.tuple([z.string(), z.number()]);
export const tupleRest = z.tuple([z.string()], z.number());
export const samples = {
  email: ['a@example.com', 'bad', 'user+tag@sub.example.com'],
  datetime: ['2026-01-01T00:00:00Z', 'bad', '2026-01-01'],
  patterns: ['hellocruel_darkstuffworld', 'hello world'],
  enumRecord: [{ key1: 1, key2: 2 }, { key1: 1 }, {}],
  enumDefaultRecord: [{}, { key1: 1 }, { key1: 1, key2: 2 }],
};
