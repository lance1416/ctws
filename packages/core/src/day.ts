/** A calendar day `n` days from `day`; both `YYYY-MM-DD`, no time of day involved. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** `day` plus `n` months, kept to the month's last day when it is shorter (Jan 31 → Feb 28). */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const total = y * 12 + (m - 1) + n
  const year = Math.floor(total / 12)
  const month = (total % 12) + 1
  const dd = Math.min(d, new Date(Date.UTC(year, month, 0)).getUTCDate())
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}
