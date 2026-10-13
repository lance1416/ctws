import type { ApiModule } from '../../shell/module'
import { readingLinkable } from './linkable'
import { readingRoutes } from './routes'
import type { ReadingDeps } from './service'

export function readingModule(deps: ReadingDeps): ApiModule {
  return { id: 'reading', routes: readingRoutes(deps), linkable: readingLinkable }
}

export { unfurl, type Unfurl } from './unfurl/unfurl'
