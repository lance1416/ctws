import { LunarDay, LunarMonth, LunarYear, SolarDay } from 'tyme4ts'

/**
 * 生日的算术（生日 spec §3）。本文件不碰时钟、不碰时区、不碰数据库：「今天」是调用方给的一个
 * `YYYY-MM-DD`，由 Postgres 在账户时区算出来，和 `today.ts` 同一套办法。
 *
 * 为什么是一个库而不是一张表：农历需要每年的月长与闰月数据，手写就是抄一份年表。`tyme4ts` 是
 * MIT、零依赖；更流行的 `lunisolar` 是 GPL-3.0，会把整个分发拖进 GPL，所以不用。
 *
 * 库会做对的事和不会做的事，都是实测的：
 *   - 它**不**替你决定闰月生日在没有闰月的年份怎么办，直接抛 `illegal leap month`；
 *   - 农历三十遇 29 天的月同样抛 `illegal day`；
 *   - `LunarDay.getYearSixtyCycle()` 是干支年、**立春**换岁，拿它当生肖会让正月初一到立春之间
 *     出生的人全错一个属相。生肖要走农历年（`getLunarMonth().getLunarYear()`）。
 *
 * 所以下面三条回退规则是本应用自己的，不是库的，并且界面必须把它们**说出来**：
 *   - 闰 M 月生的人，没有闰 M 月的年份过正常 M 月；
 *   - 农历三十遇小月，过该月最后一天（廿九），不跨月；
 *   - 公历 2 月 29 日生的人，平年过 2 月 28 日。
 * 三条都朝「早」，与民间「生日紧前，不紧后」一致。
 */

export type BirthdayCalendar = 'solar' | 'lunar'

/** 一个人的生日，按他被给的那本历法存。`year` 为空 = 只知月日（RFC 6350 的 `--MMDD`）。 */
export type Birthday = {
  calendar: BirthdayCalendar
  year: number | null
  month: number
  day: number
  /** 仅农历有意义：出生在闰月。 */
  leapMonth: boolean
}

/** 这一年没有他出生的那一天，于是日子被挪动过——界面要把每一条都写出来。 */
export type Kept = 'leap-month' | 'short-month' | 'short-february'

export type Occurrence = {
  /** 下一次是哪天，账户时区的日历日。 */
  day: string
  /** 距今几天，0 就是今天。 */
  inDays: number
  /** 那天满几岁；没有年份时为 null。农历生日按**农历年**相减。 */
  turns: number | null
  /** 可能两条同时成立（闰六月三十），所以是数组。 */
  kept: Kept[]
}

/** 十二时辰，连它们的钟点区间。界面只拿这个数组，不自己拼字。 */
export const HOUR_BRANCHES = [
  '子时 · 23–01',
  '丑时 · 01–03',
  '寅时 · 03–05',
  '卯时 · 05–07',
  '辰时 · 07–09',
  '巳时 · 09–11',
  '午时 · 11–13',
  '未时 · 13–15',
  '申时 · 15–17',
  '酉时 · 17–19',
  '戌时 · 19–21',
  '亥时 · 21–23',
] as const

const iso = (d: SolarDay): string =>
  `${d.getYear()}-${String(d.getMonth()).padStart(2, '0')}-${String(d.getDay()).padStart(2, '0')}`

const parseDay = (day: string): SolarDay => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return SolarDay.fromYmd(y, m, d)
}

/** 两个日历日之间的天数。用 UTC 做算术，因为这里只有日期、没有时刻，夏令时碰不到它。 */
const daysBetween = (from: SolarDay, to: SolarDay): number =>
  Math.round(
    (Date.UTC(to.getYear(), to.getMonth() - 1, to.getDay()) -
      Date.UTC(from.getYear(), from.getMonth() - 1, from.getDay())) /
      86_400_000,
  )

const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0

export function nextOccurrence(b: Birthday, today: string): Occurrence {
  const from = parseDay(today)
  return b.calendar === 'solar' ? nextSolar(b, from) : nextLunar(b, from)
}

function nextSolar(b: Birthday, from: SolarDay): Occurrence {
  for (let y = from.getYear(); y <= from.getYear() + 1; y++) {
    const kept: Kept[] = []
    let day = b.day
    if (b.month === 2 && b.day === 29 && !isLeapYear(y)) {
      day = 28
      kept.push('short-february')
    }
    const cand = SolarDay.fromYmd(y, b.month, day)
    const inDays = daysBetween(from, cand)
    if (inDays >= 0) {
      return { day: iso(cand), inDays, turns: b.year === null ? null : y - b.year, kept }
    }
  }
  throw new Error('a solar anniversary recurs every year')
}

function nextLunar(b: Birthday, from: SolarDay): Occurrence {
  const startYear = from.getLunarDay().getLunarMonth().getLunarYear().getYear()
  // 三年够了：闰月最长间隔不到三个农历年，而小月回退不需要换年。
  for (let y = startYear; y <= startYear + 2; y++) {
    const kept: Kept[] = []
    let month = b.month
    if (b.leapMonth) {
      if (LunarYear.fromYear(y).getLeapMonth() === b.month) month = -b.month
      else kept.push('leap-month')
    }
    let day = b.day
    const length = LunarMonth.fromYm(y, month).getDayCount()
    if (day > length) {
      day = length
      kept.push('short-month')
    }
    const cand = LunarDay.fromYmd(y, month, day).getSolarDay()
    const inDays = daysBetween(from, cand)
    if (inDays >= 0) {
      // 年龄按农历年相减：十二月的生日落在次年公历，按公历年减会多一岁。
      return { day: iso(cand), inDays, turns: b.year === null ? null : y - b.year, kept }
    }
  }
  throw new Error('a lunar anniversary recurs within three lunar years')
}

export type BirthdayFacts = {
  /** 农历生日自己的复发日，「农历九月初三」。公历生日为 null：它的农历日期逐年漂移，不是复发日。 */
  lunarDate: string | null
  /** 出生那天的公历日期，没有年份时为 null。 */
  bornSolar: string | null
  /** 出生那天的农历写法，「农历辛未年九月初三」，没有年份时为 null。 */
  bornLunar: string | null
  /** 生肖。要年份，所以没有年份时为 null。 */
  zodiac: string | null
  /** 星座。公历生日总有；**没有年份的农历生日没有**（对应的公历日期逐年移动，星座不唯一）。 */
  sign: string | null
  hour: string | null
}

export function factsOf(b: Birthday, hourBranch: number | null): BirthdayFacts {
  const born = bornDay(b)
  return {
    lunarDate: b.calendar === 'lunar' ? lunarDateLabel(b) : null,
    bornSolar: born ? iso(born) : null,
    bornLunar: born ? born.getLunarDay().toString() : null,
    zodiac: born
      ? born
          .getLunarDay()
          .getLunarMonth()
          .getLunarYear()
          .getSixtyCycle()
          .getEarthBranch()
          .getZodiac()
          .toString()
      : null,
    sign: signOf(b, born),
    hour: hourBranch === null ? null : (HOUR_BRANCHES[hourBranch] ?? null),
  }
}

/** 出生那一天，公历。没有年份时无从得知。 */
function bornDay(b: Birthday): SolarDay | null {
  if (b.year === null) return null
  if (b.calendar === 'solar') {
    const day = b.month === 2 && b.day === 29 && !isLeapYear(b.year) ? 28 : b.day
    return SolarDay.fromYmd(b.year, b.month, day)
  }
  return LunarDay.fromYmd(b.year, b.leapMonth ? -b.month : b.month, b.day).getSolarDay()
}

function signOf(b: Birthday, born: SolarDay | null): string | null {
  if (born) return born.getConstellation().toString()
  // 没有年份：公历月日仍然落在同一个星座里（星座表是固定日期），拿一个闰年来问就行。
  // 农历月日不行：九月初三在公历九月底到十月底之间移动，星座不唯一。
  if (b.calendar === 'solar') {
    return SolarDay.fromYmd(2000, b.month, b.day).getConstellation().toString()
  }
  return null
}

/** 「农历九月初三」/「农历闰六月十五」——复发日，里面没有年份。 */
function lunarDateLabel(b: Birthday): string {
  // 2000 年十二个月都在，拿它只为取月名与日名；闰字自己加，因为任一具体年份都未必闰这个月。
  const month = LunarMonth.fromYm(2000, b.month)
  const day = LunarDay.fromYmd(2000, b.month, Math.min(b.day, month.getDayCount())).getName()
  return `农历${b.leapMonth ? '闰' : ''}${month.getName()}${day}`
}

/** 日历格子里那一行小字：「初三」，月初写上月名「九月初一」。 */
export function lunarDayLabel(day: string): string {
  const lunar = parseDay(day).getLunarDay()
  const name = lunar.getName()
  return name === '初一' ? `${lunar.getLunarMonth().getName()}${name}` : name
}
