/** How long since: "4 months", "a year", "2 years"; a month at least, since it is 90 days on. */
export function sinceWords(day: string, today: string): string {
  const [y1, m1, d1] = day.split('-').map(Number) as [number, number, number]
  const [y2, m2, d2] = today.split('-').map(Number) as [number, number, number]
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
  if (months < 12) return `${Math.max(months, 1)} month${months > 1 ? 's' : ''}`
  const years = Math.floor(months / 12)
  return years === 1 ? 'a year' : `${years} years`
}
