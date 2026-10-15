import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../platform/http/api'
import { HANG } from '../../../platform/ui/hang'
import { getTask } from '../api/tasks'

/**
 * `/tasks/<id>`: where a link goes when all it knows is the task. A task has no page of its own,
 * so this finds its project and opens it there, in place of this step in the history.
 */
export function OpenTask() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const found = useQuery({ queryKey: ['task', id], queryFn: () => getTask(id), retry: false })
  useEffect(() => {
    if (found.data)
      navigate(`/projects/${found.data.projectId}?task=${found.data.id}`, { replace: true })
  }, [found.data, navigate])

  if (!found.isError) return null
  // Gone is what the server SAYS (404); anything else is a failure to ask, and saying the task is
  // gone then would send someone looking for a task that is still there.
  return (
    <p role="alert" className={`mt-4 ${HANG} text-sm text-ink-muted`}>
      {found.error instanceof ApiError && found.error.status === 404
        ? 'This task is not here any more.'
        : "Couldn't open this task. Check that the server is running."}
    </p>
  )
}
