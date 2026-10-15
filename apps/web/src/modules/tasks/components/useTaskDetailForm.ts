import type { TaskResponse, UpdateTaskBody } from '@ctws/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { fromDayTimeInput, toDayTimeInput } from '../../../platform/time/dates'
import { useTimeZone } from '../../../shell/auth/useMe'
import { moveTask, patchTask } from '../api/tasks'
import { detailTaskForm, PATCH_KEYS, type DetailTaskForm, type DetailTaskValues } from '../taskForm'

/** What a write from the pane waits to see refetched: any edit can move a task between lists. */
export const WRITE_AWAITS = [['tasks']]

/**
 * THE PANE'S EDIT FORM. `react-hook-form` for two things: `isDirty` (the leave guard's question)
 * and `dirtyFields` (the PATCH, read through the contract's own keys). The leave guard itself is
 * not a form concern and stays with the pane.
 *
 * The defaults are read once, at mount: a background refetch of `task` must not make an untouched
 * form look edited. The deadline is held as the instant the contract takes, normalised to the
 * field's minute precision, so an untouched one with seconds is not reported as changed.
 */
export function useTaskDetailForm(task: TaskResponse) {
  const timeZone = useTimeZone()
  const form = useForm<DetailTaskForm, unknown, DetailTaskValues>({
    resolver: zodResolver(detailTaskForm),
    defaultValues: {
      projectId: task.projectId,
      title: task.title,
      notes: task.notes,
      status: task.status,
      scheduledOn: task.scheduledOn,
      dueAt: fromDayTimeInput(toDayTimeInput(task.dueAt, timeZone), timeZone),
    },
  })
  // Read at render, which is what subscribes the form to them.
  const { dirtyFields, isDirty } = form.formState

  const save = useMutation({
    mutationFn: async ({ values, changed }: { values: DetailTaskValues; changed: Set<string> }) => {
      // Only what the person touched, and the library is what knows it: comparing against the
      // live `task` would send a stale value back over a background refetch.
      const patch: UpdateTaskBody = {}
      for (const key of PATCH_KEYS) {
        if (changed.has(key)) Object.assign(patch, { [key]: values[key] })
      }
      if (Object.keys(patch).length > 0) await patchTask(task.id, patch)
      // Crossing projects is the move endpoint's: it cascades to the subtree and keeps the
      // invariants a PATCH would not. The old parent is not in the new project.
      if (changed.has('projectId')) {
        await moveTask(task.id, { projectId: values.projectId, parentId: null })
      }
    },
    meta: { awaits: WRITE_AWAITS },
  })

  /** Saves what changed; `onSaved` runs once the server has it and the form is clean again. */
  const submit = (onSaved: () => void) =>
    form.handleSubmit((values) => {
      if (save.isPending) return
      save.mutate(
        { values, changed: new Set(Object.keys(dirtyFields)) },
        {
          onSuccess: () => {
            // `getValues()`, the input shape: resetting to the resolver's output (an ISO `dueAt`)
            // would leave those fields dirty and the leave guard blocking a cleanly saved pane.
            form.reset(form.getValues())
            onSaved()
          },
        },
      )
    })

  return { form, isDirty, save, submit }
}
