import { api, type ObjectType, type TimelineEntry } from '@ctws/contracts'
import { linkWords } from '@ctws/core'
import { queryOptions, useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { call } from '../../platform/http/api'
import { monthDay, ymd } from '../../platform/time/dates'
import { BlockFailed } from '../../platform/ui/Block'
import { KIND_ICON } from '../../platform/ui/icons'
import { useTimeZone } from '../auth'
import type { RelationContribution } from '../contract'
import { useRegistry } from '../registry'

type Thing = { type: ObjectType; id: string }

export const timelineKeys = {
  all: ['timeline'] as const,
  of: (t: Thing) => ['timeline', t.type, t.id] as const,
}

/** A thing's timeline, newest first: its first page, which is the most anyone reads here. */
const timelineQuery = (thing: Thing) =>
  queryOptions({
    queryKey: timelineKeys.of(thing),
    queryFn: async ({ signal }) =>
      (await call(api.timeline.of, { query: { type: thing.type, id: thing.id } }, { signal }))
        .entries,
  })

/**
 * A THING'S TIMELINE (FR-045, artboard 8): what happened to it and what was said, held or written
 * about it, newest first, one line each: the day, a mark for what kind of line it is, and the
 * line. A change is said by the module that owns the thing; the rest the shell says alike for
 * every kind.
 */
export function Timeline({ of }: { of: Thing }) {
  const entries = useQuery(timelineQuery(of))
  const timeZone = useTimeZone()
  const describeChange = useRegistry().relationFor(of.type).describeChange
  return (
    <section aria-labelledby="timeline-head" className="flex flex-col gap-2">
      <h3 id="timeline-head" className="text-ui font-medium text-ink">
        Timeline
      </h3>
      {entries.isError ? (
        <BlockFailed what="timeline" onRetry={() => void entries.refetch()} />
      ) : (
        <ol className="flex flex-col gap-1.5">
          {(entries.data ?? []).map((entry, i) => {
            const line = lineOf(entry, describeChange, timeZone)
            if (!line) return null
            return (
              <li
                key={i}
                data-timeline-entry={entry.kind}
                className="grid grid-cols-[52px_16px_minmax(0,1fr)] items-start gap-x-2.5 text-ui"
              >
                <time
                  dateTime={entry.at}
                  className="pt-px font-mono text-meta text-muted tabular-nums"
                >
                  {monthDay(ymd(new Date(entry.at), timeZone))}
                </time>
                <span aria-hidden="true" className="flex pt-0.5 text-muted">
                  {line.mark}
                </span>
                <span className="min-w-0 text-ink">{line.text}</span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/** A mention as notes store it, `[@Mira Chen](ctws://person/…)`: its name is what is shown. */
const MENTION = /\[@([^\]\n]+)\]\(ctws:\/\/[^)\s]*\)/g

/** What one entry says: a change in its module's words, the rest in the shell's. */
function lineOf(
  entry: TimelineEntry,
  describeChange: RelationContribution['describeChange'],
  timeZone: string,
): { mark: ReactNode; text: string } | null {
  switch (entry.kind) {
    case 'change':
      return describeChange?.(entry.event, timeZone) ?? null
    case 'message': {
      const Icon = KIND_ICON.communication
      const what = entry.message.subject ?? linkWords(entry.message.excerpt ?? '')
      return {
        mark: <Icon size={16} />,
        text: `${entry.message.direction === 'received' ? 'Received' : 'Sent'}: ${what}`,
      }
    }
    case 'meeting': {
      const Icon = KIND_ICON.meeting
      return { mark: <Icon size={16} />, text: entry.meeting.title }
    }
    case 'note': {
      const Icon = KIND_ICON.note
      return {
        mark: <Icon size={16} />,
        text: entry.note.title ?? linkWords(entry.note.excerpt),
      }
    }
    case 'mention': {
      // Where it was written, by that kind's icon; the name said plainly, not as typed (M-06).
      const Icon = KIND_ICON[entry.from.type]
      const said = linkWords(entry.excerpt.replace(MENTION, '$1'))
      return { mark: <Icon size={16} />, text: `Mentioned in “${entry.from.title}”: ${said}` }
    }
  }
}
