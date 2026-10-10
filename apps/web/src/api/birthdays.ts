import type { BirthdaysResponse } from '@ctws/contracts'
import { apiFetch } from '../api'

/**
 * The birthdays page, in one request: the segments, the month index and the circle counts are all
 * worked out by the server (design spec section 8.4), so there is nothing here but the fetch.
 */
export const birthdaysKey = () => ['birthdays'] as const

export function listBirthdays(): Promise<BirthdaysResponse> {
  return apiFetch('/contacts/birthdays')
}
