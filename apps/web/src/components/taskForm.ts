/**
 * The two editing surfaces' FORM SCHEMAS -- which are the wire contracts themselves, not a second
 * copy of them.
 *
 * `@ctws/contracts` already owns what a task may be: `createTaskBody` trims and bounds the title,
 * shapes a calendar day, demands an offset-bearing instant, and is `.strict()`. The forms used to
 * carry a hand-written rule beside it (`if (!title.trim()) …`), which is one more place for the two
 * to disagree -- and the disagreement would show up as a 400 from the server rather than as a word
 * in the form. Handing the SAME schema to `zodResolver` removes that second place: widen or narrow
 * the contract and both forms follow on the next render, with no edit here.
 *
 * What stays ours is the WORDING. A resolver reports `too_small`; “Title is required” is a product
 * decision and no schema will make it. So the schema decides WHETHER, and `titleProblem` decides
 * WHAT IT SAYS -- keyed on the issue code the schema produced, so a new kind of refusal cannot
 * silently inherit the wrong sentence.
 */
import { createTaskBody, updateTaskBody, type UpdateTaskBody } from '@ctws/contracts'
import { z } from 'zod'

/**
 * The New task dialog's schema. The create contract unchanged: `manualProgress` is simply never in the
 * form's values, and `.strict()` is what guarantees a field added to the form without being added
 * to the contract fails loudly here instead of quietly on the server.
 */
export const createTaskForm = createTaskBody

/**
 * The INPUT type, not the output: `status` carries `.default('backlog')` and the title is trimmed
 * by a transform, so what the form holds and what the resolver hands to the submit handler are two
 * different types. React Hook Form holds the former.
 */
export type CreateTaskForm = z.input<typeof createTaskBody>
/** What the resolver produces once the schema has run: trimmed title, defaulted status. */
export type CreateTaskValues = z.output<typeof createTaskBody>

/**
 * The detail pane's schema: the UPDATE contract, which is `.partial()` and therefore already says
 * "a PATCH names only what changed". Every field of the pane's form is present in its values, so
 * the partiality does not relax the title -- `title` is still `min(1)` whenever it is there, and
 * the form always has it.
 */
export const updateTaskForm = updateTaskBody

/**
 * The detail pane's schema: the update contract PLUS the one thing the pane edits that a PATCH
 * cannot carry. `updateTaskBody` omits `projectId` on purpose -- moving a task across projects
 * cascades to its subtree and is the MOVE endpoint's job -- but the pane edits the project in the
 * same form and saves it with the same press, so the FORM has a field the BODY does not. Extending
 * the contract rather than restating it keeps that one difference visible and one line long.
 */
export const detailTaskForm = updateTaskBody.extend({ projectId: z.uuid() })
export type DetailTaskForm = z.input<typeof detailTaskForm>
export type DetailTaskValues = z.output<typeof detailTaskForm>

/**
 * The keys a PATCH may carry, read off the contract rather than listed again. This is what turns
 * `dirtyFields` into a request body: the pane used to compare six values against the task by hand,
 * field by field, and every field added to the form meant remembering to add a line there too.
 */
export const PATCH_KEYS = Object.keys(updateTaskBody.shape) as (keyof UpdateTaskBody)[]

/**
 * The app's own sentence for a title the SCHEMA refused, keyed on the issue code it refused with.
 * `undefined` in, `null` out: no refusal, nothing to say.
 */
export function titleProblem(code: string | undefined): string | null {
  if (code === undefined) return null
  if (code === 'too_big') return 'Title is too long'
  return 'Title is required'
}
