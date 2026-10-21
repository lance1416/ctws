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
import { fullDay } from '../../../platform/time/dates'
import { PickOne } from '../../../platform/ui/inline'
import { useAccountToday } from '../../../shell/auth'
import { BirthdayPicker } from '../../../shell/dates'
import { birthdayPreviewQuery, type BirthdayDraft } from '../api'
import { LEAD_CHOICES } from '../logic/labels'

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
  const yearOk =
    draft.year === null || (draft.year >= BIRTH_YEARS.min && draft.year <= BIRTH_YEARS.max)

  const preview = useQuery({ ...birthdayPreviewQuery(draft), enabled: yearOk })

  // A 400 or 422 says the day cannot be, so Save would fail too; a preview that merely failed to
  // arrive must not lock the form.
  const refused =
    preview.isError &&
    preview.error instanceof ApiError &&
    (preview.error.status === 400 || preview.error.status === 422)

  const report = useRef(onChange)
  report.current = onChange
  // What the draft was when last reported. Mounting reports nothing: opening the controls on
  // someone with no birthday is not choosing 1 January.
  const reported = useRef<string | null>(null)
  useEffect(() => {
    const key = `${JSON.stringify(draft)}:${refused}`
    if (reported.current === null) reported.current = key
    if (reported.current === key) return
    reported.current = key
    report.current(draft, refused)
  }, [draft, refused])

  return (
    <div className="flex flex-col gap-2">
      <BirthdayPicker
        value={draft}
        onChange={(next) => setDraft({ ...draft, ...next })}
        today={today}
        facts={
          <>
            {preview.isSuccess && <PreviewLine facts={preview.data} />}
            {preview.isError && (
              <span role="alert" className="col-span-3 text-ui text-stop-t">
                {(preview.error instanceof ApiError && preview.error.detail) ||
                  'That is not a date'}
              </span>
            )}
          </>
        }
      />
      <PickOne
        label="Tell me"
        value={String(draft.remindLead)}
        choices={LEAD_CHOICES}
        onPick={(next) => setDraft({ ...draft, remindLead: Number(next) as RemindLead })}
      />
    </div>
  )
}

/** The pick in the other calendar and this year, each fact in its own cell (FR-010). */
function PreviewLine({ facts }: { facts: BirthdayPreviewResponse }) {
  return (
    <>
      {facts.bornSolar && (
        <>
          <span aria-hidden="true" />
          <span className="text-meta text-subtle">Born</span>
          <span data-testid="birthday-preview" className="text-ink tabular-nums">
            {fullDay(facts.bornSolar)}
            {facts.bornLunar ? `, ${facts.bornLunar}` : ''}
          </span>
        </>
      )}
      <span aria-hidden="true" />
      <span className="text-meta text-subtle">This year</span>
      <span className="text-ink">{fullDay(facts.next.day)}</span>
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
