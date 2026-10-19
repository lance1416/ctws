import { z } from 'zod'

/** City-level places, from a table bundled with the API; no coordinates or streets. */
export const citySearchQuery = z.object({ q: z.string().trim().min(1).max(100) }).strict()

const city = z.object({
  /** The stored spelling: `Oxford, England, United Kingdom`. */
  label: z.string(),
  /** `name|region|country`: what a person's city stores beside the label, to tell namesakes apart. */
  key: z.string(),
  /** The IANA zone the city keeps time in (GeoNames): a person living there defaults to it. */
  timeZone: z.string(),
})
export type City = z.infer<typeof city>

export const citiesResponse = z.object({ cities: z.array(city) })
