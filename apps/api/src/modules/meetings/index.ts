import { fixedModule } from '../../shell/module'
import { meetingLinkable } from './linkable'
import { meetingRoutes } from './routes'
import { meetingSource } from './timeline'

export const meetingsModule = fixedModule({
  id: 'meetings',
  routes: meetingRoutes,
  linkable: meetingLinkable,
  timelineSources: () => [meetingSource],
})
