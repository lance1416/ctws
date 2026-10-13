import type { ApiModule } from '../../shell/module'
import { meetingLinkable } from './linkable'
import { meetingRoutes } from './routes'

export const meetingsModule: ApiModule = {
  id: 'meetings',
  routes: meetingRoutes,
  linkable: meetingLinkable,
}
