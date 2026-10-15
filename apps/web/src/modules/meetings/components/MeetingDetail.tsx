import type { MeetingOccurrence } from '@ctws/contracts'
import { useState } from 'react'
import { DangerZone } from '../../../platform/ui/DangerZone'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { BackHead } from '../../../shell/detail/BackHead'
import { LinkedSection } from '../../../shell/links/Links'
import { useRecordRecent } from '../../../shell/search/recent'
import { CancelMeeting } from './CancelMeeting'
import { MeetingForm } from './MeetingForm'
import { MeetingRead } from './MeetingRead'
import { ScopeAsk } from './ScopeAsk'
import { useScopedEdit } from './useScopedEdit'

/** One occurrence in the detail pane; changing when it is asks which occurrences you mean. */
export function MeetingDetail({
  meeting,
  accountZone,
  onClose,
  onMoved,
}: {
  meeting: MeetingOccurrence
  /** The account's own zone: what the clock beside the meeting's own is in. */
  accountZone: string
  onClose: () => void
  /** A save moved it, and so may have renamed it: this is the occurrence the server now has. */
  onMoved: (occurrence: MeetingOccurrence) => void
}) {
  useRecordRecent({
    type: 'meeting',
    id: meeting.meetingId,
    title: meeting.title,
    to: `/meetings/${meeting.meetingId}`,
    kind: 'Meeting',
  })
  const [editing, setEditing] = useState(false)
  const edit = useScopedEdit(meeting, (moved) => {
    setEditing(false)
    if (moved) onMoved(moved)
  })

  return (
    <DetailPane label="Meetings" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <BackHead
          to="/meetings"
          label="Meetings"
          onClose={onClose}
          note={meeting.overridden && <span className="text-xs text-ink-subtle">Edited</span>}
        />

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

        {editing ? (
          <MeetingForm
            meeting={meeting}
            accountZone={accountZone}
            busy={edit.busy}
            onCancel={() => {
              edit.reset()
              setEditing(false)
            }}
            onSave={edit.submit}
          />
        ) : (
          <MeetingRead
            meeting={meeting}
            accountZone={accountZone}
            onEdit={() => setEditing(true)}
          />
        )}
      </div>

      {/* People are left out: attendees are written on the meeting itself. */}
      <LinkedSection
        of={{ type: 'meeting', id: meeting.meetingId }}
        except={['person']}
        className="mt-4"
      />
      <DangerZone>
        <CancelMeeting meeting={meeting} onCancelled={onClose} />
      </DangerZone>
    </DetailPane>
  )
}
