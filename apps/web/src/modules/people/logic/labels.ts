import { type Gender, REMIND_LEADS, type RemindLead } from '@ctws/contracts'
import type { Choice } from '../../../platform/ui/inline'

/** In the form's order (FR-062): Male, Female, Other, then Not set. */
const GENDER_LABELS: Record<Gender, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
}

/** In the order of `GENDER_LABELS`, Not set last (N-04). */
export const GENDER_CHOICES: Choice<Gender | null>[] = [
  ...(Object.keys(GENDER_LABELS) as Gender[]).map((value) => ({
    value,
    label: GENDER_LABELS[value],
  })),
  { value: null, label: 'Not set' },
]

/** How early to be told of a birthday. */
export const LEAD_LABELS: Record<RemindLead, string> = {
  7: '1 week before',
  3: '3 days before',
  1: '1 day before',
  0: 'On the day',
}

export const LEAD_CHOICES = REMIND_LEADS.map((n) => ({ value: String(n), label: LEAD_LABELS[n] }))
