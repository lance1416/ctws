import type { MeetingOccurrence, UpdateSeriesBody } from '@ctws/contracts'
import { ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Field } from '../../../platform/ui/Field'
import { area, boxed, field, label } from '../../../platform/ui/formStyles'
import { useReportUnsaved } from '../../../platform/ui/unsavedGuard'
import { keepDraft, keptDraft } from '../../../platform/ui/drafts'
import { useEffect, useRef } from 'react'
import { FormBar, saveOnChord } from '../../../shell/detail'
import { ProjectPicker } from '../../../shell/projects'
import { useTimeZone } from '../../../shell/auth'
import { meetingValues, seriesPatch, useMeetingForm } from '../hooks/useMeetingForm'
import {
  AttendeesPicker,
  EndsPicker,
  LengthPicker,
  RepeatPicker,
  ZonePicker,
} from './MeetingControls'
import { DayField } from '../../../shell/dates'

/** The meeting form, with one Save; cancelling the meeting is at the foot of the pane. */
export function MeetingForm({
  meeting,
  busy,
  onCancel,
  onSave,
  onUnsaved,
  draft,
}: {
  meeting: MeetingOccurrence
  busy: boolean
  onCancel: () => void
  onSave: (patch: UpdateSeriesBody) => void
  /** Whether anything differs from what the form opened on, for the pane's leave guard. */
  onUnsaved?: (unsaved: boolean) => void
  /** Where what Esc closed it on is kept, in a pane (FR-029); its owner forgets it. */
  draft?: string
}) {
  const today = ymd(useNow(), useTimeZone())
  const { form, values, ready } = useMeetingForm(meetingValues(meeting))
  const dirty = { shouldDirty: true }
  // The two boxes are the halves of one start.
  const [startDay = '', startClock = ''] = values.startsLocal.split('T')
  const setStart = (nextDay: string, nextClock: string) =>
    form.setValue('startsLocal', `${nextDay}T${nextClock}`, dirty)
  useReportUnsaved(form.formState.isDirty && !busy, onUnsaved)
  // Back over what it opened on, as changes, so they still read as unsaved.
  const restored = useRef(false)
  useEffect(() => {
    if (!draft) return
    if (!restored.current) {
      restored.current = true
      const kept = keptDraft<typeof values>(draft)
      for (const key of Object.keys(kept ?? {}) as (keyof typeof values)[])
        if (JSON.stringify(kept![key]) !== JSON.stringify(values[key]))
          form.setValue(key, kept![key] as never, dirty)
      return
    }
    keepDraft(draft, form.formState.isDirty ? values : null)
  })

  return (
    <form
      aria-label="Edit meeting"
      onSubmit={form.handleSubmit((v) => {
        if (!busy) onSave(seriesPatch(v, meeting))
      })}
      onKeyDown={saveOnChord}
      className="flex flex-col gap-4"
    >
      <div>
        <label htmlFor="m-title" className={label}>
          Title
        </label>
        <input
          id="m-title"
          autoFocus
          {...form.register('title')}
          className={`${field} mt-1.5 text-subject`}
        />
      </div>

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          <div className="col-span-full">
            <Field label="Start">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {/* The shared date picker and a time, as the new meeting has (FR-034, U-21). */}
                <DayField
                  label="Date"
                  value={startDay || null}
                  today={today}
                  clearable={false}
                  onChange={(next) => next && setStart(next, startClock)}
                  className="w-36"
                />
                <input
                  type="time"
                  aria-label="Start time"
                  value={startClock}
                  onChange={(e) => setStart(startDay, e.target.value)}
                  className={`${boxed} h-8 w-28 py-0 text-ui tabular-nums`}
                />
                <ZonePicker
                  value={values.timeZone}
                  onPick={(zone) => form.setValue('timeZone', zone, dirty)}
                />
              </div>
            </Field>
          </div>
          <Field label="Length">
            <LengthPicker
              value={values.durationMinutes}
              onPick={(minutes) => form.setValue('durationMinutes', minutes, dirty)}
            />
          </Field>
          <Field label="Repeats">
            <RepeatPicker
              startsLocal={values.startsLocal}
              today={today}
              value={values.rule}
              stored
              onPick={(rule) => form.setValue('rule', rule, dirty)}
            />
          </Field>
          {values.rule !== null && (
            <Field label="Ends">
              <span className="flex items-center gap-2">
                <EndsPicker
                  label="Ends"
                  until={values.until}
                  min={meeting.startsLocal.slice(0, 10)}
                  onChange={(day) => form.setValue('until', day, dirty)}
                  className={`${boxed} text-ui`}
                />
              </span>
            </Field>
          )}
          <Field label="Projects">
            <ProjectPicker
              value={values.projectId}
              onPick={(id) => form.setValue('projectId', id, dirty)}
              none="No project"
            />
          </Field>
        </div>
      </div>

      <div>
        <label htmlFor="m-place" className={label}>
          Location
        </label>
        <input
          id="m-place"
          {...form.register('location')}
          placeholder="A room, an address, or a link"
          className={`${field} mt-1.5 text-ui`}
        />
      </div>

      <Field label="Attendees">
        <div data-attendees>
          <AttendeesPicker
            value={values.attendeeIds}
            onChange={(ids) => form.setValue('attendeeIds', ids, dirty)}
          />
        </div>
      </Field>

      <div>
        <label htmlFor="m-note" className={label}>
          Notes
        </label>
        <textarea
          id="m-note"
          {...form.register('note')}
          rows={4}
          className={`${area} mt-1.5 max-w-reading`}
        />
      </div>

      <FormBar busy={busy} disabled={!ready} onCancel={onCancel} title="Edit meeting" />
    </form>
  )
}

/** What a meeting's form in a pane keeps when Esc closes it. */
export const meetingDraft = (meeting: MeetingOccurrence) => `meeting:edit:${meeting.meetingId}`
