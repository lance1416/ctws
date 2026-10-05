import type { FastifyPluginAsync } from 'fastify'

/**
 * The flat paths the API answered on before the task module moved under `/api/v1/tasks/`.
 *
 * This app is deployed and in use: a bookmark, an open tab still running the previous bundle, or
 * a request already in flight when the container restarted must not meet a 404 because the code
 * was reorganised. So the old paths keep answering -- as 308 redirects, which preserve the method
 * and the body, and which `fetch` and Playwright's request context follow by default.
 *
 * `hide: true` keeps them out of the OpenAPI document: the document describes the API as it is
 * now, and listing each endpoint twice would make the namespace look optional.
 *
 * These are COMPATIBILITY, not contract. They may be deleted once nothing calls them.
 */
const MOVED: { from: string; to: string }[] = [
  { from: '/today', to: '/tasks/today' },
  { from: '/completed', to: '/tasks/completed' },
  { from: '/search', to: '/tasks/search' },
]

export const movedRoutes: FastifyPluginAsync = async (app) => {
  for (const { from, to } of MOVED) {
    app.get(from, { schema: { hide: true } }, async (req, reply) => {
      const query = req.raw.url?.includes('?') ? req.raw.url.slice(req.raw.url.indexOf('?')) : ''
      return reply.redirect(`/api/v1${to}${query}`, 308)
    })
  }

  // The one path whose SHAPE changed and not just its prefix: the project is now a filter on the
  // task collection, because the project belongs to the shell and the tasks under it do not.
  app.get<{ Params: { id: string } }>(
    '/projects/:id/tasks',
    { schema: { hide: true } },
    async (req, reply) =>
      reply.redirect(`/api/v1/tasks?projectId=${encodeURIComponent(req.params.id)}`, 308),
  )
}
