import type { ProjectId } from '@ctws/contracts'
import { useNavigate } from 'react-router-dom'
import { PEOPLE_ID } from '../logic/id'
import { NewPersonDialog } from './NewPersonDialog'

/** `N P` from anywhere, and the sidebar's `+`: the new person's page opens once they are added. */
export function NewPerson({
  projectId,
  onClose,
}: {
  projectId: ProjectId | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  return (
    <NewPersonDialog
      projectId={projectId}
      onClose={onClose}
      onMade={(made) => {
        onClose()
        navigate(`/${PEOPLE_ID}/${made.id}`)
      }}
    />
  )
}
