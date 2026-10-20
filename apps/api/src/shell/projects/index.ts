/** What modules may use of projects. The table stays inside: a module reads it through these. */
export {
  assertProjectsVisible,
  getProject,
  inLiveProject,
  projectNameSql,
  projectScope,
  unarchivedProjects,
} from './queries'
export { type ProjectGraves } from './service'
export { getStage, stagesOf } from './stages'
export { projectKeys, stageKeys } from './tables'

// For the app.
export { projectLinkable } from './linkable'
export { projectRoutes } from './routes'
