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

/** How early to be told of a birthday, as FR-062 words it. */
export const LEAD_LABELS: Record<RemindLead, string> = {
  0: 'On the day',
  1: 'A day before',
  3: '3 days before',
  7: 'A week before',
}

/** The nearest first, as the form offers them (FR-062). */
export const LEAD_CHOICES = [...REMIND_LEADS]
  .sort((a, b) => a - b)
  .map((n) => ({ value: String(n), label: LEAD_LABELS[n] }))
