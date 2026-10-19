/** What modules may use of the registry of things: how they name their own for the shell. */
export { wanted, type Linkable } from './linkable'

// For the app, which builds the registry from every module's linkable.
export { linkRegistry, type LinkRegistry } from './registry'
export { linkRoutes } from './routes'
