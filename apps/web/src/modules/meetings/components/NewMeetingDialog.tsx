import type { CreateMeetingBody, MeetingOccurrence } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { createMeeting, DEFAULT_HOUR, DEFAULT_MINUTES, withUntil } from '../api'
import { ProjectPicker } from '../../../shell/projects/ProjectPicker'
import { useComposing } from '../../../platform/keyboard/composition'
import { ymd } from '../../../platform/time/dates'
import { useTimeZone } from '../../../shell/auth/useMe'
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
  onClose,
  onMade,
}: {
  onClose: () => void
  onMade: (made: MeetingOccurrence) => void
}) {
  const accountZone = useTimeZone()
  const today = ymd(useNow(), accountZone)
  const titleField = useRef<HTMLInputElement>(null)
  const composing = useComposing()

  const [title, setTitle] = useState('')
  const [day, setDay] = useState(today)
  const [clock, setClock] = useState(`${String(DEFAULT_HOUR).padStart(2, '0')}:00`)
  const [timeZone, setTimeZone] = useState(accountZone)
  const [durationMinutes, setDuration] = useState(DEFAULT_MINUTES)
  const [rrule, setRrule] = useState<string | null>(null)
  const [until, setUntil] = useState<string | null>(null)
  const [location, setLocation] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [attendeeIds, setAttendees] = useState<string[]>([])

  const startsLocal = `${day}T${clock}`

  const make = useMutation({
    mutationFn: (body: CreateMeetingBody) => createMeeting(body),
    meta: { awaits: [['meetings']] },
    onSuccess: (made) => onMade(made),
  })

  const ready = title.trim().length > 0 && day !== '' && clock !== ''
  const submit = () => {
    if (!ready || make.isPending) return
    make.mutate({
      title: title.trim(),
      startsLocal,
      timeZone,
      durationMinutes,
      ...(rrule ? { rrule: withUntil(rrule, until) } : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(projectId ? { projectId } : {}),
      ...(attendeeIds.length > 0 ? { attendeeIds } : {}),
    })
  }

  return (
    <Modal
      title="New meeting"
      onClose={onClose}
      initialFocus={titleField}
      // The footer carries Cancel, so the header has no second dismiss.
      dismissLabel={null}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        {...composing.bind}
        className="flex flex-col gap-5 px-5 py-4"
      >
        <div>
          {/* "No project" is a choice, not only the placeholder, so a picked project can be undone. */}
          <ProjectPicker value={projectId} onPick={setProjectId} none="No project" />
          <input
            ref={titleField}
            aria-label="Title"
            value={title}
            placeholder="What is this meeting?"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // isComposing: Enter confirms an IME candidate, it must not submit half a word.
              if (e.key === 'Enter' && !composing.composingNow(e)) {
                e.preventDefault()
                submit()
              }
            }}
            className={`${field} mt-1.5 text-lg font-semibold`}
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
              onChange={(e) => setDay(e.target.value)}
              className={`${boxed} min-w-[9rem] flex-1`}
            />
            <input
              aria-label="Start time"
              type="time"
              value={clock}
              onChange={(e) => setClock(e.target.value)}
              className={`${boxed} min-w-[7rem] flex-1`}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="min-w-[12rem]">
            <span className={label}>Time zone</span>
            <div className="mt-1.5">
              <ZonePicker value={timeZone} onPick={setTimeZone} />
            </div>
          </div>
          <div className="min-w-[7.5rem]">
            <span className={label}>Length</span>
            <div className="mt-1.5">
              <LengthPicker value={durationMinutes} onPick={setDuration} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <span className={label}>Repeats</span>
            <div className="mt-1.5">
              {/* Named after the day it falls on, so "Weekly on Tuesday" follows the date. */}
              <RepeatPicker
                startsLocal={startsLocal}
                today={today}
                value={rrule}
                onPick={setRrule}
              />
            </div>
          </div>
          {rrule && (
            <div>
              <label htmlFor="meeting-until" className={label}>
                Ends
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <EndsPicker
                  id="meeting-until"
                  until={until}
                  min={day}
                  onChange={setUntil}
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
            value={location}
            placeholder="A room, an address, or a link"
            onChange={(e) => setLocation(e.target.value)}
            className={`${field} mt-1.5`}
          />
        </div>

        <div>
          <span className={label}>Attendees</span>
          <div className="mt-1.5" data-attendees>
            <AttendeesPicker value={attendeeIds} onChange={setAttendees} />
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
