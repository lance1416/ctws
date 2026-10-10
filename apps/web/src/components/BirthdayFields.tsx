import type {
  BirthdayPreviewResponse,
  BirthdayResponse,
  ContactResponse,
  RemindLead,
} from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { previewBirthday, type BirthdayDraft } from '../api/contacts'
import { countdownPhrase, shortDay, todayIn } from '../dueAt'
import { useTimeZone } from '../useMe'
import { BUTTON } from './buttonStyles'
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

export function BirthdayFields({
  contact,
  onSave,
}: {
  contact: ContactResponse
  onSave: (patch: { birthday: BirthdayDraft | null }) => void
}) {
  const [editing, setEditing] = useState(false)
  const b = contact.birthday

  if (editing) {
    return (
      <BirthdayForm
        birthday={b}
        onCancel={() => setEditing(false)}
        onSave={(draft) => {
          onSave({ birthday: draft })
          setEditing(false)
        }}
      />
    )
  }

  // Nobody's birthday is not a row of empty fields: an unfilled form reads like broken data.
  if (!b) {
    return (
      <Field label="Birthday">
        <button type="button" className={BUTTON.quiet} onClick={() => setEditing(true)}>
          Add a birthday
        </button>
      </Field>
    )
  }

  return <BirthdayRead birthday={b} onEdit={() => setEditing(true)} />
}

function BirthdayRead({ birthday: b, onEdit }: { birthday: BirthdayResponse; onEdit: () => void }) {
  const today = todayIn(useTimeZone())
  const given =
    b.calendar === 'lunar' ? (b.bornLunar ?? b.lunarDate) : (b.bornSolar ?? `${b.month}-${b.day}`)
  return (
    <div className="flex flex-col gap-2">
      <Field label="Birthday" shape="beside-top">
        <div className="flex min-w-0 items-start gap-2">
          <div data-birthday className="flex min-w-0 flex-col gap-1">
            <span className="text-sm text-fg">
              {given}
              {b.hour && <span className="text-fg-muted"> · {b.hour}</span>}
            </span>
            <span className="text-xs text-fg-muted tabular-nums">
              {b.bornSolar && `Born ${b.bornSolar} · `}
              next <span className="text-fg">{shortDay(b.next.day, today)}</span>,{' '}
              {countdownPhrase(b.next.inDays)}
              {b.next.turns !== null && `, turns ${b.next.turns}`}
            </span>
            {b.next.keptNote && <span className="text-xs text-plan">{b.next.keptNote}</span>}
            {(b.zodiac || b.sign) && (
              <span className="mt-0.5 flex gap-1.5">
                {b.zodiac && <Chip>{b.zodiac}</Chip>}
                {b.sign && <Chip>{b.sign}</Chip>}
              </span>
            )}
          </div>
          <span className="flex-1" />
          <button type="button" className={BUTTON.quiet} onClick={onEdit}>
            Edit
          </button>
        </div>
      </Field>
      <Field label="Tell me">
        <span className="text-sm text-fg">{leadLabel(b.remindLead)}</span>
      </Field>
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
function BirthdayForm({
  birthday,
  onCancel,
  onSave,
}: {
  birthday: BirthdayResponse | null
  onCancel: () => void
  onSave: (draft: BirthdayDraft | null) => void
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

  return (
    <Field label="Birthday" shape="above">
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
          {preview.isError && <span className="text-danger">That is not a date</span>}
        </p>

        <div className="flex items-center gap-2">
          <button type="button" className={BUTTON.primary} onClick={() => onSave(draft)}>
            Save
          </button>
          <button type="button" className={BUTTON.secondary} onClick={onCancel}>
            Cancel
          </button>
          <span className="flex-1" />
          {birthday && (
            <button type="button" className={BUTTON.quiet} onClick={() => onSave(null)}>
              Remove
            </button>
          )}
        </div>
      </div>
    </Field>
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
      {facts.next.keptNote && <span className="text-plan"> {facts.next.keptNote}</span>}
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
