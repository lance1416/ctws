import type { ProjectId } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteProject, useEveryProject } from './api'
import { DangerAction } from '../../platform/ui/DangerZone'
import { problemText } from '../../platform/http/api'
import { useRegistry } from '../registry'
import { useForgetRecent } from '../search/recent'

/**
 * Deletes a project, live or archived, and everything in it. What goes with it is asked of the modules when the
 * question opens, not on every page load. The inbox has none: capture has to land somewhere.
 */
export function DeleteProject({ id }: { id: ProjectId }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { projectContents } = useRegistry()
  const projects = useEveryProject()
  const project = projects.data?.find((p) => p.id === id)

  /** What the modules say goes with it ("12 tasks"); null until they have all answered. */
  const [contents, setContents] = useState<string[] | null>(null)
  const ask = async () => {
    setContents(null)
    const parts = await Promise.all(projectContents.map((c) => c(qc, id)))
    setContents(parts.filter((p): p is string => p !== null))
  }
  const forget = useForgetRecent()
  const remove = useMutation({
    mutationFn: () => deleteProject(id),
    meta: { awaits: [['projects']], ownsError: true },
    onSuccess: () => {
      forget('project', id)
      navigate('/projects')
    },
  })

  if (!project || project.isInbox) return null
  return (
    <>
      <DangerAction
        label="Delete project"
        confirmLabel="Confirm deleting this project"
        message={
          contents === null
            ? null
            : contents.length === 0
              ? `Delete “${project.name}”. This cannot be undone.`
              : `Delete “${project.name}” and its ${contents.join(' and ')}. This cannot be undone.`
        }
        busy={remove.isPending}
        onAsk={() => void ask()}
        onConfirm={() => remove.mutate()}
      />
      {remove.isError && (
        <p role="alert" className="text-sm text-danger">
          {problemText(remove.error)}
        </p>
      )}
    </>
  )
}
