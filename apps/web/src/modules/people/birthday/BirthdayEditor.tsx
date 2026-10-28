import {
  BIRTH_YEARS,
  type BirthdayPreviewResponse,
  type BirthdayResponse,
  REMIND_LEAD_DEFAULT,
  type RemindLead,
} from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../platform/http/api'
import { fullDay, shortDay, weekdayOf } from '../../../platform/time/dates'
import { PickOne } from '../../../platform/ui/inline'
import { useAccountToday } from '../../../shell/auth'
import { BirthdayPicker } from '../../../shell/dates'
import { birthdayPreviewQuery, type BirthdayDraft } from '../api'
import { LEAD_CHOICES } from '../logic/labels'

/** Where a draft starts: the editor's first state, and New person's before the editor reports. */
function birthdayDraftOf(birthday: BirthdayResponse | null): BirthdayDraft {
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
 * The birthday controls, without buttons, shared by the person form and New person: the shared
 * picker (FR-034) and the notice. What a day means is the server's answer, so the lunar rules
 * live in one place.
 */
export function BirthdayEditor({
  birthday,
  onChange,
}: {
  birthday: BirthdayResponse | null
  /** Every change reports the draft, and whether the server has already refused it. */
  onChange: (draft: BirthdayDraft, refused: boolean) => void
}) {
  const today = useAccountToday()
  const [draft, setDraft] = useState<BirthdayDraft>(() => birthdayDraftOf(birthday))
  // Someone with no birthday yet has none until a day is picked: the controls are out from the
  // start (N-01), but a calendar or a year alone is not a birthday.
  const [picked, setPicked] = useState(birthday !== null)
  const yearOk =
    draft.year === null || (draft.year >= BIRTH_YEARS.min && draft.year <= BIRTH_YEARS.max)

  // Asked before a day is picked too: its answer moves a lunar grid to the year typed.
  const preview = useQuery({ ...birthdayPreviewQuery(draft), enabled: yearOk })

  // A 400 or 422 says the day cannot be, so Save would fail too; a preview that merely failed to
  // arrive must not lock the form.
  const refused =
    preview.isError &&
    preview.error instanceof ApiError &&
    (preview.error.status === 400 || preview.error.status === 422)

  const report = useRef(onChange)
  report.current = onChange
  // What the draft was when last reported. Mounting reports nothing: opening the controls is not
  // choosing 1 January. With no birthday before, the first day picked is reported at once: ''
  // was never a draft.
  const reported = useRef<string | null>(birthday === null ? '' : null)
  useEffect(() => {
    if (!picked) return
    const key = `${JSON.stringify(draft)}:${refused}`
    if (reported.current === null) reported.current = key
    if (reported.current === key) return
    reported.current = key
    report.current(draft, refused)
  }, [draft, refused, picked])

  return (
    <div className="flex flex-col gap-2">
      <BirthdayPicker
        value={draft}
        picked={picked}
        onChange={(next, day) => {
          setDraft({ ...draft, ...next })
          if (day) setPicked(true)
        }}
        today={today}
        solarOfPick={preview.data?.bornSolar ?? null}
        facts={
          <div data-testid="birthday-preview" className="contents">
            {preview.isSuccess && <PreviewLine facts={preview.data} today={today} />}
            {preview.isError && (
              <span role="alert" className="col-span-3 text-ui text-stop-t">
                {(preview.error instanceof ApiError && preview.error.detail) ||
                  'That is not a date'}
              </span>
            )}
          </div>
        }
      />
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-3">
          <span className="text-meta text-muted">Tell me</span>
          <PickOne
            label="Tell me"
            value={String(draft.remindLead)}
            choices={LEAD_CHOICES}
            onPick={(next) => setDraft({ ...draft, remindLead: Number(next) as RemindLead })}
          />
        </div>
        {/* When the reminder comes, and by whose clock (FR-062). */}
        <span className="text-meta text-subtle">At 00:00 their time</span>
      </div>
    </div>
  )
}

/** The pick in the other calendar and this year, each fact in its own cell (FR-010). */
function PreviewLine({ facts, today }: { facts: BirthdayPreviewResponse; today: string }) {
  return (
    <>
      {facts.bornSolar && (
        <>
          <span aria-hidden="true" />
          <span className="text-meta text-subtle">Born</span>
          <span className="text-ink tabular-nums">
            {fullDay(facts.bornSolar)}
            {facts.bornLunar ? `, ${facts.bornLunar}` : ''}
          </span>
        </>
      )}
      <span aria-hidden="true" />
      <span className="text-meta text-subtle">This year</span>
      <span className="text-ink">
        {weekdayOf(facts.next.day)}, {shortDay(facts.next.day, today)}
      </span>
      {(facts.zodiac || facts.sign || facts.hour) && (
        <>
          <span aria-hidden="true" />
          <span className="text-meta text-subtle">Signs</span>
          <span className="text-ink">
            {[facts.zodiac, facts.sign, facts.hour].filter(Boolean).join(' ')}
          </span>
        </>
      )}
      {facts.next.keptNote && (
        <span className="col-span-3 text-meta text-go-t">{facts.next.keptNote}</span>
      )}
    </>
  )
}
