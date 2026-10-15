import type { Circle, RemindLead } from '@ctws/contracts'

const CIRCLES = ['family', 'friend', 'work'] as const

export const CIRCLE_LABELS: Record<Circle, string> = {
  family: 'Family',
  friend: 'Friends',
  work: 'Work',
}

/** One person's circle, said of them: "Friend", not "Friends". */
export const CIRCLE_OF_ONE: Record<Circle, string> = {
  family: 'Family',
  friend: 'Friend',
  work: 'Work',
}

export const CIRCLE_CHOICES = [
  { value: '', label: 'Not set' },
  ...CIRCLES.map((c) => ({ value: c, label: CIRCLE_LABELS[c] })),
]

export const GENDER_LABELS: Record<string, string> = {
  female: 'Female',
  male: 'Male',
  other: 'Other',
}

export const GENDER_CHOICES = [
  { value: '', label: 'Not set' },
  ...Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label })),
]

/** How early to be told of a birthday. */
export const LEADS: readonly [RemindLead, string][] = [
  [7, '1 week before'],
  [3, '3 days before'],
  [1, '1 day before'],
  [0, 'On the day'],
]

export const leadLabel = (lead: number) =>
  LEADS.find(([n]) => n === lead)?.[1] ?? `${lead} days before`

/** Months spelled out, for lists read down; a date beside a name takes the short `MONTHS`. */
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const
