import {
  BIRTH_YEARS,
  type BirthdayPreviewResponse,
  type BirthdayResponse,
  REMIND_LEAD_DEFAULT,
  type RemindLead,
} from '@ctws/contracts'
import { HOUR_BRANCHES, LUNAR_DAYS, LUNAR_MONTHS } from '@ctws/core/lunar-names'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../platform/http/api'
import { fullDay } from '../../../platform/time/dates'
import { textbox } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { birthdayPreviewQuery, type BirthdayDraft } from '../api'
import { LEAD_CHOICES, MONTH_NAMES } from '../labels'

/** Where a draft starts: the editor's first state, and New person's before the editor reports. */
export function birthdayDraftOf(birthday: BirthdayResponse | null): BirthdayDraft {
  return {
    calendar: birthday?.calendar ?? 'solar',
    year: birthday?.year ?? null,
    month: birthday?.month ?? 1,
    day: birthday?.day ?? 1,
    leapMonth: birthday?.leapMonth ?? false,
    hourBranch: birthday?.hourBranch ?? null,
    remindLead: birthday?.remindLead ?? REMIND_LEAD_DEFAULT,
  }
}

/**
 * The birthday controls, without buttons, shared by the person form and New person. What a day
 * means is the server's answer, so the lunar rules live in one place.
 */
export function BirthdayEditor({
  birthday,
  onChange,
}: {
  birthday: BirthdayResponse | null
  /** Every change reports the draft, and whether the server has already refused it. */
  onChange: (draft: BirthdayDraft, refused: boolean) => void
}) {
  const start = birthdayDraftOf(birthday)
  const [calendar, setCalendar] = useState(start.calendar)
  const [year, setYear] = useState(start.year === null ? '' : String(start.year))
  const [month, setMonth] = useState(start.month)
  const [day, setDay] = useState(start.day)
  const [leapMonth, setLeapMonth] = useState(start.leapMonth)
  const [hourBranch, setHourBranch] = useState(start.hourBranch)
  const [lead, setLead] = useState(start.remindLead)

  const draft: BirthdayDraft = {
    calendar,
    year: year.trim() === '' ? null : Number(year),
    month,
    day,
    leapMonth: calendar === 'lunar' && leapMonth,
    hourBranch,
    remindLead: lead,
  }
  const yearOk =
    draft.year === null || (draft.year >= BIRTH_YEARS.min && draft.year <= BIRTH_YEARS.max)

  const preview = useQuery({
    ...birthdayPreviewQuery(draft),
    enabled: yearOk,
  })

  // A 400 says the day does not exist, so Save would fail too; a preview that merely failed to
  // arrive must not lock the form.
  const refused =
    preview.isError && preview.error instanceof ApiError && preview.error.status === 400

  const report = useRef(onChange)
  report.current = onChange
  // What the draft was made of when last reported. Mounting reports nothing: opening the controls
  // on someone with no birthday is not choosing 1 January.
  const reported = useRef<string | null>(null)
  useEffect(() => {
    const now = JSON.stringify([calendar, draft.year, month, day, draft.leapMonth, hourBranch])
    const key = `${now}:${lead}:${refused}`
    if (reported.current === null) reported.current = key
    if (reported.current === key) return
    reported.current = key
    report.current(draft, refused)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the draft is a new object every render; its parts are the deps.
  }, [calendar, draft.year, month, day, draft.leapMonth, hourBranch, lead, refused])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex h-9 overflow-hidden rounded-md border border-rule-strong"
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
                calendar === c ? 'bg-select font-semibold text-ink' : 'text-ink-muted'
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
          className={`w-20 bg-sheet tabular-nums ${textbox}`}
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
            {/* Leap month and hour stay in Chinese, like the lunar month and day names. */}
            <label className="inline-flex items-center gap-1.5 text-sm text-ink">
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
              choices={MONTH_NAMES.map((name, i) => ({ value: String(i + 1), label: name }))}
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
            ...HOUR_BRANCHES.map((name, i) => ({ value: String(i), label: name })),
          ]}
          onPick={(next) => setHourBranch(next === '' ? null : Number(next))}
        />
        <PickOne
          label="Tell me"
          value={String(lead)}
          choices={LEAD_CHOICES}
          onPick={(next) => setLead(Number(next) as RemindLead)}
        />
      </div>

      <p data-testid="birthday-preview" className="min-h-5 text-xs text-ink-muted">
        {preview.isSuccess ? <PreviewLine facts={preview.data} /> : null}
        {/* The server's own sentence says which rule failed. */}
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
    facts.bornSolar && fullDay(facts.bornSolar),
    facts.zodiac,
    facts.sign,
    facts.hour,
  ].filter(Boolean)
  return (
    <>
      <span className="tabular-nums">{parts.join(' · ')}</span>
      {facts.next.keptNote && <span className="block text-plan">{facts.next.keptNote}</span>}
    </>
  )
}
