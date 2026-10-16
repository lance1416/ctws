// The forms' schemas are the wire contracts, so they refuse exactly what the server would.
import { createTaskBody, projectId, updateTaskBody, type UpdateTaskBody } from '@ctws/contracts'
import { z } from 'zod'

export const createTaskForm = createTaskBody
/** What the form holds (the schema's input) and what the resolver hands over (its output). */
export type CreateTaskForm = z.input<typeof createTaskBody>
export type CreateTaskValues = z.output<typeof createTaskBody>

/** The update contract plus the project, which no PATCH carries: the move endpoint changes it. */
export const detailTaskForm = updateTaskBody.extend({ projectId })
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
