import { type CreateMeetingBody, type MeetingOccurrence, type ProjectId } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useRef } from 'react'
import { createMeeting, meetingKeys } from '../api'
import { createBody, newMeeting, useMeetingForm } from '../hooks/useMeetingForm'
import { ProjectPicker } from '../../../shell/projects'
import { useComposing } from '../../../platform/keyboard/composition'
import { ymd } from '../../../platform/time/dates'
import { useTimeZone } from '../../../shell/auth'
import { boxed, field, label } from '../../../platform/ui/formStyles'
import { DialogFooter } from '../../../platform/ui/DialogFooter'
import { Modal } from '../../../platform/ui/Modal'
import { useNow } from '../../../platform/time/useNow'
import {
  AttendeesPicker,
  EndsPicker,
  LengthPicker,
  RepeatPicker,
  ZonePicker,
} from './MeetingControls'

/**
 * A new meeting in one act: it needs a time, a zone and usually people, so unlike the rest of the
 * app it cannot be made from a line of text.
 */
export function NewMeetingDialog({
  projectId = null,
  onClose,
  onMade,
}: {
  /** The project it is made in, when opened from one. */
  projectId?: ProjectId | null
  onClose: () => void
  onMade: (made: MeetingOccurrence) => void
}) {
  const accountZone = useTimeZone()
  const today = ymd(useNow(), accountZone)
  const titleField = useRef<HTMLInputElement>(null)
  const composing = useComposing()

  const { form, values, ready } = useMeetingForm(newMeeting(today, accountZone, projectId))
  const dirty = { shouldDirty: true }
  const title = form.register('title')
  // The dialog's two boxes are the halves of one start.
  const [day = '', clock = ''] = values.startsLocal.split('T')
  const setStart = (nextDay: string, nextClock: string) =>
    form.setValue('startsLocal', `${nextDay}T${nextClock}`, dirty)

  const make = useMutation({
    mutationFn: (body: CreateMeetingBody) => createMeeting(body),
    meta: { changes: ['meeting'], awaits: [meetingKeys.all], ownsError: true },
    onSuccess: (made) => onMade(made),
  })

  const submit = form.handleSubmit((v) => {
    if (!make.isPending) make.mutate(createBody(v))
  })

  return (
    <Modal
      title="New meeting"
      onClose={onClose}
      unsaved={values.title.trim() !== '' && !make.isPending}
      initialFocus={titleField}
      // The footer carries Cancel, so the header has no second dismiss.
      dismissLabel={null}
    >
      <form
        onSubmit={(e) => void submit(e)}
        {...composing.bind}
        className="flex flex-col gap-5 px-5 py-4"
      >
        <div>
          {/* "No project" is a choice, not only the placeholder, so a picked project can be undone. */}
          <ProjectPicker
            value={values.projectId}
            onPick={(id) => form.setValue('projectId', id, dirty)}
            none="No project"
          />
          <input
            {...title}
            ref={(el) => {
              title.ref(el)
              titleField.current = el
            }}
            aria-label="Title"
            placeholder="What is this meeting?"
            onKeyDown={(e) => {
              // isComposing: Enter confirms an IME candidate, it must not submit half a word.
              if (e.key === 'Enter' && !composing.composingNow(e)) {
                e.preventDefault()
                void submit()
              }
            }}
            className={`${field} mt-1.5 text-subject`}
          />
        </div>

        {/* Each control has its own name: names are matched by substring, so a bare "Time" would
            also answer to "Time zone". */}
        <div>
          <span className={label}>Starts</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              aria-label="Date"
              type="date"
              value={day}
              onChange={(e) => setStart(e.target.value, clock)}
              className={`${boxed} min-w-[9rem] flex-1`}
            />
            <input
              aria-label="Start time"
              type="time"
              value={clock}
              onChange={(e) => setStart(day, e.target.value)}
              className={`${boxed} min-w-[7rem] flex-1`}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-[12rem]">
            <span className={label}>Time zone</span>
            <div className="mt-1.5">
              <ZonePicker
                value={values.timeZone}
                onPick={(zone) => form.setValue('timeZone', zone, dirty)}
              />
            </div>
          </div>
          <div className="min-w-[7.5rem]">
            <span className={label}>Length</span>
            <div className="mt-1.5">
              <LengthPicker
                value={values.durationMinutes}
                onPick={(minutes) => form.setValue('durationMinutes', minutes, dirty)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <span className={label}>Repeats</span>
            <div className="mt-1.5">
              {/* Named after the day it falls on, so "Weekly on Tuesday" follows the date. */}
              <RepeatPicker
                startsLocal={values.startsLocal}
                today={today}
                value={values.rule}
                onPick={(rule) => form.setValue('rule', rule, dirty)}
              />
            </div>
          </div>
          {values.rule && (
            <div>
              <label htmlFor="meeting-until" className={label}>
                Ends
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <EndsPicker
                  id="meeting-until"
                  until={values.until}
                  min={day}
                  onChange={(end) => form.setValue('until', end, dirty)}
                  className={boxed}
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="meeting-place" className={label}>
            Location
          </label>
          <input
            id="meeting-place"
            {...form.register('location')}
            placeholder="A room, an address, or a link"
            className={`${field} mt-1.5`}
          />
        </div>

        <div>
          <span className={label}>Attendees</span>
          <div className="mt-1.5" data-attendees>
            <AttendeesPicker
              value={values.attendeeIds}
              onChange={(ids) => form.setValue('attendeeIds', ids, dirty)}
            />
          </div>
        </div>

        <DialogFooter
          submit="Create"
          error={make.error}
          busy={make.isPending}
          disabled={!ready}
          onCancel={onClose}
        />
      </form>
    </Modal>
  )
}
