import type { ContactChannel, CreateContactBody, UpdateContactBody } from '@ctws/contracts'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { v7 as uuidv7 } from 'uuid'
import type { Queryable } from '../db/client'
import { LIKE_ESCAPE, likePattern } from '../db/like'
import { contactChannels, contactProjects, contacts, projects } from '../db/schema'
import { ProjectNotFoundError } from '../projects/errors'
import { visibleProjects } from '../projects/store'
import { ContactNotFoundError } from './errors'

/**
 * 联系人's storage. vCard's shape (RFC 6350), cut to what one person needs.
 *
 * Like the reading module it borrows exactly two things from the shell -- the workspace and
 * `visibleProjects` -- and nothing at all from the other two modules.
 */

export type ContactProject = { id: string; name: string }

export type ContactRow = {
  id: string
  name: string
  org: string | null
  note: string | null
  projects: ContactProject[]
  channels: ContactChannel[]
  createdAt: Date
  updatedAt: Date
}

/** THE TENANT CHOKEPOINT. Every read and write below goes through it. */
function visibleContacts(workspaceId: string) {
  return and(eq(contacts.workspaceId, workspaceId), isNull(contacts.deletedAt))
}

type Selected = typeof contacts.$inferSelect

/**
 * Attaches each person's projects and channels, in ONE query each for the whole page.
 *
 * Only projects the person can still SEE: projects are soft-deleted, so a row in the association
 * table can outlive the project it points at, and a name nobody can navigate to is worse than no
 * name. A query per contact would be the N+1 this codebase refuses everywhere else.
 */
async function hydrate(q: Queryable, rows: Selected[]): Promise<ContactRow[]> {
  const ids = rows.map((r) => r.id)
  const byContact = new Map<string, ContactProject[]>()
  const channelsOf = new Map<string, ContactChannel[]>()
  if (ids.length > 0) {
    const [linked, found] = await Promise.all([
      q
        .select({ contactId: contactProjects.contactId, id: projects.id, name: projects.name })
        .from(contactProjects)
        .innerJoin(projects, eq(projects.id, contactProjects.projectId))
        .where(and(inArray(contactProjects.contactId, ids), isNull(projects.deletedAt)))
        .orderBy(asc(projects.rank), asc(projects.id)),
      q
        .select()
        .from(contactChannels)
        .where(inArray(contactChannels.contactId, ids))
        .orderBy(asc(contactChannels.rank), asc(contactChannels.id)),
    ])
    for (const row of linked) {
      const list = byContact.get(row.contactId)
      const project = { id: row.id, name: row.name }
      if (list) list.push(project)
      else byContact.set(row.contactId, [project])
    }
    for (const c of found) {
      const channel: ContactChannel = {
        kind: c.kind as ContactChannel['kind'],
        value: c.value,
        label: c.label,
      }
      const list = channelsOf.get(c.contactId)
      if (list) list.push(channel)
      else channelsOf.set(c.contactId, [channel])
    }
  }
  return rows.map((contact) => ({
    id: contact.id,
    name: contact.name,
    org: contact.org,
    note: contact.note,
    projects: byContact.get(contact.id) ?? [],
    channels: channelsOf.get(contact.id) ?? [],
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  }))
}

async function assertProjects(
  q: Queryable,
  workspaceId: string,
  projectIds: readonly string[],
): Promise<void> {
  if (projectIds.length === 0) return
  const rows = await q
    .select({ id: projects.id })
    .from(projects)
    .where(and(visibleProjects(workspaceId), inArray(projects.id, [...projectIds])))
  // Every one of them, not just one: a request naming four projects of which one is another
  // workspace's must be refused whole.
  if (rows.length !== new Set(projectIds).size) throw new ProjectNotFoundError()
}

/** Replaces the whole set of a person's projects. Called inside the caller's transaction. */
async function putProjects(
  q: Queryable,
  contactId: string,
  projectIds: readonly string[],
): Promise<void> {
  await q.delete(contactProjects).where(eq(contactProjects.contactId, contactId))
  const unique = [...new Set(projectIds)]
  if (unique.length === 0) return
  await q.insert(contactProjects).values(unique.map((projectId) => ({ contactId, projectId })))
}

/** Replaces a contact's whole channel set. Called inside the caller's transaction. */
async function putChannels(
  q: Queryable,
  contactId: string,
  channels: readonly ContactChannel[],
): Promise<void> {
  await q.delete(contactChannels).where(eq(contactChannels.contactId, contactId))
  if (channels.length === 0) return
  await q.insert(contactChannels).values(
    channels.map((c, rank) => ({
      id: uuidv7(),
      contactId,
      kind: c.kind,
      value: c.value,
      label: c.label ?? null,
      rank,
    })),
  )
}

export async function listContacts(
  q: Queryable,
  workspaceId: string,
  opts: { projectId?: string; unfiled?: boolean } = {},
): Promise<ContactRow[]> {
  const rows = await q
    .select()
    .from(contacts)
    .where(
      and(
        visibleContacts(workspaceId),
        // Through the association table, and only VISIBLE projects: a link to a soft-deleted
        // project is a link to nothing, so it must not make a person count as filed either.
        opts.projectId
          ? sql`exists (
              select 1 from contact_projects cp
              join projects p on p.id = cp.project_id and p.deleted_at is null
              where cp.contact_id = contacts.id and cp.project_id = ${opts.projectId}
            )`
          : undefined,
        opts.unfiled
          ? sql`not exists (
              select 1 from contact_projects cp
              join projects p on p.id = cp.project_id and p.deleted_at is null
              where cp.contact_id = contacts.id
            )`
          : undefined,
      ),
    )
    // By name. A contact list is looked at to FIND someone, and alphabetical is where a person
    // expects to find them -- unlike the reading pile, where the newest thing is the point.
    .orderBy(asc(contacts.name), asc(contacts.id))
  return hydrate(q, rows)
}

export async function getContact(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<ContactRow> {
  const rows = await q
    .select()
    .from(contacts)
    .where(and(visibleContacts(workspaceId), eq(contacts.id, id)))
  if (rows.length === 0) throw new ContactNotFoundError()
  const [row] = await hydrate(q, rows)
  return row!
}

export async function createContact(
  q: Queryable,
  workspaceId: string,
  body: CreateContactBody,
): Promise<ContactRow> {
  await assertProjects(q, workspaceId, body.projectIds ?? [])
  const id = uuidv7()
  await q.insert(contacts).values({
    id,
    workspaceId,
    name: body.name,
    org: body.org ?? null,
    note: body.note ?? null,
  })
  await putProjects(q, id, body.projectIds ?? [])
  await putChannels(q, id, body.channels ?? [])
  return getContact(q, workspaceId, id)
}

export async function updateContact(
  q: Queryable,
  workspaceId: string,
  id: string,
  patch: UpdateContactBody,
): Promise<ContactRow> {
  // Reads first, so an id from another workspace is "not found" before anything is written.
  await getContact(q, workspaceId, id)
  if (patch.projectIds) await assertProjects(q, workspaceId, patch.projectIds)

  const { channels, projectIds, ...fields } = patch
  // An update of only the channels (or only the projects) must still touch the row, or
  // `updated_at` would say the contact has not changed when their phone number just did.
  await q
    .update(contacts)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(visibleContacts(workspaceId), eq(contacts.id, id)))
  if (projectIds) await putProjects(q, id, projectIds)
  if (channels) await putChannels(q, id, channels)
  return getContact(q, workspaceId, id)
}

export async function softDeleteContact(
  q: Queryable,
  workspaceId: string,
  id: string,
): Promise<void> {
  const deleted = await q
    .update(contacts)
    .set({ deletedAt: new Date() })
    .where(and(visibleContacts(workspaceId), eq(contacts.id, id)))
    .returning({ id: contacts.id })
  if (deleted.length === 0) throw new ContactNotFoundError()
}

/**
 * This module's half of federated search: the name, the organisation, and every address.
 *
 * Searching the addresses is the point as often as the name is -- 「那个 @example.com 的人叫什么
 * 来着」 is exactly the question a contact list answers.
 */
export async function searchContacts(
  q: Queryable,
  workspaceId: string,
  query: string,
  limit = 20,
): Promise<ContactRow[]> {
  const pattern = likePattern(query)
  const rows = await q
    .select()
    .from(contacts)
    .where(
      and(
        visibleContacts(workspaceId),
        sql`(
          contacts.name ilike ${pattern} escape ${LIKE_ESCAPE}
          or contacts.org ilike ${pattern} escape ${LIKE_ESCAPE}
          or exists (
            select 1 from contact_channels ch
            where ch.contact_id = contacts.id
              and ch.value ilike ${pattern} escape ${LIKE_ESCAPE}
          )
        )`,
      ),
    )
    .orderBy(asc(contacts.name), asc(contacts.id))
    .limit(limit)
  return hydrate(q, rows)
}
