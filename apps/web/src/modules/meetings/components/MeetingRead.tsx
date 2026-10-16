import { ruleEndDay, type MeetingOccurrence } from '@ctws/contracts'
import { shortDay, todayIn } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { BUTTON, LINK } from '../../../platform/ui/buttonStyles'
import { Field } from '../../../platform/ui/Field'
import { CHIP } from '../../../platform/ui/formStyles'
import { ProjectChip } from '../../../shell/projects/ProjectPicker'
import { repeatLabel, withUntil } from '../api'
import { meetingLink } from '../meetingPlace'
import { zoneLabel } from '../timeZones'
import { lengthLabel } from './MeetingControls'

export function MeetingRead({
  meeting,
  accountZone,
  onEdit,
}: {
  meeting: MeetingOccurrence
  accountZone: string
  onEdit: () => void
}) {
  const elsewhere = meeting.timeZone !== accountZone
  const place = meetingLink(meeting.location)
  const bare = meeting.rrule ? withUntil(meeting.rrule, null) : null
  const until = ruleEndDay(meeting.rrule)
  // The meeting's own wall clock in the app's date wording (`Oct 19, 18:00`), not the wire format.
  const today = todayIn(accountZone, useNow())
  const when = `${shortDay(meeting.startsLocal.slice(0, 10), today)}, ${meeting.startsLocal.slice(11, 16)}`

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 data-detail-title className="truncate text-lg font-semibold text-ink">
            {meeting.title}
          </h2>
          <p className="truncate text-sm text-ink-muted tabular-nums">
            {when} · {zoneLabel(meeting.timeZone, new Date(meeting.startsAt))}
          </p>
        </div>
        <button type="button" className={BUTTON.secondary} onClick={onEdit}>
          Edit
        </button>
      </div>

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          {elsewhere && (
            <Field label="Your time">
              {/* Not editable: the time was agreed in the meeting's zone; this is a conversion. */}
              <span data-local-clock className="text-sm tabular-nums text-ink-muted">
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
            <span className="text-sm text-ink">{lengthLabel(meeting.durationMinutes)}</span>
          </Field>
          <Field label="Repeats">
            <span className="text-sm text-ink">
              {bare ? repeatLabel(bare, meeting.startsLocal, today) : 'Once'}
            </span>
          </Field>
          {bare && (
            <Field label="Ends">
              <span className="text-sm tabular-nums text-ink">
                {until ? shortDay(until, today) : 'Never'}
              </span>
            </Field>
          )}
          <Field label="Projects">
            {meeting.projectId && meeting.projectName ? (
              <span className="flex">
                <span className={CHIP}>
                  <ProjectChip projectId={meeting.projectId} />
                  <span className="truncate">{meeting.projectName}</span>
                </span>
              </span>
            ) : (
              <span className="text-sm text-ink-subtle">Not on any project</span>
            )}
          </Field>
        </div>
      </div>

      <Field label="Location">
        <span className="flex min-w-0 items-center gap-1.5">
          {meeting.location ? (
            place ? (
              <a
                href={place}
                target="_blank"
                rel="noreferrer"
                className={`min-w-0 flex-1 truncate text-sm ${LINK}`}
              >
                {meeting.location}
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{meeting.location}</span>
            )
          ) : (
            <span className="text-sm text-ink-subtle">Not set</span>
          )}
        </span>
      </Field>

      <Field label="Attendees">
        <div data-attendees className="flex flex-wrap gap-1.5">
          {meeting.attendees.length === 0 ? (
            <span className="text-sm text-ink-subtle">Nobody yet</span>
          ) : (
            meeting.attendees.map((p) => (
              <span key={p.id} className={CHIP}>
                {p.name}
              </span>
            ))
          )}
        </div>
      </Field>

      <Field label="Notes">
        {meeting.note ? (
          <p className="max-w-[68ch] text-sm whitespace-pre-wrap text-ink">{meeting.note}</p>
        ) : (
          <p className="text-sm text-ink-subtle">No notes yet</p>
        )}
      </Field>
    </>
  )
}
