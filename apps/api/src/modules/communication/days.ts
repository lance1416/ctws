import { DAY_MS } from '@ctws/contracts'

/** Whole days from one calendar day to another, negative when `to` is earlier. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
