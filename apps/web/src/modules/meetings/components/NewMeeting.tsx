import type { ProjectId } from '@ctws/contracts'
import { useNavigate } from 'react-router-dom'
import { MEETINGS_ID } from '../logic/id'
import { NewMeetingDialog } from './NewMeetingDialog'

/**
 * `N M`, a block's `+`, the sidebar's: made from Meetings itself, its page opens once made; from
 * anywhere else that page stays (FR-026).
 */
export function NewMeeting({
  projectId,
  onClose,
  opens,
}: {
  projectId: ProjectId | null
  onClose: () => void
  opens: boolean
}) {
  const navigate = useNavigate()
  return (
    <NewMeetingDialog
      projectId={projectId}
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
