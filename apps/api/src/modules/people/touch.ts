import {
  IN_TOUCH_DAYS,
  QUIET_AFTER_DAYS,
  type LastExchange,
  type PersonId,
  type WorkspaceId,
} from '@ctws/contracts'
import { addDays } from '@ctws/core'
import type { Queryable } from '../../platform/db/client'
import { scoped } from '../../platform/db/scope'
import { localOf } from '../../platform/zone'
import { lastAbout, type LinkRegistry } from '../../shell/links'
import { people } from './tables'

type Touched = LastExchange & { personId: PersonId }

/**
 * Who you were in touch with lately and with whom it has been a while (FR-060), by the latest
 * exchange with each, a message or a meeting together, from whichever module keeps it. Days are
 * the account's. Someone never in touch is in neither list: there is no while to count.
 */
export async function peopleInTouch(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  now: Date,
  timezone: string,
): Promise<{ recent: Touched[]; quiet: Touched[] }> {
  const everyone = await q.select({ id: people.id }).from(people).where(scoped(people, workspaceId))
  const last = await lastAbout(
    registry,
    q,
    workspaceId,
    everyone.map((p) => p.id),
    now,
  )
  const today = localOf(now, timezone).slice(0, 10)
  const dayOf = (at: string) => localOf(new Date(at), timezone).slice(0, 10)
  const touched: Touched[] = everyone.flatMap((p) => {
    const l = last.get(p.id)
    return l ? [{ personId: p.id, ...l }] : []
  })
  const latestFirst = (a: Touched, b: Touched) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)
  return {
    recent: touched.filter((t) => dayOf(t.at) >= addDays(today, -IN_TOUCH_DAYS)).sort(latestFirst),
    quiet: touched
      .filter((t) => dayOf(t.at) <= addDays(today, -QUIET_AFTER_DAYS))
      .sort(latestFirst),
  }
}
