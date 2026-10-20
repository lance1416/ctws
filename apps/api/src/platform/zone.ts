import { TZDate } from '@date-fns/tz'

/** A wall-clock time with no zone, `YYYY-MM-DDTHH:mm`: a meeting's local start, an occurrence's id. */
export type LocalTime = string

const pad = (n: number) => String(n).padStart(2, '0')

function split(local: LocalTime): [number, number, number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) throw new Error(`not a local time: ${local}`)
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])]
}

/**
 * The instant a wall clock names in a zone. A time skipped by spring-forward resolves to the
 * instant after the jump, as calendars do.
 */
export function instantOf(local: LocalTime, timeZone: string): Date {
  const [y, m, d, hh, mm] = split(local)
  return new Date(new TZDate(y, m - 1, d, hh, mm, 0, 0, timeZone).getTime())
}

/** The wall clock an instant shows in a zone; the inverse of `instantOf`. */
export function localOf(instant: Date, timeZone: string): LocalTime {
  const at = new TZDate(instant, timeZone)
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `T${pad(at.getHours())}:${pad(at.getMinutes())}`
  )
}
