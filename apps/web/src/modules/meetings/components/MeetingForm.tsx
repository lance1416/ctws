import { ruleEndDay, type MeetingOccurrence, type UpdateMeetingInput } from '@ctws/contracts'
import { useState } from 'react'
import { todayIn } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Field } from '../../../platform/ui/Field'
import { boxed, field, label } from '../../../platform/ui/formStyles'
import { useReportUnsaved } from '../../../platform/ui/unsavedGuard'
import { FormBar } from '../../../shell/detail/FormBar'
import { ProjectPicker } from '../../../shell/projects/ProjectPicker'
import { withUntil } from '../api'
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
  accountZone,
  busy,
  onCancel,
  onSave,
  onUnsaved,
}: {
  meeting: MeetingOccurrence
  /** The reader's own zone, for wording the ending's date. */
  accountZone: string
  busy: boolean
  onCancel: () => void
  onSave: (patch: UpdateMeetingInput) => void
  /** Whether anything differs from what the form opened on, for the pane's leave guard. */
  onUnsaved?: (unsaved: boolean) => void
}) {
  const today = todayIn(accountZone, useNow())
  const [title, setTitle] = useState(meeting.title)
  const [startsLocal, setStartsLocal] = useState(meeting.startsLocal)
  const [timeZone, setTimeZone] = useState(meeting.timeZone)
  const [durationMinutes, setDuration] = useState(meeting.durationMinutes)
  // The rule without its ending, which has a control of its own: a weekly meeting that stops in
  // December is still "Weekly" in the menu.
  const [rule, setRule] = useState(meeting.rrule ? withUntil(meeting.rrule, null) : null)
  const [until, setUntil] = useState(ruleEndDay(meeting.rrule))
  const [location, setLocation] = useState(meeting.location ?? '')
  const [projectId, setProjectId] = useState<string | null>(meeting.projectId)
  const [attendeeIds, setAttendees] = useState(meeting.attendees.map((p) => p.id))
  const [note, setNote] = useState(meeting.note ?? '')
  useReportUnsaved(
    [
      title,
      startsLocal,
      timeZone,
      durationMinutes,
      rule,
      until,
      location,
      projectId,
      attendeeIds,
      note,
    ],
    busy,
    onUnsaved,
  )

  const submit = () => {
    if (busy || title.trim() === '' || startsLocal === '') return
    const patch: UpdateMeetingInput = {
      title: title.trim(),
      timeZone,
      location: location.trim() || null,
      projectId,
      attendeeIds,
      note: note.trim() || null,
    }
    // Only when really changed: a rule in the patch makes the server drop the weeks moved or
    // cancelled on their own. Compared as the form reads it, not as stored: the server ends a split
    // series a minute before the split, which `withUntil` would rewrite to the end of that day.
    const storedRule = meeting.rrule ? withUntil(meeting.rrule, null) : null
    if (rule !== storedRule || until !== ruleEndDay(meeting.rrule)) {
      patch.rrule = rule === null ? null : withUntil(rule, until)
    }
    // Only when really changed: either one in the patch makes a repeating meeting ask its scope.
    if (startsLocal !== meeting.startsLocal) patch.startsLocal = startsLocal
    if (durationMinutes !== meeting.durationMinutes) patch.durationMinutes = durationMinutes
    onSave(patch)
  }

  return (
    <form
      aria-label="Edit meeting"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex flex-col gap-4"
    >
      <FormBar
        busy={busy}
        disabled={title.trim() === '' || startsLocal === ''}
        onCancel={onCancel}
      />

      <div>
        <label htmlFor="m-title" className={label}>
          Title
        </label>
        <input
          id="m-title"
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
                  value={startsLocal}
                  onChange={(e) => setStartsLocal(e.target.value)}
                  className={`${boxed} h-8 py-0 text-sm tabular-nums`}
                />
                <ZonePicker value={timeZone} onPick={setTimeZone} />
              </div>
            </Field>
          </div>
          <Field label="Length">
            <LengthPicker value={durationMinutes} onPick={setDuration} />
          </Field>
          <Field label="Repeats">
            <RepeatPicker
              startsLocal={meeting.startsLocal}
              today={today}
              value={rule}
              stored
              onPick={setRule}
            />
          </Field>
          {rule !== null && (
            <Field label="Ends">
              <span className="flex items-center gap-2">
                <EndsPicker
                  label="Ends"
                  until={until}
                  min={meeting.startsLocal.slice(0, 10)}
                  onChange={setUntil}
                  className={`${boxed} text-sm`}
                />
              </span>
            </Field>
          )}
          <Field label="Projects">
            <ProjectPicker value={projectId} onPick={setProjectId} none="No project" />
          </Field>
        </div>
      </div>

      <div>
        <label htmlFor="m-place" className={label}>
          Location
        </label>
        <input
          id="m-place"
          value={location}
          placeholder="A room, an address, or a link"
          onChange={(e) => setLocation(e.target.value)}
          className={`${field} mt-1.5 text-sm`}
        />
      </div>

      <Field label="Attendees">
        <div data-attendees>
          <AttendeesPicker value={attendeeIds} onChange={setAttendees} />
        </div>
      </Field>

      <div>
        <label htmlFor="m-note" className={label}>
          Notes
        </label>
        <textarea
          id="m-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className={`${field} mt-1.5 max-w-[68ch]`}
        />
      </div>
    </form>
  )
}
