import type { ProjectId } from '@ctws/contracts'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { PEOPLE_ID } from '../logic/id'

/**
 * `N P`, a block's `+`, the sidebar's: New person is a page of its own in the main area, not a
 * dialog (FR-062); made from a project, they are kept on it.
 */
export function NewPerson({
  projectId,
  onClose,
}: {
  projectId: ProjectId | null
  onClose: () => void
  opens: boolean
}) {
  const navigate = useNavigate()
  useEffect(() => {
    onClose()
    navigate(`/${PEOPLE_ID}/new${projectId ? `?project=${projectId}` : ''}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the press it answers.
  }, [])
  return null
}
