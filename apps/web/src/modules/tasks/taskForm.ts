/**
 * The task forms' schemas are the wire contracts themselves, so the forms refuse exactly what the
 * server would. What stays here is the wording (`titleProblem`).
 */
import { createTaskBody, updateTaskBody, type UpdateTaskBody } from '@ctws/contracts'
import { z } from 'zod'

/** The New task dialog's schema: the create contract, unchanged. */
export const createTaskForm = createTaskBody
/** What the form holds (the schema's input) and what the resolver hands over (its output). */
export type CreateTaskForm = z.input<typeof createTaskBody>
export type CreateTaskValues = z.output<typeof createTaskBody>

/**
 * The pane's schema: the update contract plus the project, which the pane edits in the same form
 * but which no PATCH carries -- moving a task is the move endpoint's job.
 */
export const detailTaskForm = updateTaskBody.extend({ projectId: z.uuid() })
export type DetailTaskForm = z.input<typeof detailTaskForm>
export type DetailTaskValues = z.output<typeof detailTaskForm>

/** The keys a PATCH may carry, read off the contract: what turns `dirtyFields` into a body. */
export const PATCH_KEYS = Object.keys(updateTaskBody.shape) as (keyof UpdateTaskBody)[]

/** The app's sentence for a title the schema refused, keyed on the issue code. */
export function titleProblem(code: string | undefined): string | null {
  if (code === undefined) return null
  if (code === 'too_big') return 'Title is too long'
  return 'Title is required'
}
