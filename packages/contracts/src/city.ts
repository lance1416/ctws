import { z } from 'zod'

/** City-level places, from a table bundled with the API; no coordinates or streets. */
export const citySearchQuery = z.object({ q: z.string().trim().min(1).max(100) }).strict()

export const city = z
  .object({
    /** The stored spelling: `Oxford, England, United Kingdom`. */
    label: z.string(),
  })
  .strict()
export type City = z.infer<typeof city>

export const citiesResponse = z.object({ cities: z.array(city) }).strict()
