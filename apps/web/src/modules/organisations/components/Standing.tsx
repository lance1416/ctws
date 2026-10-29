import type { ProjectStanding } from '@ctws/contracts'
import { Link } from 'react-router-dom'
import { StageLabel } from '../../../platform/ui/StageLabel'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'

/** A project, by its square and name, linking to its page. */
export function ProjectNamed({ standing }: { standing: ProjectStanding }) {
  const project = useEveryProject().data?.find((p) => p.id === standing.projectId)
  return (
    <Link
      to={`/projects/${standing.projectId}`}
      className="inline-flex min-w-0 items-center gap-2 text-ui text-ink hover:underline max-lg:tap"
    >
      {project && <ProjectSquare project={project} />}
      <span className="truncate">{standing.projectName}</span>
    </Link>
  )
}

/** A project named on a timeline line: its square and name, linking to it. */
export function ProjectById({ id, name }: { id: string | null; name: string }) {
  const project = useEveryProject().data?.find((p) => p.id === id)
  if (!project) return <span>{name}</span>
  return (
    <Link
      to={`/projects/${project.id}`}
      className="inline-flex min-w-0 items-center gap-1.5 text-ink hover:underline max-lg:tap"
    >
      <ProjectSquare project={project} />
      <span className="truncate">{name}</span>
    </Link>
  )
}

/** The stage of the node there related to it, or nothing when it has none. */
export function StageOf({ standing }: { standing: ProjectStanding | null }) {
  return standing?.stage ? <StageLabel name={standing.stage} quiet={false} /> : null
}
