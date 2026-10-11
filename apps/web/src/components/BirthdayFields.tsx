import type {
  BirthdayPreviewResponse,
  BirthdayResponse,
  ContactResponse,
  RemindLead,
} from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'
import { previewBirthday, type BirthdayDraft } from '../api/contacts'
import { countdownPhrase, shortDay, todayIn } from '../dueAt'
import { useTimeZone } from '../useMe'
import { Field } from './Field'
import { PickOne } from './inline'
import { textbox } from './formStyles'

/**
 * A PERSON'S BIRTHDAY, on their own page.
 *
 * This is the ONE place a birthday can be written (Google and Apple have the same shape: the date
 * is a field on the person and the calendar is a derived, read-only view). The zodiac, the sign,
 * the age and the other calendar are DERIVED, so they are not editable -- giving them an input
 * would be inviting someone to make them disagree with the date they come from.
 *
 * THE LABELS BELOW ARE THIS FILE'S OWN, not `@ctws/core`'s. Importing core would drag `tyme4ts`
 * into the browser bundle, and keeping those 750 KB on the server is the whole reason the
 * conversions happen there (birthdays spec §3).
 */

const LUNAR_MONTHS = [
  '正月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
]

const LUNAR_DAYS = [
  '初一',
  '初二',
  '初三',
  '初四',
  '初五',
  '初六',
  '初七',
  '初八',
  '初九',
  '初十',
  '十一',
  '十二',
  '十三',
  '十四',
  '十五',
  '十六',
  '十七',
  '十八',
  '十九',
  '二十',
  '廿一',
  '廿二',
  '廿三',
  '廿四',
  '廿五',
  '廿六',
  '廿七',
  '廿八',
  '廿九',
  '三十',
]

const HOURS = [
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
]

/** How early to be told. ONE choice of four, not four switches: see the workbench card. */
const LEADS: readonly [RemindLead, string][] = [
  [7, '1 week before'],
  [3, '3 days before'],
  [1, '1 day before'],
  [0, 'On the day'],
]

const leadLabel = (lead: number) => LEADS.find(([n]) => n === lead)?.[1] ?? `${lead} days before`

/**
 * 一个人的生日，在他的页面上就是一格。
 *
 * 和「家乡」「现居」一样宽、一样响：一张联系人页是用来认出一个人、找到一个人的，而农历、生肖、
 * 星座、时辰、下一次、提前量是生日管家那边的事。它们在点开之后才出现（`aria-expanded`），展开的
 * 那一块横跨整行 —— 浮层要处理定位、裁剪与焦点，而这里只是把二级信息放到第二层。
 */
/**
 * 一个人的生日，在他那一层上就是一格。
 *
 * 和「家乡」「现居」一样宽、一样响：一张联系人页是用来认出一个人、找到一个人的，而农历、生肖、
 * 星座、时辰、下一次、提前量是生日管家那边的事。它们在点开之后才出现（`aria-expanded`），展开的
 * 那一块横跨整行 —— 浮层要处理定位、裁剪与焦点，而这里只是把二级信息放到第二层。
 *
 * 这里只读：改生日和改别的字段走同一条路（那张表里的 `Birthday`），一个人不该有两个编辑入口。
 */
export function BirthdayFields({ contact }: { contact: ContactResponse }) {
  const [open, setOpen] = useState(false)
  const b = contact.birthday

  return (
    <>
      <Field label="Birthday" shape="above">
        <button
          type="button"
          aria-expanded={open}
          aria-label={b ? `Birthday, ${givenDate(b)}` : 'Birthday, not set'}
          disabled={!b}
          onClick={() => setOpen(!open)}
          className={`-mx-1.5 flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left text-sm ${
            b ? 'text-fg hover:bg-surface-hover' : 'text-fg-subtle'
          }`}
        >
          <span className="truncate">{b ? givenDate(b) : 'Not set'}</span>
          {b && (
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-fg-subtle">
              <path
                d="M4 6.5l4 4 4-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </Field>

      {open && b && (
        <div
          data-birthday-more
          className="col-span-full rounded-lg border border-border-strong bg-surface-raised p-3"
        >
          <BirthdayRead birthday={b} />
        </div>
      )}
    </>
  )
}

/**
 * 一份草稿读成一行字：表里那个按钮上写的就是它。
 *
 * 和 `givenDate` 不同：那一个读的是服务端算过的回显（`农历甲申年十二月三十`），而草稿还没存，
 * 手里只有输入的那几个数。
 */
export function plainDate(d: BirthdayDraft): string {
  const month =
    d.calendar === 'lunar'
      ? `${d.leapMonth ? '闰' : ''}${LUNAR_MONTHS[d.month - 1]}`
      : SOLAR_MONTHS[d.month - 1]
  const day = d.calendar === 'lunar' ? LUNAR_DAYS[d.day - 1] : String(d.day)
  return [d.year === null ? null : `${d.year}`, month, day].filter(Boolean).join(' ')
}

/** 当初写下的那一天，照它被写下时的历法。年份不知道就只说月日。 */
function givenDate(b: BirthdayResponse): string {
  if (b.calendar === 'lunar') return b.bornLunar ?? b.lunarDate ?? ''
  return b.bornSolar ?? `${SOLAR_MONTHS[b.month - 1]} ${b.day}`
}

/**
 * 二级面板的内容：下一次、派生的那几样、挪动的理由，以及提前量。
 *
 * 一件事一行。这一段以前是跑在一起的一段话，而日期、距离、周岁、生肖、时辰是五种不同的东西。
 */
function BirthdayRead({ birthday: b }: { birthday: BirthdayResponse }) {
  const today = todayIn(useTimeZone())
  return (
    <div data-birthday className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted tabular-nums">
        Next <span className="font-medium text-fg">{shortDay(b.next.day, today)}</span>
        <span className="text-fg-subtle"> · </span>
        {countdownPhrase(b.next.inDays)}
        {b.next.turns !== null && (
          <>
            <span className="text-fg-subtle"> · </span>turns {b.next.turns}
          </>
        )}
      </p>

      {(b.lunarDate || b.bornLunar || b.zodiac || b.sign || b.hour) && (
        <div className="flex flex-wrap gap-1.5">
          {b.calendar === 'solar' && (b.bornLunar || b.lunarDate) && (
            <Chip>{b.bornLunar ?? b.lunarDate}</Chip>
          )}
          {b.zodiac && <Chip>{b.zodiac}</Chip>}
          {b.sign && <Chip>{b.sign}</Chip>}
          {b.hour && <Chip>{b.hour}</Chip>}
        </div>
      )}

      {b.next.keptNote && <p className="text-xs text-plan">{b.next.keptNote}</p>}

      <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
        <span className="text-xs text-fg-muted">Tell me</span>
        <span className="text-sm text-fg">{leadLabel(b.remindLead)}</span>
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      data-birthday-chip
      className="inline-flex h-[22px] items-center rounded-md border border-border-subtle px-2 text-xs text-fg-muted"
    >
      {children}
    </span>
  )
}

/**
 * Writing one down. The derived line under the fields comes from the SERVER, so the rules that
 * decide it have exactly one implementation.
 */
/**
 * 草稿的起点。写一个新的人时也要用它，所以它不在表单里面。
 */
export function birthdayDraftOf(birthday: BirthdayResponse | null): BirthdayDraft {
  return {
    calendar: birthday?.calendar ?? 'solar',
    year: birthday?.year ?? null,
    month: birthday?.month ?? 1,
    day: birthday?.day ?? 1,
    leapMonth: birthday?.leapMonth ?? false,
    hourBranch: birthday?.hourBranch ?? null,
    remindLead: (birthday?.remindLead ?? 7) as RemindLead,
  }
}

/**
 * 日子本身，没有按钮。
 *
 * 一个人的生日有两个写下的时刻——在他的页面上改，和写下这个人的时候顺手记上——而两处的规则必须
 * 是同一套（预览、闰月、服务端那句拒绝）。所以控件在这里，按钮归调用者：页面有自己的 Save，
 * 对话框只有一个 Create。
 */
export function BirthdayEditor({
  birthday,
  onChange,
}: {
  birthday: BirthdayResponse | null
  /** 每次改动都把草稿和「服务端已经拒了它」一起报上去。 */
  onChange: (draft: BirthdayDraft, refused: boolean) => void
}) {
  const [calendar, setCalendar] = useState<'solar' | 'lunar'>(birthday?.calendar ?? 'solar')
  const [year, setYear] = useState<string>(birthday?.year ? String(birthday.year) : '')
  const [month, setMonth] = useState(birthday?.month ?? 1)
  const [day, setDay] = useState(birthday?.day ?? 1)
  const [leapMonth, setLeapMonth] = useState(birthday?.leapMonth ?? false)
  const [hourBranch, setHourBranch] = useState<number | null>(birthday?.hourBranch ?? null)
  const [lead, setLead] = useState<RemindLead>((birthday?.remindLead ?? 7) as RemindLead)

  const draft: BirthdayDraft = {
    calendar,
    year: year.trim() === '' ? null : Number(year),
    month,
    day,
    leapMonth: calendar === 'lunar' && leapMonth,
    hourBranch,
    remindLead: lead,
  }
  const yearOk = draft.year === null || (draft.year >= 1850 && draft.year <= 2200)

  const preview = useQuery({
    queryKey: ['birthday-preview', calendar, draft.year, month, day, draft.leapMonth, hourBranch],
    queryFn: () => previewBirthday(draft),
    enabled: yearOk,
  })

  /**
   * 服务端说这个日子不存在（400），不是预览没拿到（网络、500）。
   *
   * 两者要分开：前者保存必然也是 400，而保存这条路径不画错误——按下去只会让输入无声消失；后者抖
   * 一下就过去了，不该把人锁在表单里。
   */
  const refused =
    preview.isError && preview.error instanceof ApiError && preview.error.status === 400

  const report = useRef(onChange)
  report.current = onChange
  useEffect(() => {
    report.current(draft, refused)
    // 草稿是每次渲染新造的对象，进依赖数组只会每次都触发；这里列的是它由什么构成。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar, draft.year, month, day, draft.leapMonth, hourBranch, lead, refused])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex h-9 overflow-hidden rounded-lg border border-border-strong"
          role="group"
          aria-label="Which calendar"
        >
          {(['solar', 'lunar'] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={calendar === c}
              onClick={() => {
                setCalendar(c)
                if (c === 'solar') setLeapMonth(false)
              }}
              className={`h-[34px] px-3.5 text-sm ${
                calendar === c ? 'bg-surface-raised font-semibold text-fg' : 'text-fg-muted'
              }`}
            >
              {c === 'solar' ? 'Solar' : 'Lunar'}
            </button>
          ))}
        </div>

        <input
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          placeholder="Year"
          aria-label="Year"
          aria-invalid={!yearOk}
          className={`w-20 bg-surface-panel tabular-nums ${textbox}`}
        />

        {calendar === 'lunar' ? (
          <>
            <PickOne
              label="Lunar month"
              value={String(month)}
              choices={LUNAR_MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
              onPick={(next) => setMonth(Number(next))}
            />
            <PickOne
              label="Lunar day"
              value={String(day)}
              choices={LUNAR_DAYS.map((name, i) => ({ value: String(i + 1), label: name }))}
              onPick={(next) => setDay(Number(next))}
            />
            <label className="inline-flex items-center gap-1.5 text-sm text-fg">
              <input
                type="checkbox"
                checked={leapMonth}
                onChange={(e) => setLeapMonth(e.target.checked)}
              />
              闰月
            </label>
          </>
        ) : (
          <>
            <PickOne
              label="Month"
              value={String(month)}
              choices={SOLAR_MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
              onPick={(next) => setMonth(Number(next))}
            />
            <PickOne
              label="Day"
              value={String(day)}
              choices={Array.from({ length: 31 }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
              onPick={(next) => setDay(Number(next))}
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PickOne
          label="时辰"
          value={hourBranch === null ? '' : String(hourBranch)}
          choices={[
            { value: '', label: '时辰 — not known' },
            ...HOURS.map((name, i) => ({ value: String(i), label: name })),
          ]}
          onPick={(next) => setHourBranch(next === '' ? null : Number(next))}
        />
        <PickOne
          label="Tell me"
          value={String(lead)}
          choices={LEADS.map(([n, label]) => ({ value: String(n), label }))}
          onPick={(next) => setLead(Number(next) as RemindLead)}
        />
      </div>

      {/* What it MEANS, answered by the server so the rules have one implementation. */}
      <p data-testid="birthday-preview" className="min-h-5 text-xs text-fg-muted">
        {preview.isSuccess ? <PreviewLine facts={preview.data} /> : null}
        {/* 服务端那一句（「正月 has 29 days in 2021…」）比「不是个日子」有用：它说的是哪一条不成立。 */}
        {preview.isError && (
          <span className="text-danger">
            {(preview.error instanceof ApiError && preview.error.detail) || 'That is not a date'}
          </span>
        )}
      </p>
    </div>
  )
}

function PreviewLine({ facts }: { facts: BirthdayPreviewResponse }) {
  const parts = [
    facts.lunarDate ?? facts.bornLunar,
    facts.bornSolar,
    facts.zodiac,
    facts.sign,
    facts.hour,
  ].filter(Boolean)
  return (
    <>
      <span className="tabular-nums">{parts.join(' · ')}</span>
      {/* 挪动那句自己占一行：它是一句话，接在「猴 · 水瓶」后面会连成一串读不断的东西。 */}
      {facts.next.keptNote && <span className="block text-plan">{facts.next.keptNote}</span>}
    </>
  )
}

const SOLAR_MONTHS = [
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
]
