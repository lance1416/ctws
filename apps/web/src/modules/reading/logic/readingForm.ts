import {
  personId,
  projectId,
  READING_KINDS,
  READING_STATUSES,
  type ReadingItemResponse,
  type UpdateReadingItemBody,
} from '@ctws/contracts'
import { z } from 'zod'

/**
 * The edit form's fields as typed, and the patch they make. The kind is not editable: a link
 * never becomes a book. A link's title can be cleared, and it goes back to showing its address;
 * a book without a title is not a book.
 */
export const readingForm = z
  .object({
    kind: z.enum(READING_KINDS),
    title: z.string(),
    url: z.string(),
    author: z.string(),
    status: z.enum(READING_STATUSES),
    planOn: z.string().nullable(),
    projectId: projectId.nullable(),
    recommendedBy: z.object({ id: personId, name: z.string() }).nullable(),
  })
  .refine((v) => v.kind === 'link' || v.title.trim() !== '', { path: ['title'] })
  .transform((v): UpdateReadingItemBody => ({
    title: v.title.trim() || null,
    ...(v.kind === 'link' && v.url.trim() !== '' ? { url: v.url.trim() } : {}),
    ...(v.kind === 'book' ? { author: v.author.trim() || null } : {}),
    status: v.status,
    planOn: v.planOn,
    projectId: v.projectId,
    recommendedById: v.recommendedBy?.id ?? null,
  }))
export type ReadingForm = z.input<typeof readingForm>

/** The form opened on `item`. */
export const readingDefaults = (item: ReadingItemResponse): ReadingForm => ({
  kind: item.kind,
  title: item.title ?? '',
  url: item.url ?? '',
  author: item.author ?? '',
  status: item.status,
  planOn: item.planOn,
  projectId: item.projectId,
  recommendedBy: item.recommendedBy,
})
