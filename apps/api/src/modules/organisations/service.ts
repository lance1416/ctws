import {
  type CreateOrganisationBody,
  type OrganisationId,
  organisationId,
  type PersonId,
  type PersonRoleInput,
  roleId,
  type UpdateOrganisationBody,
} from '@ctws/contracts'
import { eq, sql } from 'drizzle-orm'
import type { Db, Tx } from '../../platform/db/client'
import { newId } from '../../platform/db/ids'
import { replaceRows } from '../../platform/db/replace'
import { type Actor, scoped, within } from '../../platform/db/scope'
import { eventLog } from '../../shell/events'
import { MergeIntoItself } from './errors'
import {
  assertOrganisationsVisible,
  getOrganisation,
  lockOrganisation,
  monthStart,
} from './queries'
import { type Organisation, organisations, personRoles } from './tables'

const subject = (id: OrganisationId) => ({ type: 'organisation' as const, id })

export async function createOrganisation(
  db: Db,
  ctx: Actor,
  body: CreateOrganisationBody,
): Promise<Organisation> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(organisations)
      .values({
        id: newId(organisationId),
        workspaceId: ctx.workspaceId,
        name: body.name,
        type: body.type ?? null,
        website: body.website ?? null,
        city: body.city ?? null,
        cityKey: body.cityKey ?? null,
        note: body.note ?? null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .returning()
    await eventLog(tx, ctx).append(subject(row!.id), 'created', { to: { name: row!.name } })
    return row!
  })
}

/** Patches the fields, one `field_changed` per field that changed; nothing changed logs nothing. */
export async function updateOrganisation(
  db: Db,
  ctx: Actor,
  id: OrganisationId,
  patch: UpdateOrganisationBody,
): Promise<Organisation> {
  return db.transaction(async (tx) => {
    const row = await lockOrganisation(tx, ctx.workspaceId, id)
    const log = eventLog(tx, ctx)
    const changed: Partial<Pick<Organisation, keyof UpdateOrganisationBody>> = {}
    for (const field of ['name', 'type', 'website', 'city', 'cityKey', 'note'] as const) {
      const next = patch[field]
      if (next !== undefined && next !== row[field]) {
        // Each field's own type is the row's; the loop cannot say so field by field.
        ;(changed as Record<string, unknown>)[field] = next
        await log.append(subject(id), 'field_changed', { field, from: row[field], to: next })
      }
    }
    if (Object.keys(changed).length === 0) return row
    const [updated] = await tx
      .update(organisations)
      .set({ ...changed, updatedAt: ctx.now })
      .where(eq(organisations.id, id))
      .returning()
    return updated!
  })
}

/** Deletes an organisation outright; the roles at it go with it (FR-035). */
export async function deleteOrganisation(db: Db, ctx: Actor, id: OrganisationId): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockOrganisation(tx, ctx.workspaceId, id)
    await tx.delete(organisations).where(eq(organisations.id, row.id))
    await tx.execute(
      sql`delete from events where object_type = 'organisation' and object_id = ${id}`,
    )
    await tx.execute(sql`
      delete from relations
      where (from_type = 'organisation' and from_id = ${id})
         or (to_type = 'organisation' and to_id = ${id})`)
    await tx.execute(
      sql`delete from resources where owner_type = 'organisation' and owner_id = ${id}`,
    )
  })
}

/**
 * Folds one organisation into another (FR-099): its roles, relations and resources move across,
 * and it is deleted. A role that would then repeat one at the target is kept too: two roles at the
 * same company are two roles.
 */
export async function mergeOrganisation(
  db: Db,
  ctx: Actor,
  id: OrganisationId,
  into: OrganisationId,
): Promise<Organisation> {
  if (id === into) throw new MergeIntoItself()
  return db.transaction(async (tx) => {
    const gone = await lockOrganisation(tx, ctx.workspaceId, id)
    const kept = await lockOrganisation(tx, ctx.workspaceId, into)
    await tx
      .update(personRoles)
      .set({ organisationId: kept.id })
      .where(eq(personRoles.organisationId, gone.id))
    await tx.execute(sql`
      update relations set from_id = ${kept.id}
      where from_type = 'organisation' and from_id = ${gone.id}`)
    await tx.execute(sql`
      update relations set to_id = ${kept.id}
      where to_type = 'organisation' and to_id = ${gone.id}`)
    await tx.execute(sql`
      update resources set owner_id = ${kept.id}
      where owner_type = 'organisation' and owner_id = ${gone.id}`)
    await tx.delete(organisations).where(eq(organisations.id, gone.id))
    await tx.execute(
      sql`delete from events where object_type = 'organisation' and object_id = ${gone.id}`,
    )
    await eventLog(tx, ctx).append(subject(kept.id), 'merged', { from: { name: gone.name } })
    return getOrganisation(tx, ctx.workspaceId, kept.id)
  })
}

/** Forgets a person's roles, when the person goes. For the people module. */
export async function removeRolesOf(tx: Tx, ctx: Actor, personId: PersonId): Promise<void> {
  await tx
    .delete(personRoles)
    .where(within(scoped(personRoles, ctx.workspaceId), eq(personRoles.personId, personId)))
}

/** Replaces a person's roles as a set, in the given order. For the people module. */
export async function putRoles(
  tx: Tx,
  ctx: Actor,
  personId: PersonId,
  roles: readonly PersonRoleInput[],
): Promise<void> {
  await assertOrganisationsVisible(
    tx,
    ctx.workspaceId,
    roles.map((r) => r.organisationId),
  )
  await replaceRows(
    tx,
    personRoles,
    within(scoped(personRoles, ctx.workspaceId), eq(personRoles.personId, personId)),
    roles.map((r, rank) => ({
      id: newId(roleId),
      workspaceId: ctx.workspaceId,
      personId,
      organisationId: r.organisationId,
      title: r.title ?? null,
      fromMonth: monthStart(r.from),
      toMonth: monthStart(r.to),
      rank,
    })),
  )
}
