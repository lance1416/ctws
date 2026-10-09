import type { CreateMeetingBody, MeetingOccurrence } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { contactsKey, listContacts } from '../api/contacts'
import { createMeeting, DEFAULT_HOUR, DEFAULT_MINUTES, repeatChoices } from '../api/meetings'
import { listProjects } from '../api/projects'
import { useComposing } from '../composition'
import { todayIn } from '../dueAt'
import { useProjectRail } from '../projectColor'
import { ZONES, zoneLabel } from '../timeZones'
import { useTimeZone } from '../useMe'
import { boxed, field, label } from './formStyles'
import { PickMany, PickOne } from './inline'
import { Modal } from './Modal'

/**
 * NEW MEETING, filled in once.
 *
 * A meeting is the one thing in this app that cannot be made from a line of text: a title with no
 * time is not a meeting, and the time needs a zone, and the people in the room are the point of
 * most of them. Everything it needs is here, so making one is one act rather than "create, then
 * open it and fill in the rest".
 *
 * This is also what the calendar's day-square "+" used to stand in for. A lens is not a creation
 * affordance (framing §2): the grid answers 「这个月有什么」 and the making happens here.
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
  const qc = useQueryClient()
  const accountZone = useTimeZone()
  const today = todayIn(accountZone)
  const titleField = useRef<HTMLInputElement>(null)
  const composing = useComposing()
  const rail = useProjectRail()

  const [title, setTitle] = useState('')
  const [day, setDay] = useState(today)
  const [clock, setClock] = useState(`${String(DEFAULT_HOUR).padStart(2, '0')}:00`)
  const [timeZone, setTimeZone] = useState(accountZone)
  const [durationMinutes, setDuration] = useState(DEFAULT_MINUTES)
  const [rrule, setRrule] = useState<string | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [attendeeIds, setAttendees] = useState<string[]>([])

  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const contacts = useQuery({ queryKey: contactsKey(), queryFn: () => listContacts() })
  const startsLocal = `${day}T${clock}`
  // Named after the day it falls on, so "Weekly on Tuesday" says Tuesday once the date is picked.
  const repeats = repeatChoices(startsLocal)

  const make = useMutation({
    mutationFn: (body: CreateMeetingBody) => createMeeting(body),
    onSuccess: async (made) => {
      await qc.invalidateQueries({ queryKey: ['meetings'] })
      await qc.invalidateQueries({ queryKey: ['meeting-calendar'] })
      onMade(made)
    },
  })

  const ready = title.trim().length > 0 && day !== '' && clock !== ''
  const submit = () => {
    if (!ready || make.isPending) return
    make.mutate({
      title: title.trim(),
      startsLocal,
      timeZone,
      durationMinutes,
      ...(rrule ? { rrule } : {}),
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
      className="rounded-lg"
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
            stays 09:00 in Toronto whichever city you read it in. */}
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[12rem]">
            <span className={label}>Time zone</span>
            <div className="mt-1.5">
              <PickOne
                label="Time zone"
                value={timeZone}
                choices={ZONES.map((z) => ({ value: z, label: zoneLabel(z) }))}
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

        <div>
          <span className={label}>Attendees</span>
          <div className="mt-1.5" data-attendees>
            <PickMany
              label="Attendees"
              chosen={attendeeIds.map((id) => ({
                value: id,
                label: contacts.data?.find((c) => c.id === id)?.name ?? '',
              }))}
              choices={(contacts.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              onChange={setAttendees}
              empty="Nobody yet"
            />
          </div>
        </div>

        {make.isError && (
          <p role="alert" className="text-sm text-danger">
            {make.error instanceof Error
              ? make.error.message
              : "Couldn't create it. Your answers are still here — try again."}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!ready || make.isPending}
            className="h-9 rounded-lg bg-accent px-3 font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg px-3 text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
