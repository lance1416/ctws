import {
  createProjectBody,
  projectColor,
  projectListItem,
  projectResponse,
  updateProjectBody,
} from '@ctws/contracts'
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { currentUser } from '../auth/authenticated'
import type { ProjectColumns } from '../module'
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

function toProjectListItem(row: ProjectListRow): z.infer<typeof projectListItem> {
  // Module columns fill the remaining fields; the response schema checks they are there.
  return { ...toProjectResponse(row.project), ...row.columns } as z.infer<typeof projectListItem>
}

const idParams = z.object({ id: z.uuid() }).strict()
const listQuery = z.object({ archived: z.enum(['true', 'false']).optional() }).strict()

export const projectRoutes: FastifyPluginAsyncZod<{ columns: ProjectColumns }> = async (
  app,
  { columns },
) => {
  app.get(
    '/projects',
    {
      schema: {
        querystring: listQuery,
        response: { 200: z.object({ projects: z.array(projectListItem) }).strict() },
      },
    },
    async (req) => {
      const rows = await listProjects(
        app.db,
        currentUser(req).workspaceId,
        { archived: req.query.archived === 'true' },
        columns,
      )
      return { projects: rows.map(toProjectListItem) }
    },
  )

  app.post(
    '/projects',
    {
      schema: { body: createProjectBody, response: { 201: projectResponse } },
    },
    async (req, reply) => {
      const row = await createProject(app.db, currentUser(req).workspaceId, req.body)
      return reply.status(201).send(toProjectResponse(row))
    },
  )

  app.patch(
    '/projects/:id',
    {
      schema: { params: idParams, body: updateProjectBody, response: { 200: projectResponse } },
    },
    async (req) => {
      const row = await updateProject(app.db, currentUser(req).workspaceId, req.params.id, req.body)
      return toProjectResponse(row)
    },
  )

  app.delete('/projects/:id', { schema: { params: idParams } }, async (req, reply) => {
    await softDeleteProject(app.db, currentUser(req).workspaceId, req.params.id)
    return reply.status(204).send()
  })
}
