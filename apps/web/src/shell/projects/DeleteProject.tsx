import type { ProjectId } from '@ctws/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteProject, projectKeys, useEveryProject } from './api'
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

  /**
   * What the modules say goes with it ("12 tasks"); null until they have all answered, and
   * `uncounted` when one could not say, which still leaves the question to ask.
   */
  const [contents, setContents] = useState<string[] | 'uncounted' | null>(null)
  const ask = async () => {
    setContents(null)
    try {
      const parts = await Promise.all(projectContents.map((c) => c(qc, id)))
      setContents(parts.filter((p): p is string => p !== null))
    } catch {
      setContents('uncounted')
    }
  }
  const forget = useForgetRecent()
  const remove = useMutation({
    mutationFn: () => deleteProject(id),
    meta: { changes: ['project'], awaits: [projectKeys.all], ownsError: true },
    onSuccess: () => {
      forget('project', id)
      navigate('/projects')
    },
  })

  if (!project || project.isInbox) return null
  return (
    <>
      <DangerAction
        label={`Delete ${project.name}`}
        confirmLabel={`Delete ${project.name}`}
        // First what goes, then what stays (FR-035).
        message={
          contents === null
            ? null
            : `Delete ${project.name}?${
                contents === 'uncounted'
                  ? ' Everything in it goes.'
                  : contents.length === 0
                    ? ''
                    : ` Its ${contents.join(' and ')} go.`
              } Its meetings, notes, people and reading stay, outside any project.`
        }
        confirm={`Delete ${project.name}`}
        busy={remove.isPending}
        onAsk={() => void ask()}
        onConfirm={() => remove.mutate()}
      />
      {remove.isError && (
        <p role="alert" className="text-ui text-stop-t">
          {problemText(remove.error)}
        </p>
      )}
    </>
  )
}
