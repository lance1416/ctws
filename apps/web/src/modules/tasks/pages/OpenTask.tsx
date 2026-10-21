import { idFrom, taskId } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../platform/http/api'
import { HANG } from '../../../platform/ui/hang'
import { DeletedNotice } from '../../../shell/detail'
import { taskQuery } from '../api'

/**
 * `/tasks/<id>`: where a link goes when all it knows is the task. A task has no page of its own,
 * so this finds its project and opens it there, in place of this step in the history.
 */
export function OpenTask() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  // Only an id is asked about: under /api/v1/tasks a word like `completed` names a list.
  const isId = taskId.safeParse(id).success
  const found = useQuery({ ...taskQuery(idFrom(taskId, id)), enabled: isId })
  useEffect(() => {
    if (found.data)
      navigate(`/projects/${found.data.projectId}?task=${found.data.id}`, { replace: true })
  }, [found.data, navigate])

  if (isId && !found.isError) return null
  // Gone only on the server's 404; anything else is a failure to ask, and the task may still exist.
  const gone = !isId || (found.error instanceof ApiError && found.error.status === 404)
  if (gone && isId) return <DeletedNotice type="task" id={id} />
  return (
    <p role="alert" className={`mt-4 ${HANG} text-ui text-muted`}>
      {gone
        ? 'There is no such task.'
        : "Couldn't open this task. Check that the server is running."}
    </p>
  )
}
