import { z } from 'zod';

export const user = z.object({ name: z.string().min(1), age: z.number().int().min(0).max(120) });
export const coordinates = z.tuple([z.number(), z.number()]);
export const decimal = z.number().multipleOf(0.1);
export const samples = {
  user: [{ name: 'Mango', age: 20 }, { name: '', age: -1 }],
  coordinates: [[1, 2], [1], [1, 2, 3]],
  decimal: [0.3],
};
