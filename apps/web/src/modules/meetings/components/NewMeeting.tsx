import { idFrom, personId, type ObjectType, type ProjectId } from '@ctws/contracts'
import { useNavigate } from 'react-router-dom'
import { MEETINGS_ID } from '../logic/id'
import { NewMeetingDialog } from './NewMeetingDialog'

/**
 * `N M`, a block's `+`, the sidebar's: made from Meetings itself, its page opens once made; from
 * anywhere else that page stays (FR-026).
 */
export function NewMeeting({
  projectId,
  about,
  onClose,
  opens,
}: {
  projectId: ProjectId | null
  about: { type: ObjectType; id: string } | null
  onClose: () => void
  opens: boolean
}) {
  const navigate = useNavigate()
  return (
    <NewMeetingDialog
      projectId={projectId}
      // Made from a person's page, they are in it (FR-061).
      attendeeIds={about?.type === 'person' ? [idFrom(personId, about.id)] : []}
      onClose={onClose}
      onMade={(made) => {
        onClose()
        if (opens)
          navigate(
            `/${MEETINGS_ID}/${made.meetingId}?${new URLSearchParams({ at: made.recurrenceId })}`,
          )
      }}
    />
  )
}
