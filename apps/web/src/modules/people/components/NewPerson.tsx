import type { ProjectId } from '@ctws/contracts'
import { useNavigate } from 'react-router-dom'
import { PEOPLE_ID } from '../logic/id'
import { NewPersonDialog } from './NewPersonDialog'

/**
 * `N P`, a block's `+`, the sidebar's: added from People itself, their page opens; from anywhere
 * else that page stays, and its block shows them (FR-026).
 */
export function NewPerson({
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
    <NewPersonDialog
      projectId={projectId}
      onClose={onClose}
      onMade={(made) => {
        onClose()
        if (opens) navigate(`/${PEOPLE_ID}/${made.id}`)
      }}
    />
  )
}
