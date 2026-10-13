import {
  createProjectBody,
  projectColor,
  projectListItem,
  projectResponse,
  updateProjectBody,
} from '@ctws/contracts'
import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authedUser, requireUser } from '../auth/require-user'
import { sendProblem } from '../../platform/http/problem'
import { InboxNotDeletableError, ProjectNotFoundError } from './errors'
import {
  createProject,
  listProjects,
  softDeleteProject,
  updateProject,
  type Project,
  type ProjectListRow,
} from './store'

/**
 * Projects are a SHELL surface, not the task module's: the user's life is organised by line of
 * work, and a note about CTWS belongs to CTWS just as a task does. So these four endpoints keep
 * their flat `/api/v1/projects` paths while the task module moved under `/api/v1/tasks/`; a module
 * contributes counts and rows to a project, it does not own it.
 */

function toProjectResponse(p: Project): z.infer<typeof projectResponse> {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    // The column is plain text, so a row could in principle hold a slot name this build does not
    // know (an older app, a hand-edited row). Anything unrecognised is reported as "no colour",
    // which the client already draws as a neutral rail, rather than failing the response.
    color: projectColor.safeParse(p.color).data ?? null,
    isInbox: p.isInbox,
    rank: p.rank,
    archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
    createdAt: p.createdAt.toISOString(),
  }
}

function toProjectListItem(p: ProjectListRow): z.infer<typeof projectListItem> {
  return { ...toProjectResponse(p), openTasks: p.openTasks }
}

const idParams = z.object({ id: z.uuid() }).strict()
const listQuery = z.object({ archived: z.enum(['true', 'false']).optional() }).strict()

// Same mapping the task routes use for the same two errors, so a project failure reads the same
// whichever surface raised it.
function sendProjectProblem(reply: FastifyReply, error: unknown): void {
  if (error instanceof ProjectNotFoundError) return sendProblem(reply, 404, 'Not Found')
  if (error instanceof InboxNotDeletableError) {
    return sendProblem(reply, 409, 'Conflict', error.message)
  }
  throw error
}

export const projectRoutes: FastifyPluginAsync = async (app) => {
  const typed = app.withTypeProvider<ZodTypeProvider>()

  typed.get(
    '/projects',
    {
      preHandler: requireUser,
      schema: {
        querystring: listQuery,
        response: { 200: z.object({ projects: z.array(projectListItem) }).strict() },
      },
    },
    async (req) => {
      const rows = await listProjects(app.db, authedUser(req).workspaceId, {
        archived: req.query.archived === 'true',
      })
      return { projects: rows.map(toProjectListItem) }
    },
  )

  typed.post(
    '/projects',
    {
      preHandler: requireUser,
      schema: { body: createProjectBody, response: { 201: projectResponse } },
    },
    async (req, reply) => {
      const row = await createProject(app.db, authedUser(req).workspaceId, req.body)
      return reply.status(201).send(toProjectResponse(row))
    },
  )

  typed.patch(
    '/projects/:id',
    {
      preHandler: requireUser,
      schema: { params: idParams, body: updateProjectBody, response: { 200: projectResponse } },
    },
    async (req, reply) => {
      try {
        const row = await updateProject(
          app.db,
          authedUser(req).workspaceId,
          req.params.id,
          req.body,
        )
        return toProjectResponse(row)
      } catch (error) {
        return sendProjectProblem(reply, error)
      }
    },
  )

  typed.delete(
    '/projects/:id',
    { preHandler: requireUser, schema: { params: idParams } },
    async (req, reply) => {
      try {
        await softDeleteProject(app.db, authedUser(req).workspaceId, req.params.id)
        return reply.status(204).send()
      } catch (error) {
        return sendProjectProblem(reply, error)
      }
    },
  )
}
