import { z } from 'zod';
// Historical motivating issue: https://github.com/colinhacks/zod/issues/6625
// BigInt is not JSON. Never round it by JSON conversion.
export const largeLiteral = z.literal(9007199254740993n);
export const samples = { largeLiteral: [9007199254740993n, 9007199254740992] };
