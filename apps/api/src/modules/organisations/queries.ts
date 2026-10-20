import { type OrganisationId, type PersonId, type WorkspaceId } from '@ctws/contracts'
import { asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Queryable, Tx } from '../../platform/db/client'
import { type Page, type PageAsked, pageOf, spanOf } from '../../platform/db/page'
import { rowsOf } from '../../platform/db/raw'
import { scoped, within } from '../../platform/db/scope'
import { textMatches } from '../../platform/db/sql'
import { groupBy } from '../../platform/values'
import { NotFound } from '../../platform/errors'
import { type Organisation, organisations, type PersonRole, personRoles } from './tables'

/** By name: a list of organisations is read to find one. */
export async function listOrganisations(
  q: Queryable,
  workspaceId: WorkspaceId,
  type: string | undefined,
  asked: PageAsked,
): Promise<Page<Organisation>> {
  const span = spanOf(asked)
  const rows = await q
    .select()
    .from(organisations)
    .where(
      within(
        scoped(organisations, workspaceId),
        type === undefined ? undefined : eq(organisations.type, type),
      ),
    )
    .orderBy(asc(organisations.name), asc(organisations.id))
    .limit(span.limit)
    .offset(span.offset)
  return pageOf(rows, asked)
}

export async function searchOrganisations(
  q: Queryable,
  workspaceId: WorkspaceId,
  query: string,
  asked: PageAsked,
): Promise<Page<Organisation>> {
  const span = spanOf(asked)
  const rows = await q
    .select()
    .from(organisations)
    .where(
      within(
        scoped(organisations, workspaceId),
        textMatches(['organisations.name', 'organisations.type'], query),
      ),
    )
    .orderBy(asc(organisations.name), asc(organisations.id))
    .limit(span.limit)
    .offset(span.offset)
  return pageOf(rows, asked)
}

/** One organisation in this workspace. Missing and foreign ids both read as not found. */
export async function getOrganisation(
  q: Queryable,
  workspaceId: WorkspaceId,
  id: OrganisationId,
): Promise<Organisation> {
  const [row] = await q
    .select()
    .from(organisations)
    .where(within(scoped(organisations, workspaceId), eq(organisations.id, id)))
  if (!row) throw new NotFound('Organisation')
  return row
}

/** `getOrganisation`, with the row locked for the rest of the transaction. */
export async function lockOrganisation(
  tx: Tx,
  workspaceId: WorkspaceId,
  id: OrganisationId,
): Promise<Organisation> {
  const [row] = await tx
    .select()
    .from(organisations)
    .where(within(scoped(organisations, workspaceId), eq(organisations.id, id)))
    .for('update')
  if (!row) throw new NotFound('Organisation')
  return row
}

const typeRow = z.object({ type: z.string(), count: z.number() })

/** How many organisations there are, typed or not. */
export async function countOrganisations(q: Queryable, workspaceId: WorkspaceId): Promise<number> {
  const result = await q.execute(
    sql`select count(*)::int as n from organisations where ${scoped(organisations, workspaceId)}`,
  )
  return (result.rows[0] as { n: number }).n
}

/** The types used so far, most used first, with how many organisations have each. */
export async function organisationTypes(
  q: Queryable,
  workspaceId: WorkspaceId,
): Promise<{ type: string; count: number }[]> {
  const result = await q.execute(sql`
    select type, count(*)::int as count from organisations
    where ${scoped(organisations, workspaceId)} and type is not null
    group by type order by count desc, type
  `)
  return rowsOf(result, typeRow)
}

/** The roles at one organisation, current ones first, then past ones, each by rank. */
export async function rolesAt(
  q: Queryable,
  workspaceId: WorkspaceId,
  organisationId: OrganisationId,
): Promise<PersonRole[]> {
  return q
    .select()
    .from(personRoles)
    .where(within(scoped(personRoles, workspaceId), eq(personRoles.organisationId, organisationId)))
    .orderBy(desc(isNull(personRoles.toMonth)), asc(personRoles.personId), asc(personRoles.rank))
}

/** Each person's roles, in their order, with the organisation's name; for the people module. */
export async function rolesOf(
  q: Queryable,
  workspaceId: WorkspaceId,
  personIds: readonly PersonId[],
): Promise<Map<PersonId, (PersonRole & { organisationName: string })[]>> {
  if (personIds.length === 0) return new Map()
  const rows = await q
    .select({ role: personRoles, organisationName: organisations.name })
    .from(personRoles)
    .innerJoin(organisations, eq(organisations.id, personRoles.organisationId))
    .where(within(scoped(personRoles, workspaceId), inArray(personRoles.personId, [...personIds])))
    .orderBy(asc(personRoles.rank), asc(personRoles.id))
  return groupBy(
    rows,
    (r) => r.role.personId,
    (r) => ({ ...r.role, organisationName: r.organisationName }),
  )
}

/** Every id names an organisation in this workspace, or none is used. */
export async function assertOrganisationsVisible(
  q: Queryable,
  workspaceId: WorkspaceId,
  ids: readonly OrganisationId[],
): Promise<void> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return
  const rows = await q
    .select({ id: organisations.id })
    .from(organisations)
    .where(within(scoped(organisations, workspaceId), inArray(organisations.id, unique)))
  if (rows.length !== unique.length) throw new NotFound('Organisation')
}

/** `YYYY-MM` as the first of that month, for the date column. */
export const monthStart = (month: string | null | undefined): string | null =>
  month ? `${month}-01` : null

/** The stored first-of-month back as `YYYY-MM`. */
export const monthOf = (day: string | null): string | null => (day ? day.slice(0, 7) : null)
