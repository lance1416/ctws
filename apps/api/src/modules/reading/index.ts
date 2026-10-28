import type { ModuleDefinition } from '../../shell/module'
import { readingConfig } from './config'
import { readingLinkable } from './linkable'
import { readingRoutes } from './routes'
import { unfurl, type Unfurl } from './unfurl/unfurl'
import { readingWeekCounts } from './weekCounts'

/** Reading's one outside part is the fetch that reads a pasted link's own title. */
export const readingModule: ModuleDefinition<{ unfurl: Unfurl }> = {
  build: (env, deps) => ({
    id: 'reading',
    routes: readingRoutes({
      unfurl: deps.unfurl ?? unfurl,
      enabled: readingConfig(env).unfurl,
    }),
    linkable: readingLinkable,
    weekCounts: readingWeekCounts,
  }),
}
