import { fixedModule } from '../../shell/module'
import { personLinkable } from './linkable'
import { personRoutes } from './routes'

export const peopleModule = fixedModule({
  id: 'people',
  routes: personRoutes,
  linkable: personLinkable,
})

export { assertPeopleVisible, attendeesOf } from './queries'
