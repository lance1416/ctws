import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { deleteProject, listProjects } from './api'
import { listProjectTasks } from '../../modules/tasks/api/tasks'
import { refreshProjects, tasksKey } from '../../modules/tasks/api/taskCache'
import { DangerAction } from '../../platform/ui/DangerZone'
import { useForgetRecent } from '../search/recent'

/**
 * DESTROYING A PROJECT, from the project's own page and nowhere else.
 *
 * It takes every task in it, so the question says how many -- counted when the question opens,
 * because a count nobody asked for is a request on every page load, and confirming blind is worse
 * than waiting a moment for the number.
 *
 * The inbox has no delete at all: quick capture has to land somewhere, and the server refuses it.
 */
export function DeleteProject({ id }: { id: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const project = projects.data?.find((p) => p.id === id)

  const counted = useQuery({
    queryKey: tasksKey(id),
    queryFn: () => listProjectTasks(id),
    enabled: false,
  })
  const forget = useForgetRecent()
  const remove = useMutation({
    mutationFn: () => deleteProject(id),
    onSuccess: async () => {
      forget('project', id)
      await refreshProjects(qc)
      navigate('/projects')
    },
  })

  if (!project || project.isInbox) return null
  const tasks = counted.data?.tasks.length ?? null
  return (
    <DangerAction
      label="Delete project"
      confirmLabel="Confirm deleting this project"
      message={
        tasks === null
          ? null
          : tasks === 0
            ? `Delete “${project.name}”. This cannot be undone.`
            : `Delete “${project.name}” and its ${tasks} tasks. This cannot be undone.`
      }
      busy={remove.isPending}
      onAsk={() => counted.refetch()}
      onConfirm={() => remove.mutate()}
    />
  )
}
