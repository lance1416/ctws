import { fixedModule } from '../../shell/module'
import { meetingLinkable } from './linkable'
import { meetingRoutes } from './routes'

export const meetingsModule = fixedModule({
  id: 'meetings',
  routes: meetingRoutes,
  linkable: meetingLinkable,
})
