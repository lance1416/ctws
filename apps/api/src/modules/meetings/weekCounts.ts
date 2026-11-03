import type { WeekCounts } from '../../shell/module'
import { occurrencesBegun } from './queries'

/** The review's "Meetings held": occurrences that began in the week, up to now. */
export const meetingWeekCounts: WeekCounts = async (q, workspaceId, window) => ({
  meetingsHeld: await occurrencesBegun(q, workspaceId, window),
})
