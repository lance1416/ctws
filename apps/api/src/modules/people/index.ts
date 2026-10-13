import type { ApiModule } from '../../shell/module'
import { personLinkable } from './linkable'
import { personRoutes } from './routes'

export const peopleModule: ApiModule = {
  id: 'people',
  routes: personRoutes,
  linkable: personLinkable,
}

export { assertPeopleVisible, attendeesOf } from './queries'
