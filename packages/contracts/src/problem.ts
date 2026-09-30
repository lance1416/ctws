import { z } from 'zod'

/** RFC 9457 Problem Details */
export const problem = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
  })
  .strict()

export type Problem = z.infer<typeof problem>
