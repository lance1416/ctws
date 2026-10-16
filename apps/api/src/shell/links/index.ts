/** What modules may use of links: how they name their things, file them and read their edges. */
export { filing, projectOfSql, projectsOf } from './filing'
export { byTitle, wanted, type Linkable } from './linkable'
export { edgesFrom, putLinks } from './store'

// For the app, which builds the registry from every module's linkable.
export { linkRegistry } from './registry'
export { linkRoutes } from './routes'
