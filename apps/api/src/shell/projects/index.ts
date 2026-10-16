/** What modules may use of projects. The table stays inside: a module reads it through these. */
export {
  assertProjectsVisible,
  getProject,
  inLiveProject,
  projectNameOf,
  projectScope,
  unarchivedProjects,
} from './queries'
export { projectKeys } from './tables'

// For the app.
export { projectLinkable } from './linkable'
export { projectRoutes } from './routes'
