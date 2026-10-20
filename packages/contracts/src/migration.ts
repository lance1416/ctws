import { z } from 'zod'
import { instant } from './common'
import { objectId } from './id'
import { objectType } from './object'

/**
 * The migration report (FR-099): the places where the move to the new layout made a guess for
 * you, to look at once and mark Done.
 */
const MIGRATION_SECTIONS = [
  'names',
  'organisationsToMerge',
  'parentsStatus',
  'peopleWithoutCity',
  'rolesWithoutCompany',
  'plannedDatesMoved',
  'projectColours',
  'citiesByName',
] as const

/** One organisation in a group that may be the same one. */
const mergeCandidate = z.object({ id: objectId, name: z.string(), people: z.number().int() })

/** One guess: what it was about, what was read, what was made of it, and why it is listed. */
const migrationItem = z.object({
  key: z.string(),
  section: z.enum(MIGRATION_SECTIONS),
  type: objectType.nullable(),
  id: objectId.nullable(),
  title: z.string(),
  was: z.string().nullable(),
  now: z.string().nullable(),
  why: z.string().nullable(),
  /** Needs a look: listed by default; the rest show under "Show all". */
  attention: z.boolean(),
  checked: z.boolean(),
  /** For a group of organisations that may be one. */
  group: z.array(mergeCandidate).optional(),
})
export type MigrationItem = z.infer<typeof migrationItem>

const counts = z.record(z.string(), z.number().int())

export const migrationReportResponse = z.object({
  ranAt: instant,
  backupRef: z.object({ name: z.string(), bytes: z.number().int() }),
  /** Live rows before, rows after, and what was moved where ("Everything else"). */
  counts: z.object({ before: counts, after: counts, moved: counts }),
  items: z.array(migrationItem),
  /** How many items still need a look. */
  pending: z.number().int(),
  doneAt: instant.nullable(),
})
export type MigrationReportResponse = z.infer<typeof migrationReportResponse>

export const migrationItemParams = z.object({ key: z.string().min(1).max(200) }).strict()
export const checkMigrationItemBody = z.object({ checked: z.boolean() }).strict()
