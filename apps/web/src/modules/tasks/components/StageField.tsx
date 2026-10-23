import type { ProjectId, StageId, StageResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { boxed } from '../../../platform/ui/formStyles'
import { putStages } from '../../../shell/projects'
import { projectTasksQuery } from '../api'

/** The stage row's mark: the dot every stage label starts with (DES-001 section 4). */
export function StageDot() {
  return (
    <span className="grid size-4 place-items-center">
      <i className="size-2 rounded-full bg-muted" />
    </span>
  )
}

/**
 * A node's stage, edited (FR-040): the project's stages to pick from as it is typed, a new name
 * made one of them, nothing for none. A new stage is added to the project the moment it is
 * named, so it is there to pick again at once; the node takes it with the edit's Save.
 */
export function StagePicker({
  projectId,
  stages,
  value,
  onChange,
  onBusy,
}: {
  projectId: ProjectId
  stages: readonly StageResponse[]
  value: StageId | null
  onChange: (stage: StageId | null) => void
  /** A new stage is being added: the edit's Save waits for it, or it would save without it. */
  onBusy: (busy: boolean) => void
}) {
  const list = useId()
  const [text, setText] = useState(stages.find((s) => s.id === value)?.name ?? '')
  const add = useMutation({
    mutationFn: (name: string) =>
      putStages(projectId, {
        stages: [
          ...stages.map((s) => ({ id: s.id, name: s.name, collapsed: s.collapsed })),
          { name },
        ],
      }),
    meta: {
      changes: ['task'],
      awaits: [projectTasksQuery(projectId).queryKey],
      ownsError: true,
    },
  })
  const commit = async () => {
    const name = text.trim()
    if (name === '') return onChange(null)
    // A stage is one name, whatever its case: "Phone Screen" is "Phone screen" (FR-040).
    const found = stages.find((s) => s.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    if (found) {
      setText(found.name)
      return onChange(found.id)
    }
    onBusy(true)
    try {
      const made = await add.mutateAsync(name)
      const stage = made.stages.find((s) => s.name.toLocaleLowerCase() === name.toLocaleLowerCase())
      if (stage) onChange(stage.id)
    } catch {
      // Said under the box (`add.isError`); the name stays there to try again.
    } finally {
      onBusy(false)
    }
  }
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1 py-1">
      <input
        list={list}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          // Enter takes the name here; Ctrl Enter is still the form's Save.
          if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.nativeEvent.isComposing) return
          e.preventDefault()
          void commit()
        }}
        aria-label="Stage"
        aria-invalid={add.isError ? true : undefined}
        placeholder="No stage"
        className={`w-full max-w-60 ${boxed}`}
      />
      <datalist id={list}>
        {stages.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      {add.isError && (
        <span role="alert" className="text-meta text-stop-t">
          Couldn’t add that stage
        </span>
      )}
    </span>
  )
}
