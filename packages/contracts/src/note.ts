import { z } from 'zod'
import { documentText, instant, patchOf, titleText } from './common'
import { noteId, objectId } from './id'
import { LIST_PAGE, pageInfo, pageQuery } from './page'

/**
 * A note (FR-050): Markdown that stands alone or hangs on another thing. A meeting's notes are
 * notes hung on the meeting; one hung on a single occurrence names it. The editor is the one the
 * app has today; folders and pinning come with the Notes batch (FR-103).
 */

/** What a note may hang on (FR-050): a meeting, a project, a person or an organisation. */
export const NOTE_ANCHOR_TYPES = ['meeting', 'project', 'person', 'organisation'] as const

/** What a note hangs on, and which occurrence when the thing is a meeting series. */
const anchor = z
  .object({
    type: z.enum(NOTE_ANCHOR_TYPES),
    id: objectId,
    /** A meeting occurrence's local time, `YYYY-MM-DDTHH:mm`, for a note on one occurrence. */
    occurrenceId: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullish(),
  })
  .strict()
  .refine((a) => !a.occurrenceId || a.type === 'meeting', {
    message: 'only a meeting has occurrences',
    path: ['occurrenceId'],
  })
export type NoteAnchor = z.infer<typeof anchor>

export const noteParams = z.object({ id: noteId }).strict()

const noteFields = {
  title: titleText.nullable(),
  body: documentText,
  anchor: anchor.nullable(),
}

export const createNoteBody = z.object(noteFields).partial().required({ body: true }).strict()
export type CreateNoteBody = z.infer<typeof createNoteBody>

export const updateNoteBody = patchOf(noteFields)
export type UpdateNoteBody = z.infer<typeof updateNoteBody>

export const noteResponse = z.object({
  id: noteId,
  title: z.string().nullable(),
  body: z.string(),
  anchor: z
    .object({
      type: z.enum(NOTE_ANCHOR_TYPES),
      id: objectId,
      occurrenceId: z.string().nullable(),
      /** The thing's name, when it can be seen. */
      title: z.string().nullable(),
    })
    .nullable(),
  /** Words in the body, for "1,850 words" (FR-069). */
  words: z.number().int().nonnegative(),
  /** The occurrence a meeting note is about, kept after the meeting is gone (FR-050). */
  heldAt: instant.nullable(),
  createdAt: instant,
  updatedAt: instant,
})
export type NoteResponse = z.infer<typeof noteResponse>

/** Every note, newest first; or those hung on one thing (`anchor=<type>:<id>`). */
export const noteListQuery = z
  .object({
    anchor: z
      .string()
      .regex(/^[a-z]+:[0-9a-fA-F-]{36}$/, 'expected <type>:<id>')
      .optional(),
    ...pageQuery(LIST_PAGE),
  })
  .strict()

export const notesResponse = z.object({ notes: z.array(noteResponse), page: pageInfo })
