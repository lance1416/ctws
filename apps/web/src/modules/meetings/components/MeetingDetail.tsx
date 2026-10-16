import type { MeetingOccurrence } from '@ctws/contracts'
import { ItemPane, useItemPane } from '../../../shell/detail'
import { CancelMeeting } from './CancelMeeting'
import { MeetingForm } from './MeetingForm'
import { MeetingRead } from './MeetingRead'
import { ScopeAsk } from './ScopeAsk'
import { useScopedEdit } from './useScopedEdit'

/** One occurrence in the detail pane; changing when it is asks which occurrences you mean. */
export function MeetingDetail({
  meeting,
  onClose,
  onMoved,
}: {
  meeting: MeetingOccurrence
  onClose: () => void
  /** A save moved it, and so may have renamed it: this is the occurrence the server now has. */
  onMoved: (occurrence: MeetingOccurrence) => void
}) {
  const pane = useItemPane(onClose)
  const edit = useScopedEdit(meeting, (moved) => {
    pane.setEditing(false)
    if (moved) onMoved(moved)
  })

  return (
    <ItemPane
      pane={pane}
      label="Meetings"
      back="/meetings"
      note={meeting.overridden && <span className="text-xs text-ink-subtle">Edited</span>}
      recent={{
        type: 'meeting',
        id: meeting.meetingId,
        title: meeting.title,
        to: `/meetings/${meeting.meetingId}`,
        kind: 'Meeting',
      }}
      // People are left out: attendees are written on the meeting itself.
      linked={{
        of: { type: 'meeting', id: meeting.meetingId },
        types: ['task', 'reading', 'meeting', 'project'],
      }}
      danger={<CancelMeeting meeting={meeting} onCancelled={onClose} />}
    >
      {/* Above the form, beside the Save that raised it. */}
      {edit.asking && (
        <ScopeAsk
          what="This meeting repeats. Which occurrences does this change?"
          onPick={edit.pick}
          onCancel={edit.back}
          // The form under it has a Cancel of its own, which this must not be confused with.
          back="Keep editing"
        />
      )}
      {edit.failed && (
        <p role="alert" className="text-sm text-danger">
          {edit.failed}
        </p>
      )}

      {pane.editing ? (
        <MeetingForm
          meeting={meeting}
          busy={edit.busy}
          onCancel={() => {
            edit.reset()
            pane.setEditing(false)
          }}
          onSave={edit.submit}
          onUnsaved={pane.onUnsaved}
        />
      ) : (
        <MeetingRead meeting={meeting} onEdit={() => pane.setEditing(true)} />
      )}
    </ItemPane>
  )
}
