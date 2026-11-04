import type { CircleId, PersonId, TouchEvery, WorkspaceId } from '@ctws/contracts'
import { addDays, addMonths, avatarInitials, dayIn } from '@ctws/core'
import { and, asc, eq, inArray, isNotNull, ne, or } from 'drizzle-orm'
import type { Queryable } from '../../platform/db/client'
import { scoped, within } from '../../platform/db/scope'
import { lastAbout, type LinkRegistry } from '../../shell/links'
import { circles, people, personCircles } from './tables'

type Every = Exclude<TouchEvery, 'off'>

/** Shortest first: of several circles, the one wanting you in touch most often holds. */
const ORDER: readonly Every[] = ['1w', '2w', '1m', '3m', '6m', '1y']

/** The day a rhythm falls due after `day`. */
function after(day: string, every: Every): string {
  switch (every) {
    case '1w':
      return addDays(day, 7)
    case '2w':
      return addDays(day, 14)
    case '1m':
      return addMonths(day, 1)
    case '3m':
      return addMonths(day, 3)
    case '6m':
      return addMonths(day, 6)
    case '1y':
      return addMonths(day, 12)
  }
}

export type Touch = {
  every: Every | null
  from: { kind: 'person' } | { kind: 'circle'; circleId: CircleId; name: string } | null
  lastInTouch: string | null
  dueOn: string | null
}

type PersonFacts = {
  id: PersonId
  touchEvery: TouchEvery | null
  touchSetAt: Date | null
  touchLaterUntil: string | null
  touchLaterSince: Date | null
}
type CircleFacts = {
  id: CircleId
  name: string
  rank: number
  touchEvery: TouchEvery | null
  touchSetAt: Date | null
}

/**
 * What holds for one person: their own rhythm when they have one (`off` silencing every circle),
 * else the most frequent of their circles'. Due a rhythm after the last time in touch, or after
 * the rhythm was set for someone never in touch; a "Later" holds until that day while nobody has
 * been in touch since it was asked for.
 */
function touchFor(
  person: PersonFacts,
  theirCircles: readonly CircleFacts[],
  last: Date | null,
  zone: string,
): Touch {
  const lastInTouch = last ? dayIn(last, zone) : null
  let every: Every | null = null
  let from: Touch['from'] = null
  let setAt: Date | null = null
  if (person.touchEvery !== null) {
    if (person.touchEvery !== 'off') {
      every = person.touchEvery
      from = { kind: 'person' }
      setAt = person.touchSetAt
    }
  } else {
    const held = theirCircles
      .flatMap((c) =>
        c.touchEvery && c.touchEvery !== 'off' ? [{ ...c, every: c.touchEvery }] : [],
      )
      .sort((a, b) => ORDER.indexOf(a.every) - ORDER.indexOf(b.every) || a.rank - b.rank)[0]
    if (held) {
      every = held.every
      from = { kind: 'circle', circleId: held.id, name: held.name }
      setAt = held.touchSetAt
    }
  }
  if (every === null) return { every: null, from: null, lastInTouch, dueOn: null }
  const since = lastInTouch ?? (setAt ? dayIn(setAt, zone) : null)
  let dueOn = since ? after(since, every) : null
  const laterHolds =
    person.touchLaterUntil !== null &&
    (person.touchLaterSince?.getTime() ?? null) === (last?.getTime() ?? null)
  if (laterHolds && dueOn !== null && person.touchLaterUntil! > dueOn)
    dueOn = person.touchLaterUntil
  return { every, from, lastInTouch, dueOn }
}

/** The people's facts, and the circles each is in, for working out their rhythm. */
async function factsOf(q: Queryable, workspaceId: WorkspaceId, ids: readonly PersonId[] | null) {
  const persons = await q
    .select({
      id: people.id,
      name: people.name,
      givenName: people.givenName,
      familyName: people.familyName,
      avatarId: people.avatarId,
      touchEvery: people.touchEvery,
      touchSetAt: people.touchSetAt,
      touchLaterUntil: people.touchLaterUntil,
      touchLaterSince: people.touchLaterSince,
    })
    .from(people)
    .where(within(scoped(people, workspaceId), ids ? inArray(people.id, [...ids]) : undefined))
  const memberships = await q
    .select({
      personId: personCircles.personId,
      id: circles.id,
      name: circles.name,
      rank: circles.rank,
      touchEvery: circles.touchEvery,
      touchSetAt: circles.touchSetAt,
    })
    .from(personCircles)
    .innerJoin(circles, eq(circles.id, personCircles.circleId))
    .where(
      and(
        eq(circles.workspaceId, workspaceId),
        isNotNull(circles.touchEvery),
        ne(circles.touchEvery, 'off'),
      ),
    )
    .orderBy(asc(circles.rank))
  const circlesOf = new Map<string, CircleFacts[]>()
  for (const m of memberships) circlesOf.set(m.personId, [...(circlesOf.get(m.personId) ?? []), m])
  return { persons, circlesOf }
}

/** One person's rhythm and when they fall due. */
export async function touchOf(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  id: PersonId,
  now: Date,
  zone: string,
): Promise<Touch | null> {
  const { persons, circlesOf } = await factsOf(q, workspaceId, [id])
  const person = persons[0]
  if (!person) return null
  const last = (await lastAbout(registry, q, workspaceId, [id], now)).get(id)
  return touchFor(person, circlesOf.get(id) ?? [], last ? new Date(last.at) : null, zone)
}

/**
 * Everyone due a word by today, the longest overdue first. Only people a rhythm holds for are
 * asked about their last exchange: those whose own is set, or who are in a circle that has one.
 */
export async function dueForTouch(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  now: Date,
  zone: string,
) {
  const inACircle = q
    .select({ id: personCircles.personId })
    .from(personCircles)
    .innerJoin(circles, eq(circles.id, personCircles.circleId))
    .where(
      and(
        eq(circles.workspaceId, workspaceId),
        isNotNull(circles.touchEvery),
        ne(circles.touchEvery, 'off'),
      ),
    )
  const candidates = await q
    .select({ id: people.id })
    .from(people)
    .where(
      within(
        scoped(people, workspaceId),
        or(
          and(isNotNull(people.touchEvery), ne(people.touchEvery, 'off')),
          inArray(people.id, inACircle),
        ),
      ),
    )
  const ids = candidates.map((c) => c.id)
  if (ids.length === 0) return []
  const { persons, circlesOf } = await factsOf(q, workspaceId, ids)
  const last = await lastAbout(registry, q, workspaceId, ids, now)
  const today = dayIn(now, zone)
  return persons
    .flatMap((p) => {
      const l = last.get(p.id)
      const t = touchFor(p, circlesOf.get(p.id) ?? [], l ? new Date(l.at) : null, zone)
      if (t.dueOn === null || t.dueOn > today) return []
      return [
        {
          personId: p.id,
          name: p.name,
          initials: avatarInitials(p),
          avatarId: p.avatarId,
          lastInTouch: t.lastInTouch,
          dueOn: t.dueOn,
        },
      ]
    })
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : a.name.localeCompare(b.name)))
}

/** The last time in touch, as an instant, for "Later" to know whether it still holds. */
export async function lastInTouchAt(
  registry: LinkRegistry,
  q: Queryable,
  workspaceId: WorkspaceId,
  id: PersonId,
  now: Date,
): Promise<Date | null> {
  const last = (await lastAbout(registry, q, workspaceId, [id], now)).get(id)
  return last ? new Date(last.at) : null
}
