import {
  contactListQuery,
  contactResponse,
  createContactBody,
  updateContactBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authedUser, requireUser } from '../auth/require-user'
import { sendProblem } from '../problem'
import { ProjectNotFoundError } from '../projects/errors'
import { ContactNotFoundError } from './errors'
import {
  createContact,
  listContacts,
  searchContacts,
  softDeleteContact,
  updateContact,
  type ContactRow,
} from './store'

/** THE THIRD MODULE's API, under its own namespace at `/api/v1/contacts/`. */

function toResponse(c: ContactRow): z.infer<typeof contactResponse> {
  return {
    id: c.id,
    name: c.name,
    org: c.org,
    note: c.note,
    projectId: c.projectId,
    projectName: c.projectName,
    channels: c.channels,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }
}

const idParams = z.object({ id: z.uuid() }).strict()
const listResponse = z.object({ contacts: z.array(contactResponse) }).strict()

function sendContactProblem(reply: FastifyReply, error: unknown): void {
  // A project from another workspace reads as "not found" too, never as a refusal that would
  // confirm the id exists.
  if (error instanceof ContactNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof ProjectNotFoundError) return sendProblem(reply, 404, 'Not Found')
  throw error
}

export const contactRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/',
    {
      preHandler: requireUser,
      schema: { querystring: contactListQuery, response: { 200: listResponse } },
    },
    async (req) => {
      const { projectId, unfiled } = req.query
      const rows = await listContacts(app.db, authedUser(req).workspaceId, {
        ...(projectId ? { projectId } : {}),
        ...(unfiled === 'true' ? { unfiled: true } : {}),
      })
      return { contacts: rows.map(toResponse) }
    },
  )

  typed.get(
    '/search',
    {
      preHandler: requireUser,
      schema: {
        querystring: z.object({ q: z.string().trim().min(1).max(200) }).strict(),
        response: { 200: listResponse },
      },
    },
    async (req) => {
      const rows = await searchContacts(app.db, authedUser(req).workspaceId, req.query.q)
      return { contacts: rows.map(toResponse) }
    },
  )

  typed.post(
    '/',
    {
      preHandler: requireUser,
      schema: { body: createContactBody, response: { 201: contactResponse } },
    },
    async (req, reply) => {
      try {
        // One transaction: a contact and its addresses are one thing, and a half-written person
        // with no way to reach them is worse than a refusal.
        const created = await app.db.transaction((tx) =>
          createContact(tx, authedUser(req).workspaceId, req.body),
        )
        return reply.code(201).send(toResponse(created))
      } catch (error) {
        return sendContactProblem(reply, error)
      }
    },
  )

  typed.patch(
    '/:id',
    {
      preHandler: requireUser,
      schema: { params: idParams, body: updateContactBody, response: { 200: contactResponse } },
    },
    async (req, reply) => {
      try {
        const updated = await app.db.transaction((tx) =>
          updateContact(tx, authedUser(req).workspaceId, req.params.id, req.body),
        )
        return toResponse(updated)
      } catch (error) {
        return sendContactProblem(reply, error)
      }
    },
  )

  typed.delete(
    '/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (req, reply) => {
      try {
        await softDeleteContact(app.db, authedUser(req).workspaceId, req.params.id)
        return reply.code(204).send()
      } catch (error) {
        return sendContactProblem(reply, error)
      }
    },
  )
}
