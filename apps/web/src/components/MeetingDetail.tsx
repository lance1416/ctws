import type { EditScope, MeetingOccurrence, UpdateMeetingInput } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { listContacts } from '../api/contacts'
import {
  cancelMeeting,
  patchMeeting,
  repeatChoices,
  repeatLabel,
  untilOf,
  withUntil,
} from '../api/meetings'
import { listProjects } from '../api/projects'
import { useProjectRail } from '../projectColor'
import { ZONES, zoneLabel } from '../timeZones'
import { DeleteConfirm } from './DeleteConfirm'
import { meetingLink } from '../meetingPlace'
import { Field } from './Field'
import { DetailHead, DetailPane } from './DetailPane'
import { boxed } from './formStyles'
import { InlineText, PickMany, PickOne } from './inline'
import { ScopeAsk } from './ScopeAsk'

/**
 * ONE MEETING, in the shell's detail pane -- the same pane a task and a person open in.
 *
 * What is open is an OCCURRENCE, not a series -- this Tuesday's one. Changing it has to ask
 * which one you mean, and only for the things that can differ between two occurrences. Everything
 * else is the series', and changes all of them.
 *
 * The two fields that are real fields here are the clock and the zone. A time is composed, so
 * `datetime-local` is the control every browser already has for composing one; it still writes on
 * leaving, like everything else in this pane. There is no Save.
 */
/**
 * The pane: this module's fields inside the shell's frame.
 *
 * The FIELDS are a component of their own because the meeting's own page shows the same ones with
 * no frame around them (`relations.Head`). One editor, two places -- a second copy drifts.
 */
/** `PickOne` has no null value, so "belongs to nothing" needs a value of its own. */
const NO_PROJECT = '__no-project'

/** The same, for a meeting that happens once. */
const NO_REPEAT = '__none'

export function MeetingDetail({
  meeting,
  accountZone,
  onClose,
}: {
  meeting: MeetingOccurrence
  /** The account's own zone: what the clock beside the meeting's own is in. */
  accountZone: string
  onClose: () => void
}) {
  return (
    <DetailPane label="Meetings" onClose={onClose}>
      <MeetingFields meeting={meeting} accountZone={accountZone} onClose={onClose} />
    </DetailPane>
  )
}

export function MeetingFields({
  meeting,
  accountZone,
  onClose,
}: {
  meeting: MeetingOccurrence
  accountZone: string
  /** Where to go when the meeting is cancelled. A page has nowhere to close TO, so it may omit it. */
  onClose?: () => void
}) {
  const qc = useQueryClient()
  const rail = useProjectRail()
  const [cancelling, setCancelling] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /** A change waiting on "this one / from here on". Null when nothing is being asked. */
  const [asking, setAsking] = useState<{ what: string; patch: UpdateMeetingInput } | null>(null)
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const contacts = useQuery({ queryKey: ['contacts', null, false], queryFn: () => listContacts() })

  const repeats = meeting.rrule !== null
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['meetings'] })
    await qc.invalidateQueries({ queryKey: ['meeting-calendar'] })
  }

  const save = useMutation({
    mutationFn: (patch: UpdateMeetingInput) => patchMeeting(meeting.meetingId, patch),
    onSuccess: () => setFailed(null),
    onError: (e) => setFailed(e instanceof Error ? e.message : "Couldn't save it"),
    onSettled: refresh,
  })
  const drop = useMutation({
    mutationFn: (scope: EditScope) =>
      cancelMeeting(meeting.meetingId, { scope, recurrenceId: meeting.recurrenceId }),
    onSuccess: async () => {
      await refresh()
      onClose?.()
    },
  })

  /** A change to the SERIES: title, place, people, project, the rule itself. Never asks. */
  const series = (patch: UpdateMeetingInput) => save.mutate({ ...patch, scope: 'all' })

  /**
   * A change to WHEN or HOW LONG. On a repeating meeting this is the one that has to ask; on a
   * one-off there is nothing to ask about.
   */
  const timing = (patch: UpdateMeetingInput, what: string) => {
    if (!repeats) return save.mutate({ ...patch, scope: 'all' })
    setAsking({ what, patch })
  }

  const chip = (id: string) => (
    <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(id)}`} />
  )
  const choices = repeatChoices(meeting.startsLocal)
  const elsewhere = meeting.timeZone !== accountZone
  const place = meetingLink(meeting.location)
  // The rule WITHOUT its ending, and the ending on its own: the picker chooses the shape and the
  // date field chooses where it stops, and neither should overwrite the other.
  const bare = meeting.rrule ? withUntil(meeting.rrule, null) : null
  const until = untilOf(meeting.rrule)

  return (
    <div className="flex flex-col gap-4">
      <div>
        {onClose ? (
          <DetailHead
            kind={
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-fg-muted">
                Meetings
                {meeting.overridden && <span className="text-xs text-fg-subtle">Edited</span>}
              </span>
            }
            onClose={onClose}
          />
        ) : (
          meeting.overridden && <span className="text-xs text-fg-subtle">Edited</span>
        )}
        <InlineText
          label="Title"
          value={meeting.title}
          placeholder="What is this meeting?"
          onSave={(title) => title && series({ title })}
          className="mt-0.5 block text-lg font-semibold text-fg"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Field label="Start">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <input
              type="datetime-local"
              aria-label="Start"
              key={meeting.startsLocal}
              defaultValue={meeting.startsLocal}
              onBlur={(e) => {
                const next = e.target.value
                // An emptied field is not a request to cancel the meeting, so it is put back.
                if (!next) {
                  e.target.value = meeting.startsLocal
                  return
                }
                if (next !== meeting.startsLocal) {
                  timing(
                    { startsLocal: next },
                    `This meeting repeats. Move it to ${next.replace('T', ' ')}?`,
                  )
                }
              }}
              className={`${boxed} h-8 py-0 text-sm tabular-nums`}
            />
            {/* The zone is the MEETING’s: "09:00 Toronto time" is what was agreed, whatever the
                  clock says here. */}
            <PickOne
              label="Time zone"
              value={meeting.timeZone}
              choices={ZONES.map((z) => ({ value: z, label: zoneLabel(z) }))}
              onPick={(timeZone) => series({ timeZone })}
            />
          </div>
        </Field>
        {elsewhere && (
          <Field label="Your time">
            {/* The same meeting on the account's own clock -- when YOU have to be there. Read-only: the
                  time was agreed in the other zone, and editing it here would be editing a
                  conversion. */}
            <span data-local-clock className="text-sm tabular-nums text-fg-muted">
              {new Intl.DateTimeFormat('en-US', {
                timeZone: accountZone,
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }).format(new Date(meeting.startsAt))}
            </span>
          </Field>
        )}
        <Field label="Length">
          <PickOne
            label="Length"
            value={String(meeting.durationMinutes)}
            choices={[15, 30, 45, 60, 90, 120].map((m) => ({
              value: String(m),
              label: m >= 60 ? `${m / 60} h` : `${m} min`,
            }))}
            onPick={(m) =>
              timing(
                { durationMinutes: Number(m) },
                'This meeting repeats. Which occurrences change length?',
              )
            }
          />
        </Field>
        <Field label="Repeats">
          <PickOne
            label="Repeats"
            value={bare ?? NO_REPEAT}
            /* Matched WITHOUT its ending, so a weekly meeting that stops in December is still
               the weekly choice. A rule the menu does not offer stays one of its options while
               it is the current value, or the control would show a placeholder for a value it
               has. */
            choices={[
              ...choices.map((c) => ({ value: c.value ?? NO_REPEAT, label: c.label })),
              ...(bare && !choices.some((c) => c.value === bare)
                ? [{ value: bare, label: repeatLabel(bare, meeting.startsLocal) }]
                : []),
            ]}
            onPick={(v) => series({ rrule: v === NO_REPEAT ? null : withUntil(v, until) })}
          />
        </Field>
        {/* WHEN IT STOPS. Only once it repeats -- an ending on a meeting that happens once is a
            control with nothing to end. */}
        {bare && (
          <Field label="Ends">
            <span className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Ends"
                value={until ?? ''}
                min={meeting.startsLocal.slice(0, 10)}
                onChange={(e) => series({ rrule: withUntil(bare, e.target.value || null) })}
                className={`${boxed} text-sm`}
              />
              {until ? (
                <button
                  type="button"
                  onClick={() => series({ rrule: withUntil(bare, null) })}
                  className="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
                >
                  Never
                </button>
              ) : (
                <span className="text-sm text-fg-subtle">Never</span>
              )}
            </span>
          </Field>
        )}
      </div>

      {asking && (
        <ScopeAsk
          what={asking.what}
          onPick={(scope) => {
            save.mutate({ ...asking.patch, scope, recurrenceId: meeting.recurrenceId })
            setAsking(null)
          }}
          onCancel={() => setAsking(null)}
        />
      )}
      {failed && (
        <p role="alert" className="text-sm text-danger">
          {failed}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Field label="Location">
          <span className="flex min-w-0 items-center gap-1.5">
            <InlineText
              label="Location"
              value={meeting.location ?? ''}
              placeholder="A room, an address, or a link"
              onSave={(location) => series({ location: location || null })}
              className="min-w-0 flex-1 truncate text-sm"
            />
            {/* The link sits BESIDE the value, not on it: the value has to stay clickable as an
                editor, so joining is its own control -- the same shape a contact's address
                takes. */}
            {place && (
              <a
                href={place}
                target="_blank"
                rel="noreferrer"
                aria-label="Join"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-hover hover:text-fg"
              >
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
                  <path
                    d="M6.5 3.5h6v6M12.5 3.5l-8 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            )}
          </span>
        </Field>
        <Field label="Projects" top>
          <PickOne
            label="Projects"
            value={meeting.projectId ?? NO_PROJECT}
            /* "No project" is a CHOICE, not only the placeholder: a meeting filed by mistake
               could be moved but never unfiled. */
            choices={[
              { value: NO_PROJECT, label: 'No project' },
              ...(projects.data ?? [])
                .filter((p) => !p.archivedAt)
                .map((p) => ({ value: p.id, label: p.name, mark: chip(p.id) })),
            ]}
            onPick={(v) => series({ projectId: v === NO_PROJECT ? null : v })}
          />
        </Field>
      </div>

      <div>
        <span className="block text-xs text-fg-muted">Attendees</span>
        <div className="mt-1" data-attendees>
          <PickMany
            label="Attendees"
            chosen={meeting.attendees.map((p) => ({ value: p.id, label: p.name }))}
            choices={(contacts.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            onChange={(attendeeIds) => series({ attendeeIds })}
            empty="Nobody yet"
          />
        </div>
      </div>

      <div>
        <span className="block text-xs text-fg-muted">Notes</span>
        <InlineText
          label="Notes"
          value={meeting.note ?? ''}
          placeholder="No notes yet"
          multiline
          onSave={(note) => series({ note: note || null })}
          className="mt-1 block max-w-[68ch] text-sm whitespace-pre-wrap text-fg"
        />
      </div>

      <div className="pt-1">
        {cancelling ? (
          repeats ? (
            <ScopeAsk
              what={`Cancel which occurrences of “${meeting.title}”?`}
              onPick={(scope) => drop.mutate(scope)}
              onCancel={() => setCancelling(false)}
            />
          ) : (
            <DeleteConfirm
              label="Confirm cancelling this meeting"
              message={`Cancel “${meeting.title}”?`}
              busy={drop.isPending}
              onConfirm={() => drop.mutate('all')}
              onCancel={() => setCancelling(false)}
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="h-9 rounded-lg px-2.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            Cancel meeting
          </button>
        )}
      </div>
    </div>
  )
}
