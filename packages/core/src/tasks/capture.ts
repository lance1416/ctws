import { TZDate } from '@date-fns/tz'
import { REPEAT_UNITS, WEEKDAY_CODES, type ProjectId, type Repeat } from '@ctws/contracts'
import { parseDay } from '../dates/parse'
import { firstRepeatDay } from './repeat'

/** A stretch of the typed text, by UTF-16 index as `input.value` counts: end exclusive. */
type Span = { start: number; end: number }

type CaptureMark = Span & { kind: 'scheduled' | 'due' | 'repeat' | 'project' }

export type Capture = {
  /** What was typed, less what was read out of it, spaces closed up. */
  title: string
  projectId: ProjectId | null
  scheduledOn: string | null
  /** An instant; a deadline given as a day ends at 23:59 there, as the date pickers set it. */
  dueAt: string | null
  repeat: Repeat | null
  marks: CaptureMark[]
}

export type CaptureContext = {
  /** `YYYY-MM-DD` in the account's zone. */
  today: string
  /** The account's IANA zone, which a deadline's time of day is in. */
  zone: string
  projects: readonly { id: ProjectId; name: string }[]
  /** Stretches the person turned back into plain words: nothing in them is read. */
  ignored: readonly Span[]
}

// Not a letter or digit on either side: "mon" is not read inside "lemon", but "Monday" is read
// in "Monday.com", for the person to turn back if they meant the company.
const EDGE_BEFORE = '(?<![\\p{L}\\p{N}])'
const EDGE_AFTER = '(?![\\p{L}\\p{N}])'

const WEEKDAY =
  'mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?'
const MONTH =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?'
const ORDINAL = '(?:st|nd|rd|th)?'
// The ways of naming a day the capture box reads. Not "11/12": which is the month is a guess.
const DAY = [
  'today',
  'tomorrow',
  'next week',
  WEEKDAY,
  `(?:${MONTH}) \\d{1,2}${ORDINAL}`,
  `\\d{1,2}${ORDINAL} (?:${MONTH})`,
  '\\d{4}-\\d{2}-\\d{2}',
].join('|')
const TIME = 'at (\\d{1,2})(?::(\\d{2}))? ?(am|pm)?'

const pattern = (body: string) => new RegExp(`${EDGE_BEFORE}(?:${body})${EDGE_AFTER}`, 'giu')
const DUE = pattern(`(?:due|by) (${DAY})(?: ${TIME})?`)
const SCHEDULED = pattern(DAY)
const REPEAT = pattern(
  `every (?:(other) |(\\d{1,3}) )?(?:(${WEEKDAY})|(day|week|month|year)s?)` +
    `(?: on the (\\d{1,2})${ORDINAL}| on (${MONTH}) (\\d{1,2})${ORDINAL})?( after done)?`,
)

/** 0 (Sunday) to 6 for a weekday as the capture box reads it. */
const weekdayNumber = (word: string) =>
  ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(word.slice(0, 3).toLowerCase())

/** 1 to 12 for a month as the capture box reads it. */
const monthNumber = (word: string) =>
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
    word.slice(0, 3).toLowerCase(),
  ) + 1

/** The repeat "every …" says, or null for a combination that says nothing sensible. */
function repeatOf(m: RegExpExecArray): Repeat | null {
  const [, other, count, weekday, unit, monthDay, onMonth, onDay, afterDone] = m
  const interval = other ? 2 : count ? Number(count) : 1
  if (interval < 1) return null
  if (afterDone) {
    // A year after done is not a while the editor offers, so it is not read either.
    const after = REPEAT_UNITS.find((u) => u === unit?.toLowerCase())
    if (!after || monthDay || onMonth || other || interval > 365) return null
    return { kind: 'after', every: interval, unit: after }
  }
  if (interval > 99) return null
  const every = interval > 1 ? `;INTERVAL=${interval}` : ''
  if (weekday) {
    if (count) return null
    return {
      kind: 'rule',
      rule: `FREQ=WEEKLY${every};BYDAY=${WEEKDAY_CODES[weekdayNumber(weekday)]}`,
    }
  }
  const u = unit!.toLowerCase()
  if (monthDay && u !== 'month') return null
  if (onMonth && u !== 'year') return null
  const day = Number(monthDay ?? onDay)
  if ((monthDay || onDay) && (day < 1 || day > 31)) return null
  const freq = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }[u]
  const on =
    u === 'month' && monthDay
      ? `;BYMONTHDAY=${day}`
      : u === 'year' && onMonth
        ? `;BYMONTH=${monthNumber(onMonth)};BYMONTHDAY=${day}`
        : ''
  return { kind: 'rule', rule: `FREQ=${freq}${every}${on}` }
}

/** The instant a deadline names: its day at its time in `zone`, or at 23:59 with no time. */
function dueInstant(day: string, m: RegExpExecArray, zone: string): string | null {
  const [, , hourText, minuteText, meridiem] = m
  let hour = 23
  let minute = 59
  if (hourText !== undefined) {
    hour = Number(hourText)
    minute = minuteText === undefined ? 0 : Number(minuteText)
    if (meridiem) {
      if (hour < 1 || hour > 12) return null
      hour = (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0)
    }
    if (hour > 23 || minute > 59) return null
  }
  const [y, mo, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(new TZDate(y, mo - 1, d, hour, minute, 0, 0, zone).getTime()).toISOString()
}

type Found = Span & { kind: CaptureMark['kind']; value: unknown }

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end

/**
 * What a line typed into the capture box says beyond its title: the day it is planned for, its
 * deadline, how it repeats and the project it goes in, each with where it was read so the box
 * can mark it. Only words the person has not turned back are read. Of two plans, two deadlines,
 * two repeats or two projects, the last is read and the earlier stay words in the title.
 * Nothing here reads a clock: `today` and the zone are given.
 */
export function parseCapture(text: string, ctx: CaptureContext): Capture {
  const found: Found[] = []
  const free = (s: Span) =>
    !ctx.ignored.some((i) => overlaps(i, s)) && !found.some((f) => overlaps(f, s))
  const scan = (re: RegExp, read: (m: RegExpExecArray) => Omit<Found, 'start' | 'end'> | null) => {
    for (const m of text.matchAll(re)) {
      const span = { start: m.index, end: m.index + m[0].length }
      const value = free(span) ? read(m) : null
      if (value) found.push({ ...span, ...value })
    }
  }

  scan(REPEAT, (m) => {
    const value = repeatOf(m)
    return value ? { kind: 'repeat', value } : null
  })
  scan(DUE, (m) => {
    const day = parseDay(m[1]!, ctx.today)
    const at = day ? dueInstant(day, m, ctx.zone) : null
    return at ? { kind: 'due', value: at } : null
  })
  scan(SCHEDULED, (m) => {
    const day = parseDay(m[0], ctx.today)
    return day ? { kind: 'scheduled', value: day } : null
  })
  // A project by its name after "#", spaces and all; the longest name that fits wins, so
  // "#Atlas web" is that project, not "Atlas" with "web" after it.
  const byLength = [...ctx.projects].sort((a, b) => b.name.length - a.name.length)
  for (let at = text.indexOf('#'); at !== -1; at = text.indexOf('#', at + 1)) {
    const rest = text.slice(at + 1).toLowerCase()
    const project = byLength.find(
      (p) =>
        p.name !== '' &&
        rest.startsWith(p.name.toLowerCase()) &&
        !/[\p{L}\p{N}]/u.test(rest.charAt(p.name.length)),
    )
    const span = project ? { start: at, end: at + 1 + project.name.length } : null
    if (project && span && free(span)) found.push({ ...span, kind: 'project', value: project.id })
  }

  const kept = (['repeat', 'due', 'scheduled', 'project'] as const).flatMap((kind) => {
    const last = found
      .filter((f) => f.kind === kind)
      .sort((a, b) => a.start - b.start)
      .at(-1)
    return last ? [last] : []
  })
  const valueOf = <T>(kind: Found['kind']) =>
    (kept.find((f) => f.kind === kind)?.value ?? null) as T | null

  let title = ''
  let from = 0
  for (const span of [...kept].sort((a, b) => a.start - b.start)) {
    title += `${text.slice(from, span.start)} `
    from = span.end
  }
  title = (title + text.slice(from)).replace(/\s+/g, ' ').trim()

  const repeat = valueOf<Repeat>('repeat')
  const dueAt = valueOf<string>('due')
  let scheduledOn = valueOf<string>('scheduled')
  // A repeat follows the plan, or the deadline when there is only that; with neither, it is
  // planned for the first day it falls on.
  if (repeat && scheduledOn === null && dueAt === null) {
    scheduledOn = firstRepeatDay(repeat, ctx.today)
  }

  return {
    title,
    projectId: valueOf<ProjectId>('project'),
    scheduledOn,
    dueAt,
    repeat,
    marks: kept
      .map(({ start, end, kind }) => ({ start, end, kind }))
      .sort((a, b) => a.start - b.start),
  }
}
