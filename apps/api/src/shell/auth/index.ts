/** What modules may use of auth: who a request acts for, and the key their rows hang off. */
export { actorOf, currentUser } from './authenticated'
export { workspaceKeys } from './tables'

// For the app, which mounts the routes and guards the rest.
export { authenticated } from './authenticated'
export { SESSION_COOKIE } from './cookie'
export { publicAuthRoutes, sessionRoutes } from './routes'
export { warmDummyHash } from './service'
