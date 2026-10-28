import { fixedModule } from '../../shell/module'
import { personLinkable } from './linkable'
import { personRoutes } from './routes'
import { peopleWeekCounts } from './weekCounts'

export const peopleModule = fixedModule({
  id: 'people',
  routes: personRoutes,
  linkable: personLinkable,
  weekCounts: peopleWeekCounts,
})

export { assertPeopleVisible } from './queries'
export { personKeys } from './tables'
