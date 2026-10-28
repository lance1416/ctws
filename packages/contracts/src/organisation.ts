import { z } from 'zod'
import { instant, nameText, noteText, patchOf } from './common'
import { organisationId, personId, projectId } from './id'
import { LIST_PAGE, pageInfo, pageQuery } from './page'

/**
 * An organisation (FR-047): a company, a law firm, a school. People hold roles at organisations
 * (see `person.ts`); a task node may be related to one, which is how "Amazon" in a job hunt
 * knows which company it is.
 */

/** "Company", "Law firm", "School": free text, with the ones used so far offered as a list. */
const organisationType = z.string().trim().min(1).max(60)
const website = z
  .url()
  .max(2000)
  .refine((u) => /^https?:\/\//i.test(u), { message: 'expected an http(s) url' })
const city = z.string().trim().min(1).max(120)

export const organisationParams = z.object({ id: organisationId }).strict()

const organisationFields = {
  name: nameText,
  type: organisationType.nullable(),
  website: website.nullable(),
  city: city.nullable(),
  /** The city's key in the bundled table (`name|region|country`), to tell namesakes apart. */
  cityKey: z.string().max(240).nullable(),
  note: noteText.nullable(),
}

export type CreateOrganisationBody = z.infer<typeof createOrganisationBody>
export type UpdateOrganisationBody = z.infer<typeof updateOrganisationBody>

export const createOrganisationBody = z
  .object(organisationFields)
  .partial()
  .required({ name: true })
  .strict()
export const updateOrganisationBody = patchOf(organisationFields)

/** Someone who holds, or held, a role here, as the organisation's page lists them. */
const roleHolder = z.object({
  personId,
  name: z.string(),
  /** Their avatar's letters, as their own module works them out. */
  initials: z.string(),
  title: z.string().nullable(),
  /** `YYYY-MM`, or null when not known. */
  from: z.string().nullable(),
  to: z.string().nullable(),
})

/**
 * Where a thing stands in one project (FR-064, FR-065): the project, and the stage of the node
 * there that is related to it ("Shortlisted"), or null when that node has no stage.
 */
export const projectStanding = z.object({
  projectId,
  projectName: z.string(),
  stage: z.string().nullable(),
})
export type ProjectStanding = z.infer<typeof projectStanding>

export const organisationResponse = z.object({
  id: organisationId,
  name: z.string(),
  type: z.string().nullable(),
  website: z.string().nullable(),
  city: z.string().nullable(),
  cityKey: z.string().nullable(),
  note: z.string().nullable(),
  /** Current roles first, then past ones. */
  people: z.object({ now: z.array(roleHolder), before: z.array(roleHolder) }),
  /** How many people hold or held a role here, for "3 people lose a role there" (FR-035). */
  roleCount: z.number().int().nonnegative(),
  /** The projects it is in through a node related to it, the most recently staged first. */
  inProjects: z.array(projectStanding),
  createdAt: instant,
  updatedAt: instant,
})
export type OrganisationResponse = z.infer<typeof organisationResponse>

export const organisationListQuery = z
  .object({ type: organisationType.optional(), ...pageQuery(LIST_PAGE) })
  .strict()

export const organisationsResponse = z.object({
  organisations: z.array(organisationResponse),
  page: pageInfo,
})

/** The types used so far and how many organisations have each, for the filter row (FR-064). */
export const organisationTypesResponse = z.object({
  types: z.array(z.object({ type: z.string(), count: z.number().int().nonnegative() })),
})

/**
 * The organisations overview (FR-064): each type with its count, and how many there are. The
 * "In touch, last 30 days" table is `communication?view=overview`'s `inTouch`, which the page reads
 * beside this.
 */
export const organisationOverviewResponse = z.object({
  types: z.array(z.object({ type: z.string(), count: z.number().int().nonnegative() })),
  /** With no type at all; a page may show them as "Other". */
  untyped: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

/** Fold this organisation into another: its roles and relations move, and it goes (FR-099). */
export const mergeOrganisationBody = z.object({ into: organisationId }).strict()
