/**
 * What modules may use of relations: keeping the mentions in a text field in step with it, and
 * what many of their things are related to, of one kind.
 */
export { relatedAmong } from './read'
export { syncMentions } from './store'

// For the app.
export { relationRoutes } from './routes'
export { mentionSource, relatedStageChanges } from './timeline'
