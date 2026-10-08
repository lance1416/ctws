/**
 * THE ONE COPY OF THE SUITE'S DATE ARITHMETIC (the tail of D70).
 *
 * Five specs had written out their own `ymd` / `dayOffset` / `nextMondayYmd`, each a few lines
 * and each subtly its own. That is how `pane.spec.ts` came to assert that "four days from now"
 * and "next Monday" are different days -- true on six days of the week, and on Thursdays the
 * test hung waiting for a request the app was right not to send.
 *
 * THESE ARE THE RUNNER'S LOCAL DAYS, which is what the suite wants almost everywhere: the
 * browser registers its user with its own zone, so the account's days and the runner's are the
 * same. `timezone.spec.ts` is the deliberate exception and computes its own, in the zone it
 * sets; see the note there.
 */

/** A local calendar day, `YYYY-MM-DD`. */
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** `n` days from today, as a calendar day. Negative is the past. */
export function dayOffset(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/** The Monday the app's 「排到下周」 means: the next one, never today. */
export function nextMondayYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() + (d.getDay() === 0 ? 1 : 8 - d.getDay()))
  return ymd(d)
}

/** The calendar day after `day`. Noon UTC, so no offset can push it across a boundary. */
export function dayAfter(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
