import { fixedModule } from '../../shell/module'
import { organisationLinkable } from './linkable'
import { organisationRoutes } from './routes'

export const organisationsModule = fixedModule({
  id: 'organisations',
  routes: organisationRoutes,
  linkable: organisationLinkable,
})

// For the people module: a person's roles are written and read through here.
export { monthOf, rolesOf } from './queries'
export { putRoles, removeRolesOf } from './service'
