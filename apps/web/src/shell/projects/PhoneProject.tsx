import type { ProjectId } from '@ctws/contracts'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BackIcon } from '../../platform/ui/icons'
import { useRegistry } from '../registry'
import { useEveryProject } from './api'
import { MoreMenu } from './ProjectHead'
import { NewMenu } from '../creates'
import { PinnedResources } from './PinnedResources'
import { ProjectLinked } from './ProjectLinked'
import { ProjectSquare } from './ProjectSquare'

/**
 * A PROJECT ON A PHONE (FR-088, DES-001 "项目页"): back to Projects and "…" above; its square and
 * name; its pinned resources, wrapping, without their digits; its tree, the one view; then what is
 * linked to it, a block a row.
 */
export function PhoneProject({ id }: { id: ProjectId }) {
  const registry = useRegistry()
  const main = registry.projectMain
  const project = useEveryProject().data?.find((p) => p.id === id)
  const [sheet, setSheet] = useState<number | null>(null)
  if (!project) return null
  const more = main?.phoneMore ?? []
  const Open = sheet === null ? null : (more[sheet]?.Sheet ?? null)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex min-h-11 items-center gap-1">
        <Link
          to="/projects"
          className="-ml-1 flex min-h-11 flex-1 items-center gap-1 text-prose text-task-t"
        >
          <BackIcon size={20} aria-hidden="true" />
          Projects
        </Link>
        {/* What can belong to it, made in it (FR-026). */}
        <NewMenu projectName={project.name} className="shrink-0" compact />
        <MoreMenu
          id={id}
          archived={project.isInbox ? null : project.archivedAt !== null}
          more={more.map((m, i) => ({ label: m.label, onSelect: () => setSheet(i) }))}
        />
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <ProjectSquare project={project} size={34} />
        <h1
          id="project-heading"
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-title text-ink focus:outline-none"
        >
          {project.name}
        </h1>
        {project.archivedAt && (
          <span className="inline-flex h-5.5 shrink-0 items-center rounded-control bg-hover px-2 text-meta font-medium text-muted">
            Archived
          </span>
        )}
      </div>
      <PinnedResources projectId={id} name={project.name} />
      {main && (
        <section aria-label={main.moduleLabel} data-panel={main.moduleLabel} className="min-w-0">
          {main.Phone ? (
            <main.Phone projectId={id} />
          ) : (
            <main.Component projectId={id} view={main.views[0].id} />
          )}
        </section>
      )}
      <ProjectLinked projectId={id} columns={1} beside={false} />
      {Open && <Open projectId={id} onClose={() => setSheet(null)} />}
    </div>
  )
}
