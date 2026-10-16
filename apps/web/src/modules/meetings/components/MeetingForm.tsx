import type { MeetingOccurrence, UpdateSeriesBody } from '@ctws/contracts'
import { ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Field } from '../../../platform/ui/Field'
import { boxed, field, label } from '../../../platform/ui/formStyles'
import { useReportUnsaved } from '../../../platform/ui/unsavedGuard'
import { FormBar } from '../../../shell/detail'
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

/** The meeting form, with one Save; cancelling the meeting is at the foot of the pane. */
export function MeetingForm({
  meeting,
  busy,
  onCancel,
  onSave,
  onUnsaved,
}: {
  meeting: MeetingOccurrence
  busy: boolean
  onCancel: () => void
  onSave: (patch: UpdateSeriesBody) => void
  /** Whether anything differs from what the form opened on, for the pane's leave guard. */
  onUnsaved?: (unsaved: boolean) => void
}) {
  const today = ymd(useNow(), useTimeZone())
  const { form, values, ready } = useMeetingForm(meetingValues(meeting))
  const dirty = { shouldDirty: true }
  useReportUnsaved(form.formState.isDirty && !busy, onUnsaved)

  return (
    <form
      aria-label="Edit meeting"
      onSubmit={form.handleSubmit((v) => {
        if (!busy) onSave(seriesPatch(v, meeting))
      })}
      className="flex flex-col gap-4"
    >
      <FormBar busy={busy} disabled={!ready} onCancel={onCancel} />

      <div>
        <label htmlFor="m-title" className={label}>
          Title
        </label>
        <input
          id="m-title"
          autoFocus
          {...form.register('title')}
          className={`${field} mt-1.5 text-lg font-semibold`}
        />
      </div>

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          <div className="col-span-full">
            <Field label="Start">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <input
                  type="datetime-local"
                  aria-label="Start"
                  {...form.register('startsLocal')}
                  className={`${boxed} h-8 py-0 text-sm tabular-nums`}
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
              startsLocal={meeting.startsLocal}
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
                  className={`${boxed} text-sm`}
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
          className={`${field} mt-1.5 text-sm`}
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
          className={`${field} mt-1.5 max-w-reading`}
        />
      </div>
    </form>
  )
}
