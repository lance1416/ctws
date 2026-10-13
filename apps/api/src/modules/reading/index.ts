import type { ApiModule } from '../../shell/module'
import { readingLinkable } from './linkable'
import { readingRoutes, type ReadingDeps } from './routes'

export function readingModule(deps: ReadingDeps): ApiModule {
  return { id: 'reading', routes: readingRoutes(deps), linkable: readingLinkable }
}

export { unfurl, type Unfurl } from './unfurl'
