import { useNavigate } from 'react-router-dom'
import { MEETINGS_ID } from '../logic/id'
import { NewMeetingDialog } from './NewMeetingDialog'

/** `N M` from anywhere: the new meeting's page opens once it is made (FR-026). */
export function NewMeeting({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <NewMeetingDialog
      onClose={onClose}
      onMade={(made) => {
        onClose()
        navigate(
          `/${MEETINGS_ID}/${made.meetingId}?${new URLSearchParams({ at: made.recurrenceId })}`,
        )
      }}
    />
  )
}
