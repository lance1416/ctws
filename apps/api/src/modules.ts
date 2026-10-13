import { meetingsModule } from './modules/meetings'
import { peopleModule } from './modules/people'
import { readingModule, type Unfurl } from './modules/reading'
import { tasksModule } from './modules/tasks'
import type { ApiModule } from './shell/module'

/** In object-page order: an object page groups linked things in this order. */
export function apiModules(deps: { unfurl: Unfurl; unfurlEnabled: boolean }): ApiModule[] {
  return [
    tasksModule,
    meetingsModule,
    peopleModule,
    readingModule({ unfurl: deps.unfurl, enabled: deps.unfurlEnabled }),
  ]
}
