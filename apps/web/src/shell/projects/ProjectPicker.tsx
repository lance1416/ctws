import { PickMany, PickOne, type Choice } from '../../platform/ui/inline'
import { useEveryProject, useProjects } from './api'
import { useProjectRail } from './projectColor'

const NONE = '__no-project'

/** A project's colour as the 3px mark beside its name, which is always shown with it. */
export function ProjectChip({ projectId }: { projectId: string }) {
  const rail = useProjectRail()
  return (
    <span aria-hidden="true" className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(projectId)}`} />
  )
}

function useLiveChoices(): Choice<string>[] {
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
  value: string | null
  onPick: (id: string | null) => void
  none: string
}) {
  const choices = useLiveChoices()
  const shelved = useEveryProject().data?.find((p) => p.id === value && p.archivedAt)
  return (
    <PickOne
      label="Projects"
      value={value ?? NONE}
      choices={[
        { value: NONE, label: none },
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
      onPick={(v) => onPick(v === NONE ? null : v)}
    />
  )
}

/** Any number of the live projects; one already chosen stays named after it is archived. */
export function ProjectsPicker({
  chosen,
  onChange,
}: {
  chosen: readonly string[]
  onChange: (ids: string[]) => void
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
