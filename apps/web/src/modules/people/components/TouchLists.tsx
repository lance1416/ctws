import type { PersonResponse } from '@ctws/contracts'
import { avatarInitials } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { nearDay, shortDay, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { Avatar } from '../../../platform/ui/Avatar'
import {
  InTouchIcon,
  KIND_ICON,
  OutOfTouchIcon,
  ReceivedIcon,
  SentIcon,
  type IconComponent,
} from '../../../platform/ui/icons'
import { useTimeZone } from '../../../shell/auth'
import type { InspectorList } from '../../../shell/contract'
import { ListHead, NarrowRow } from '../../../shell/inspector'
import { peopleQuery, touchQuery } from '../api'
import { sinceWords } from '../logic/since'

/** The People overview's blocks name their full lists by these (FR-011 rule 3). */
export const PEOPLE_LISTS = { inTouch: 'people-in-touch', quiet: 'people-quiet' } as const

/** How you were last in touch, as a tinted mark: a message either way, or a meeting. */
export const HOW: Record<
  'sent' | 'received' | 'meeting',
  { icon: IconComponent; tint: string; word: string }
> = {
  sent: { icon: SentIcon, tint: 'bg-communication-bg text-communication', word: 'Message sent' },
  received: {
    icon: ReceivedIcon,
    tint: 'bg-communication-bg text-communication',
    word: 'Message received',
  },
  meeting: { icon: KIND_ICON.meeting, tint: 'bg-meeting-bg text-meeting', word: 'Met' },
}

export function Mark({
  icon: Icon,
  tint,
  word,
}: {
  icon: IconComponent
  tint: string
  word: string
}) {
  return (
    <span title={word} className={`grid size-6 place-items-center rounded-control ${tint}`}>
      <Icon size={14} />
      <span className="sr-only">{word}</span>
    </span>
  )
}

/** Who you were in touch with lately, or not for a while: each with the person they are. */
export function useTouchRows(which: 'recent' | 'quiet') {
  const touch = useQuery(touchQuery())
  const people = useQuery(peopleQuery())
  const byId = new Map((people.data ?? []).map((p) => [p.id as string, p]))
  const rows = (touch.data?.[which] ?? []).flatMap((t) => {
    const person: PersonResponse | undefined = byId.get(t.personId)
    return person ? [{ ...t, person }] : []
  })
  return { rows, settled: touch.isSuccess && people.isSuccess }
}

/** The day a touch was, as a row says it: a near day by name, else the date. */
export function useTouchDay() {
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  return {
    near: (at: string) => {
      const day = ymd(new Date(at), timeZone)
      return nearDay(day, today) ?? shortDay(day, today)
    },
    since: (at: string) => sinceWords(ymd(new Date(at), timeZone), today),
  }
}

function InTouchList() {
  const { rows } = useTouchRows('recent')
  const day = useTouchDay()
  return (
    <>
      <ListHead
        badge={{ icon: InTouchIcon, tint: 'bg-hover text-muted' }}
        title="Recently in touch"
        count={rows.length}
      />
      <ul className="flex flex-col px-4 py-3">
        {rows.map((t) => (
          <NarrowRow
            key={t.personId}
            mark={<Avatar initials={avatarInitials(t.person)} />}
            thing={{ type: 'person', id: t.personId }}
            to={`/people/${t.personId}`}
            title={t.person.name}
            fact={
              <span className="flex items-center gap-2">
                <Mark {...HOW[t.kind]} />
                <span className="font-mono">{day.near(t.at)}</span>
              </span>
            }
          />
        ))}
      </ul>
    </>
  )
}

function QuietList() {
  const { rows } = useTouchRows('quiet')
  const day = useTouchDay()
  return (
    <>
      <ListHead
        badge={{ icon: OutOfTouchIcon, tint: 'bg-hover text-muted' }}
        title="Not in touch for a while"
        count={rows.length}
      />
      <ul className="flex flex-col px-4 py-3">
        {rows.map((t) => (
          <NarrowRow
            key={t.personId}
            mark={<Avatar initials={avatarInitials(t.person)} />}
            thing={{ type: 'person', id: t.personId }}
            to={`/people/${t.personId}`}
            title={t.person.name}
            fact={day.since(t.at)}
          />
        ))}
      </ul>
    </>
  )
}

/** The People overview's full lists, for the inspector. */
export const peopleLists: InspectorList[] = [
  { name: PEOPLE_LISTS.inTouch, label: 'People', icon: InTouchIcon, Body: InTouchList },
  { name: PEOPLE_LISTS.quiet, label: 'People', icon: OutOfTouchIcon, Body: QuietList },
]
