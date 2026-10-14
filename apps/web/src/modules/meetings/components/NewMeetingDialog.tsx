import type { CreateMeetingBody, MeetingOccurrence } from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { peopleKey, listPeople } from '../../people/api/people'
import {
  createMeeting,
  DEFAULT_HOUR,
  DEFAULT_MINUTES,
  repeatChoices,
  withUntil,
} from '../api/meetings'
import { listProjects } from '../../../shell/projects/api'
import { useComposing } from '../../../platform/keyboard/composition'
import { todayIn } from '../../../platform/time/dates'
import { useProjectRail } from '../../../shell/projects/projectColor'
import { ZONES, zoneLabel } from '../timeZones'
import { useTimeZone } from '../../../shell/auth/useMe'
import { boxed, field, label } from '../../../platform/ui/formStyles'
import { PickMany, PickOne } from '../../../platform/ui/inline'
import { DialogFooter } from '../../../platform/ui/DialogFooter'
import { Modal } from '../../../platform/ui/Modal'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { useNow } from '../../../platform/time/useNow'

/**
 * NEW MEETING, filled in once.
 *
 * A meeting is the one thing in this app that cannot be made from a line of text: a title with no
 * time is not a meeting, and the time needs a zone, and the people in the room are the point of
 * most of them. Everything it needs is here, so making one is one act rather than "create, then
 * open it and fill in the rest".
 *
 * THE CALENDAR DOES NOT MAKE ONE. A lens is not a creation affordance: the grid answers what is on
 * this month, and the making happens here.
 */
/** `PickOne` has no null value, so "does not repeat" needs a value of its own. */
const NO_REPEAT = '__none'

/** The same, for a meeting that belongs to no line of work. */
const NO_PROJECT = '__no-project'

export function NewMeetingDialog({
  onClose,
  onMade,
}: {
  onClose: () => void
  onMade: (made: MeetingOccurrence) => void
}) {
  const accountZone = useTimeZone()
  const today = todayIn(accountZone, useNow())
  const titleField = useRef<HTMLInputElement>(null)
  const composing = useComposing()
  const rail = useProjectRail()

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

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const people = useQuery({ queryKey: peopleKey(), queryFn: () => listPeople() })
  const startsLocal = `${day}T${clock}`
  // Named after the day it falls on, so "Weekly on Tuesday" says Tuesday once the date is picked.
  const repeats = repeatChoices(startsLocal)

  const make = useMutation({
    mutationFn: (body: CreateMeetingBody) => createMeeting(body),
    meta: { awaits: [['meetings'], ['meeting-calendar']] },
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
      // The footer carries Cancel; a second dismiss in the header would be a third way out of one
      // small form.
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
          <PickOne
            label="Projects"
            value={projectId ?? NO_PROJECT}
            /* "No project" is a CHOICE, not only the placeholder: a picker you can enter and
               never leave is a one-way door. */
            choices={[
              { value: NO_PROJECT, label: 'No project' },
              ...(projects.data ?? [])
                .filter((p) => !p.archivedAt)
                .map((p) => ({
                  value: p.id,
                  label: p.name,
                  mark: <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(p.id)}`} />,
                })),
            ]}
            onPick={(v) => setProjectId(v === NO_PROJECT ? null : v)}
          />
          {/* A PLACEHOLDER, and a field you can see. Borderless and empty, this read as a gap
              between the project and the date -- there was nothing on screen to say a title was
              wanted. */}
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

        {/* Two controls under one heading, each with its own name: accessible names are matched
            by substring in one flat namespace, so a bare "Time" here would also answer to the
            "Time zone" below it. */}
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

        {/* The zone is the MEETING's, not yours: "09:00 Toronto time" is what was agreed, and it
            stays 09:00 in Toronto whichever city you read it in.

            The abbreviations in this list are read at NOW: the column is naming zones, not saying
            which abbreviation this meeting will wear. That is said on the meeting itself, at the
            meeting's own instant. */}
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[12rem]">
            <span className={label}>Time zone</span>
            <div className="mt-1.5">
              <PickOne
                label="Time zone"
                value={timeZone}
                choices={ZONES.map((z) => ({ value: z, label: zoneLabel(z, new Date()) }))}
                onPick={setTimeZone}
              />
            </div>
          </div>
          <div className="min-w-[7.5rem]">
            <span className={label}>Length</span>
            <div className="mt-1.5">
              <PickOne
                label="Length"
                value={String(durationMinutes)}
                choices={[15, 30, 45, 60, 90, 120].map((m) => ({
                  value: String(m),
                  label: m >= 60 ? `${m / 60} h` : `${m} min`,
                }))}
                onPick={(m) => setDuration(Number(m))}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <span className={label}>Repeats</span>
            <div className="mt-1.5">
              <PickOne
                label="Repeats"
                value={rrule ?? NO_REPEAT}
                choices={repeats.map((c) => ({ value: c.value ?? NO_REPEAT, label: c.label }))}
                onPick={(v) => setRrule(v === NO_REPEAT ? null : v)}
              />
            </div>
          </div>
          {/* WHEN IT STOPS. Only once it repeats -- an ending on a meeting that happens once is
              a control with nothing to end. */}
          {rrule && (
            <div>
              <label htmlFor="meeting-until" className={label}>
                Ends
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id="meeting-until"
                  type="date"
                  value={until ?? ''}
                  min={day}
                  onChange={(e) => setUntil(e.target.value || null)}
                  className={boxed}
                />
                {until ? (
                  <button type="button" onClick={() => setUntil(null)} className={BUTTON.inline}>
                    Never
                  </button>
                ) : (
                  <span className="text-sm text-ink-subtle">Never</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* WHERE, which for most of these is a link. A meeting you cannot join from the thing
            that reminded you of it is a meeting you go looking for in your mail. */}
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
            <PickMany
              label="Attendees"
              chosen={attendeeIds.map((id) => ({
                value: id,
                label: people.data?.find((c) => c.id === id)?.name ?? '',
              }))}
              choices={(people.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              onChange={setAttendees}
              empty="Nobody yet"
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
