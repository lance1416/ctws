import type { EditScope, MeetingOccurrence, UpdateMeetingInput } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { listContacts } from '../api/contacts'
import { cancelMeeting, patchMeeting, repeatChoices, repeatLabel } from '../api/meetings'
import { listProjects } from '../api/projects'
import { useProjectRail } from '../projectColor'
import { ZONES, zoneLabel } from '../timeZones'
import { DeleteConfirm } from './DeleteConfirm'
import { DetailHead, DetailPane } from './DetailPane'
import { boxed } from './formStyles'
import { InlineText, PickMany, PickOne } from './inline'
import { ScopeAsk } from './ScopeAsk'

/**
 * ONE MEETING, in the shell's detail pane -- the same pane a task and a person open in.
 *
 * What is open is an OCCURRENCE, not a series: 「这周二那个会」. Changing it therefore has to ask
 * which one you mean, and only for the things that can differ between two occurrences. Everything
 * else is the series', and changes all of them.
 *
 * The two fields that are real fields here are the clock and the zone. A time is composed, so
 * `datetime-local` is the control every browser already has for composing one; it still writes on
 * leaving, like everything else in this pane. There is no 保存.
 */
/**
 * The pane: this module's fields inside the shell's frame.
 *
 * The FIELDS are a component of their own because the meeting's own page shows the same ones with
 * no frame around them (`relations.Head`). One editor, two places -- a second copy drifts.
 */
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
  /** A change waiting on 「只改这次 / 以后都改」. Null when nothing is being asked. */
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
            value={meeting.rrule ?? '__none'}
            /* A rule the menu does not offer is still one of its options while it is the
                 current value, or the control would show a placeholder for a value it has. */
            choices={[
              ...choices.map((c) => ({ value: c.value ?? '__none', label: c.label })),
              ...(meeting.rrule && !choices.some((c) => c.value === meeting.rrule)
                ? [
                    {
                      value: meeting.rrule,
                      label: repeatLabel(meeting.rrule, meeting.startsLocal),
                    },
                  ]
                : []),
            ]}
            onPick={(v) => series({ rrule: v === '__none' ? null : v })}
          />
        </Field>
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
          <InlineText
            label="Location"
            value={meeting.location ?? ''}
            placeholder="Not set"
            onSave={(location) => series({ location: location || null })}
            className="text-sm"
          />
        </Field>
        <Field label="Projects" top>
          <PickOne
            label="Projects"
            value={meeting.projectId}
            choices={(projects.data ?? [])
              .filter((p) => !p.archivedAt)
              .map((p) => ({ value: p.id, label: p.name, mark: chip(p.id) }))}
            onPick={(projectId) => series({ projectId })}
            placeholder="No project"
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

function Field({
  label,
  top = false,
  children,
}: {
  label: string
  top?: boolean
  children: ReactNode
}) {
  return (
    <div className={`flex gap-2 ${top ? 'items-start' : 'items-center'}`}>
      <span className={`w-20 shrink-0 text-xs text-fg-muted ${top ? 'pt-2' : ''}`}>{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
