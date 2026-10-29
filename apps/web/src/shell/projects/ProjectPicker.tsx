import type { ProjectId } from '@ctws/contracts'
import { PickMany, PickOne, type Choice } from '../../platform/ui/inline'
import { useEveryProject, useProjects } from './api'
import { ProjectSquare } from './ProjectSquare'

/** A project beside its name in a picker: its square, as everywhere a project is named (G-02). */
export function ProjectChip({ projectId }: { projectId: ProjectId }) {
  const project = useEveryProject().data?.find((p) => p.id === projectId)
  return project ? <ProjectSquare project={project} /> : null
}

function useLiveChoices(): Choice<ProjectId>[] {
  const projects = useProjects()
  return (projects.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
    mark: <ProjectChip projectId={p.id} />,
  }))
}

/**
 * One live project or none; `none` is what "none" is called here. An archived project already
 * chosen stays named.
 */
export function ProjectPicker({
  value,
  onPick,
  none,
}: {
  value: ProjectId | null
  onPick: (id: ProjectId | null) => void
  none: string
}) {
  const choices = useLiveChoices()
  const shelved = useEveryProject().data?.find((p) => p.id === value && p.archivedAt)
  return (
    <PickOne
      label="Projects"
      value={value}
      choices={[
        { value: null, label: none },
        ...choices,
        ...(shelved
          ? [
              {
                value: shelved.id,
                label: shelved.name,
                mark: <ProjectChip projectId={shelved.id} />,
              },
            ]
          : []),
      ]}
      onPick={onPick}
    />
  )
}

/** Any number of the live projects; one already chosen stays named after it is archived. */
export function ProjectsPicker({
  chosen,
  onChange,
}: {
  chosen: readonly ProjectId[]
  onChange: (ids: ProjectId[]) => void
}) {
  // Live and archived: a project chosen before it was archived is still named.
  const projects = useEveryProject()
  const choices = useLiveChoices()
  return (
    <PickMany
      label="Projects"
      chosen={chosen.map((id) => ({
        value: id,
        label: projects.data?.find((p) => p.id === id)?.name ?? '',
        mark: <ProjectChip projectId={id} />,
      }))}
      choices={choices}
      onChange={onChange}
      empty="Not on any project"
    />
  )
}
