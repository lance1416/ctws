import { api, type ObjectType, type TimelineEntry, type TimelineKind } from '@ctws/contracts'
import { linkWords } from '@ctws/core'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useContext, useId, useState, type ReactNode } from 'react'
import { ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { NewContext } from '../creates'
import { call } from '../../platform/http/api'
import { monthDay, monthTitle, ymd } from '../../platform/time/dates'
import { BlockFailed } from '../../platform/ui/Block'
import { tabKeys } from '../../platform/ui/choiceKeys'
import {
  DoneIcon,
  DurationIcon,
  FileIcon,
  KIND_ICON,
  LinkIcon,
  NewIcon,
  ReceivedIcon,
  SentIcon,
} from '../../platform/ui/icons'
import { KIND_TEXT, KIND_TINT } from '../../platform/ui/kinds'
import { useTimeZone } from '../auth'
import type { RelationContribution } from '../contract'
import { useRegistry } from '../registry'

type Thing = { type: ObjectType; id: string }

/** What the timeline's tabs narrow it to (FR-065): every kind, or one. */
/** Months a full timeline shows at first, and adds a press at a time. */
const MONTHS_AT_ONCE = 3

const FILTERS = [
  { id: 'all', label: 'All', kinds: undefined },
  { id: 'message', label: 'Messages', kinds: ['message'] },
  { id: 'meeting', label: 'Meetings', kinds: ['meeting'] },
  { id: 'change', label: 'Changes', kinds: ['change'] },
] as const satisfies readonly {
  id: string
  label: string
  kinds: readonly TimelineKind[] | undefined
}[]
type Filter = (typeof FILTERS)[number]

export const timelineKeys = {
  all: ['timeline'] as const,
  of: (t: Thing, kinds = 'all') => ['timeline', t.type, t.id, kinds] as const,
}

/** A thing's timeline, newest first: its first page, which is the most anyone reads here. */
const timelineQuery = (thing: Thing, filter: Filter) =>
  queryOptions({
    queryKey: timelineKeys.of(thing, filter.id),
    queryFn: async ({ signal }) =>
      (
        await call(
          api.timeline.of,
          {
            query: {
              type: thing.type,
              id: thing.id,
              ...(filter.kinds ? { kinds: filter.kinds.join(',') } : {}),
            },
          },
          { signal },
        )
      ).entries,
  })

/**
 * A THING'S TIMELINE (FR-045, artboards 8 and 14): what happened to it and what was said, held or
 * written about it, newest first: the day, a mark for what kind of line it is, and the line; a
 * message with whom and what it said, a meeting how long and with whom. A change is said by the
 * module that owns the thing; the rest the shell says alike for every kind. With `filters`, a
 * page's timeline is narrowed to one kind by its tabs (FR-065).
 */
export function Timeline({
  of,
  filters = false,
  logs = false,
  last,
  everything,
}: {
  of: Thing
  filters?: boolean
  /** Its head's + logs a message with the thing (FR-061, FR-070), where a module can log one. */
  logs?: boolean
  /** Only the latest this many, as a narrow page shows it (artboard 33). */
  last?: number
  /** The line under them that opens the whole of it: "Everything with Mira". */
  everything?: { label: string; to: string }
}) {
  const openNew = useContext(NewContext)
  const log = useRegistry().creates.find((c) => c.kind === 'communication')
  const [filter, setFilter] = useState<Filter>(FILTERS[0])
  const shown = useId()
  const entries = useQuery(timelineQuery(of, filter))
  const timeZone = useTimeZone()
  const describeChange = useRegistry().relationFor(of.type).describeChange
  // The last three months first, by month; the rest a press away (FR-015 "时间线", U-17).
  const [months, setMonths] = useState(MONTHS_AT_ONCE)
  const all = last ? (entries.data ?? []).slice(0, last) : (entries.data ?? [])
  const monthOf = (entry: TimelineEntry) => ymd(new Date(entry.at), timeZone).slice(0, 7)
  const kept = [...new Set(all.map(monthOf))].slice(0, last ? undefined : months)
  const sections = kept.map((month) => ({
    month,
    title: monthTitle(month),
    entries: all.filter((e) => monthOf(e) === month),
  }))
  const hidden = all.length - sections.reduce((n, s) => n + s.entries.length, 0)
  // Nothing at all to show: no head over an empty list (N-06). A tab with nothing keeps its head,
  // so the other tabs stay in reach.
  if (filter.id === 'all' && entries.isSuccess && entries.data.length === 0 && !logs) return null
  return (
    <section aria-labelledby="timeline-head" className="flex flex-col gap-2">
      {/* A narrow page's block names it already (artboard 33). */}
      <div
        className={`flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1 ${last ? 'sr-only' : ''}`}
      >
        <h3 id="timeline-head" className="text-ui font-medium text-ink">
          Timeline
        </h3>
        {logs && log && (
          <button
            type="button"
            onClick={() => openNew(log)}
            aria-label="Log a message"
            title="Log a message"
            className={`${ICON_BUTTON} order-last ml-auto`}
          >
            <NewIcon size={16} aria-hidden="true" />
          </button>
        )}
        {filters && (
          // Views of the entries below: tabs, one Tab stop, the arrows switching (DES-001 section 4).
          <div
            role="tablist"
            aria-label="Show"
            onKeyDown={tabKeys}
            className="flex flex-wrap gap-0.5"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter.id === f.id}
                aria-controls={shown}
                tabIndex={filter.id === f.id ? 0 : -1}
                onClick={() => setFilter(f)}
                className="inline-flex h-7 items-center gap-1.5 rounded-control px-2.5 text-meta font-medium text-muted hover:bg-hover hover:text-ink aria-selected:bg-select aria-selected:text-ink"
              >
                {f.id !== 'all' && f.id !== 'change' && <FilterIcon kind={f.id} />}
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* What the tabs show: Tab goes from the chosen tab to here (DES-001 section 4). */}
      <div
        id={shown}
        {...(filters
          ? { role: 'tabpanel', tabIndex: 0, 'aria-label': `${filter.label} in the timeline` }
          : {})}
      >
        {entries.isError ? (
          <BlockFailed what="timeline" onRetry={() => void entries.refetch()} />
        ) : (
          <>
            {sections.map((section) => (
              <section
                key={section.month}
                aria-label={section.title}
                className="flex flex-col gap-3"
              >
                {/* By month on a full page (FR-015 "时间线"); a narrow page's five need no head. */}
                {!last && (
                  <h4 className="text-meta font-medium tracking-[0.06em] text-subtle uppercase">
                    {section.title}
                  </h4>
                )}
                <ol className="flex flex-col gap-3 [&>li:last-of-type>.thread]:hidden">
                  {section.entries.map((entry, i) => {
                    const line = lineOf(entry, describeChange, timeZone)
                    if (!line) return null
                    return (
                      <li
                        key={`${entry.at}-${i}`}
                        data-timeline-entry={entry.kind}
                        className="relative grid grid-cols-[52px_24px_minmax(0,1fr)] items-start gap-x-2.5 text-ui"
                      >
                        {/* The thread from one mark to the next (artboard 14); the last has none. */}
                        <span
                          aria-hidden="true"
                          className="thread absolute top-7 -bottom-2.5 left-[calc(52px+0.625rem+11.5px)] w-px bg-line"
                        />
                        <time
                          dateTime={entry.at}
                          className="pt-1 font-mono text-meta text-muted tabular-nums"
                        >
                          {monthDay(ymd(new Date(entry.at), timeZone))}
                        </time>
                        <span
                          aria-hidden="true"
                          className={`inline-grid size-6 place-items-center rounded-control ${line.tint ?? 'text-muted'}`}
                        >
                          {line.mark}
                        </span>
                        <div className="flex min-w-0 flex-col gap-1 pt-0.5">
                          <span className="min-w-0 text-ink">{line.text}</span>
                          {line.more}
                        </div>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setMonths(months + MONTHS_AT_ONCE)}
                className="self-start pl-[calc(52px+24px+1.25rem)] text-meta text-muted hover:text-ink"
              >
                Earlier months ({hidden})
              </button>
            )}
          </>
        )}
      </div>
      {everything && (
        <Link
          to={everything.to}
          className="pl-[calc(52px+24px+1.25rem)] text-meta text-muted hover:text-ink"
        >
          {everything.label}
        </Link>
      )}
    </section>
  )
}

function FilterIcon({ kind }: { kind: 'message' | 'meeting' }) {
  const Icon = KIND_ICON[kind === 'message' ? 'communication' : 'meeting']
  return (
    <Icon
      size={14}
      aria-hidden="true"
      className={KIND_TEXT[kind === 'message' ? 'communication' : 'meeting']}
    />
  )
}

/** "1h 30m", "45m": how long a meeting ran. */
const lasted = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "harbour-lane.example/letter.pdf" from an attached link: its host and the last of its path. */
const attachmentWords = (url: string) => {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : u.host
  } catch {
    return url
  }
}

/** A link whose path ends in a file's name (`letter.pdf`) is a file, and wears a file's icon. */
const isFile = (url: string) => {
  try {
    return /\.[a-z0-9]{2,5}$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/** An attached link, drawn only for http(s): anything else is shown as its words. */
const linkable = (url: string) => /^https?:\/\//i.test(url)

/** How a message went, by its channel: "Email", "Call". */
const CHANNEL_WORDS: Record<string, string> = {
  email: 'Email',
  call: 'Call',
  message: 'Message',
  in_person: 'In person',
  other: 'Other',
}

/** A mention as notes store it, `[@Mira Chen](ctws://person/…)`: its name is what is shown. */
const MENTION = /\[@([^\]\n]+)\]\(ctws:\/\/[^)\s]*\)/g

/** A note's first line as words: no heading or list marks, links by their words. */
const firstLine = (markdown: string) =>
  linkWords(
    (markdown.split('\n').find((l) => l.trim()) ?? '')
      .replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)/, '')
      .trim(),
  )

/** One line: its mark (on `tint`, when it has one), what it says, and what follows under it. */
type Line = { mark: ReactNode; tint?: string; text: ReactNode; more?: ReactNode }

/** What one entry says: a change in its module's words, the rest in the shell's. */
function lineOf(
  entry: TimelineEntry,
  describeChange: RelationContribution['describeChange'],
  timeZone: string,
): Line | null {
  switch (entry.kind) {
    case 'change':
      return describeChange?.(entry.event, timeZone) ?? null
    case 'message': {
      const m = entry.message
      const Icon = m.direction === 'sent' ? SentIcon : ReceivedIcon
      const what = m.subject ?? linkWords(m.excerpt ?? '')
      const names = m.parties.map((p) => p.name).join(', ')
      return {
        mark: <Icon size={14} />,
        tint: 'bg-communication-bg text-communication',
        text: (
          <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <span className="min-w-0 font-medium">
              <span className="sr-only">{m.direction === 'sent' ? 'Sent: ' : 'Received: '}</span>
              {what}
            </span>
            {m.repliedAt && (
              <span className="inline-flex h-5.5 shrink-0 items-center gap-1 rounded-control bg-go-bg px-2 text-meta text-go-t">
                <DoneIcon size={12} aria-hidden="true" />
                Replied {monthDay(ymd(new Date(m.repliedAt), timeZone))}
              </span>
            )}
          </span>
        ),
        more: (
          <>
            <span className="flex flex-wrap items-center gap-x-3 text-meta text-muted">
              <span>{CHANNEL_WORDS[m.channel] ?? m.channel}</span>
              {names && (
                <span>
                  {m.direction === 'sent' ? 'To' : 'From'} {names}
                </span>
              )}
            </span>
            {m.subject && m.excerpt && (
              <span className="line-clamp-3 text-muted">{linkWords(m.excerpt)}</span>
            )}
            {m.attachments.length > 0 && (
              <span className="flex flex-wrap gap-1.5">
                {m.attachments.map((url) =>
                  linkable(url) ? (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      title={url}
                      className="inline-flex h-6 max-w-64 items-center gap-1.5 rounded-control border border-line px-2 text-meta text-ink hover:bg-hover"
                    >
                      {isFile(url) ? (
                        <FileIcon size={12} aria-hidden="true" />
                      ) : (
                        <LinkIcon size={12} aria-hidden="true" />
                      )}
                      <span className="truncate">{attachmentWords(url)}</span>
                    </a>
                  ) : (
                    <span key={url} className="text-meta text-muted">
                      {url}
                    </span>
                  ),
                )}
              </span>
            )}
          </>
        ),
      }
    }
    case 'meeting': {
      const Icon = KIND_ICON.meeting
      const mt = entry.meeting
      return {
        mark: <Icon size={14} />,
        tint: `${KIND_TINT.meeting} ${KIND_TEXT.meeting}`,
        text: <span className="font-medium">{mt.title}</span>,
        more: (
          <span className="flex flex-wrap items-center gap-x-3 text-meta text-muted">
            <span className="inline-flex items-center gap-1">
              <DurationIcon size={12} aria-hidden="true" />
              {lasted(mt.durationMinutes)}
            </span>
            {mt.attendees.length > 0 && (
              <span>With {mt.attendees.map((a) => a.name).join(', ')}</span>
            )}
          </span>
        ),
      }
    }
    case 'note': {
      // What was written, by its name, not its markdown (I-01): its title, or its first line.
      const Icon = KIND_ICON.note
      const name = entry.note.title ?? firstLine(entry.note.excerpt)
      return {
        mark: <Icon size={16} />,
        text: 'Wrote notes',
        ...(name ? { more: <span className="text-muted">{name}</span> } : {}),
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
