import { z } from 'zod'

/** Every kind of thing: what a link joins, a calendar shows and a search finds. */
export const OBJECT_TYPES = [
  'task',
  'reading',
  'person',
  'meeting',
  'project',
  'organisation',
  'communication',
  'note',
] as const
export const objectType = z.enum(OBJECT_TYPES)
export type ObjectType = z.infer<typeof objectType>
