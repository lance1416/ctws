// The forms' schemas are the wire contracts, so they refuse exactly what the server would.
import { createTaskBody, projectId, taskFields, taskId } from '@ctws/contracts'
import { z } from 'zod'

export const createTaskForm = createTaskBody
/** What the form holds (the schema's input) and what the resolver hands over (its output). */
export type CreateTaskForm = z.input<typeof createTaskBody>
export type CreateTaskValues = z.output<typeof createTaskBody>

/** A task's fields as the update contract takes them, and the project and parent it is moved to. */
export const detailTaskForm = z
  .object(taskFields)
  .partial()
  .extend({ projectId, parentId: taskId.nullable().optional() })
  .strict()
export type DetailTaskForm = z.input<typeof detailTaskForm>
export type DetailTaskValues = z.output<typeof detailTaskForm>

/** A task's own fields, read off the contract: what turns `dirtyFields` into a body. */
export const PATCH_KEYS = Object.keys(taskFields) as (keyof typeof taskFields)[]

/** The app's sentence for a title the schema refused, keyed on the issue code. */
export function titleProblem(code: string | undefined): string | null {
  if (code === undefined) return null
  if (code === 'too_big') return 'Title is too long'
  return 'Title is required'
}
