/** What modules may use of the registry of things: how they name their own for the shell. */
export { countWhere, matching, wanted, type Linkable, type NextAt } from './linkable'
export { lastAbout, nextAbout, standingOf } from './next'

// For the app, which builds the registry from every module's linkable.
export { linkRegistry, type LinkRegistry } from './registry'
export { linkRoutes } from './routes'
