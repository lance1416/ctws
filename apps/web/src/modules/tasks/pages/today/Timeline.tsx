import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Link } from 'react-router-dom'
import { BlockFailed } from '../../../../platform/ui/Block'
import { BUTTON } from '../../../../platform/ui/buttonStyles'
import { FlagIcon, JoinIcon, KIND_ICON } from '../../../../platform/ui/icons'
import { LAYER } from '../../../../platform/ui/layers'
import { dayTimeline, lengthOf, type TimedItem } from './dayLine'

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
const pct = (share: number) => `${(share * 100).toFixed(3)}%`

/**
 * THE DAY ON ONE LINE (FR-079, artboard 12): the hours from 08 to 20, the past hatched, a line at
 * now, the stretch free until the next timed thing, meetings as purple spans with Join, and timed
 * deadlines as flags. Things too close to read apart are one node with a count, listed on hover.
 * When a module's meetings or other timed things could not be read, it says so instead of drawing
 * a day that looks free (FR-032).
 */
export function Timeline({
  items,
  nowMinutes,
  failed,
  onRetry,
}: {
  items: TimedItem[]
  nowMinutes: number
  failed: boolean
  onRetry: () => void
}) {
  // Its own width, for what is too close to read apart there (U-09).
  const holder = useRef<HTMLDivElement>(null)
  const width = useWidth(holder)
  if (failed)
    return (
      <section
        aria-label="Timeline of the day"
        className="rounded-block border border-line bg-panel"
      >
        <BlockFailed what="timeline" onRetry={onRetry} />
      </section>
    )
  const line = dayTimeline(items, nowMinutes, width)
  const Meeting = KIND_ICON.meeting
  return (
    <section
      aria-label="Timeline of the day"
      className="rounded-block border border-line bg-panel px-4 pt-3 pb-2.5"
    >
      <div ref={holder} className="relative h-16.5">
        <div className="absolute inset-x-0 top-0 h-10 rounded-card bg-hover" />
        {line.now !== null && (
          <div
            data-past
            className="absolute top-0 left-0 h-10 rounded-l-card bg-[repeating-linear-gradient(135deg,var(--color-select)_0_4px,transparent_4px_8px)]"
            style={{ width: pct(line.now) }}
          />
        )}
        {line.free && (
          <div
            data-free
            className="absolute top-0 grid h-10 place-items-center overflow-hidden bg-go-bg"
            style={{ left: pct(line.free.at), width: pct(line.free.until - line.free.at) }}
          >
            <span className="truncate text-meta font-medium whitespace-nowrap text-go-t">
              {lengthOf(line.free.minutes)} free
            </span>
          </div>
        )}
        {line.nodes.map((node) => {
          const first = node.items[0]!
          const many = node.items.length > 1
          // Deadlines alone are flags, however many share the moment; a meeting among them makes
          // the node a meeting's.
          if (node.items.every((i) => i.kind === 'due'))
            return (
              <div key={node.key} data-timeline-due>
                <div className="absolute top-0 h-10 w-0.5 bg-warn" style={{ left: pct(node.at) }} />
                <div
                  className={`absolute top-0 flex h-10 min-w-0 items-center gap-1.5 pl-2 text-warn-t ${many ? '' : 'overflow-hidden'}`}
                  style={{ left: pct(node.at), width: pct(Math.max(node.room - node.at, 0.08)) }}
                >
                  <FlagIcon size={14} aria-hidden="true" className="shrink-0" />
                  {many ? (
                    <Cluster items={node.items} nowMinutes={nowMinutes} />
                  ) : (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-meta font-medium">{first.title}</span>
                      <span className="font-mono text-meta">{clock(first.start)}</span>
                    </span>
                  )}
                </div>
              </div>
            )
          const joinable = !many && first.joinUrl && (first.end ?? first.start) > nowMinutes
          return (
            <div key={node.key} data-timeline-meeting>
              <div
                className="absolute top-0 grid h-10 min-w-6 place-items-center rounded-control bg-meeting text-on-project"
                style={{ left: pct(node.at), width: pct(node.until - node.at) }}
              >
                {/* A node of several says how many beside it, not in it (U-09). */}
                <Meeting size={14} aria-hidden="true" />
              </div>
              <div
                className={`absolute top-0 flex h-10 min-w-0 items-center gap-2.5 pl-2 ${many ? '' : 'overflow-hidden'}`}
                // After the node, which is never narrower than its icon (min-w-6).
                style={{
                  left: `max(${pct(node.until)}, calc(${pct(node.at)} + 1.5rem))`,
                  width: pct(Math.max(node.room - node.until, 0.06)),
                }}
              >
                {many ? (
                  <Cluster items={node.items} nowMinutes={nowMinutes} />
                ) : (
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-meta font-medium text-meeting-t">
                      {first.title}
                    </span>
                    <span className="truncate font-mono text-meta text-muted">
                      {clock(first.start)}
                    </span>
                  </span>
                )}
                {joinable && (
                  <a
                    href={first.joinUrl!}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={`${BUTTON.small} h-6.5 shrink-0 px-2 text-meta`}
                  >
                    <JoinIcon size={14} aria-hidden="true" />
                    Join
                  </a>
                )}
              </div>
            </div>
          )
        })}
        {line.now !== null && (
          <div
            data-now-line
            className="absolute -top-1 h-12 w-0.5 bg-ink"
            style={{ left: pct(line.now) }}
          >
            <span className="sr-only">Now, {clock(nowMinutes)}</span>
          </div>
        )}
        {line.ticks.map((t, i) => (
          <span
            key={t.hour}
            aria-hidden="true"
            className={`absolute top-12 font-mono text-meta text-subtle ${
              i === 0 ? '' : i === line.ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
            }`}
            style={{ left: pct(t.at) }}
          >
            {pad(t.hour)}
          </span>
        ))}
        {line.now !== null && (
          <span
            aria-hidden="true"
            className="absolute top-12 -translate-x-1/2 bg-panel px-1 font-mono text-meta font-medium text-ink"
            style={{ left: pct(line.now) }}
          >
            {clock(nowMinutes)}
          </span>
        )}
      </div>
    </section>
  )
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** What a node of several holds, by kind: "3 meetings", "2 deadlines", "1 meeting and 1 deadline". */
function clusterName(items: TimedItem[]): string {
  const meetings = items.filter((i) => i.kind === 'meeting').length
  const deadlines = items.length - meetings
  if (deadlines === 0) return plural(meetings, 'meeting')
  if (meetings === 0) return plural(deadlines, 'deadline')
  return `${plural(meetings, 'meeting')} and ${plural(deadlines, 'deadline')}`
}

/**
 * Things too close to draw apart (FR-015): how many, and when, which list them on hover and on a
 * press, so a keyboard and a screen reader reach each one too (WCAG 2.1.1, 1.4.13). Esc and a
 * press elsewhere put the list away.
 */
function Cluster({ items, nowMinutes }: { items: TimedItem[]; nowMinutes: number }) {
  const [pressed, setPressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const open = pressed || hovered
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!pressed) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setPressed(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pressed])
  const name = clusterName(items)
  const [from, to] = [clock(items[0]!.start), clock(items.at(-1)!.start)]
  const span = from === to ? from : `${from}–${to}`
  const tone = items.some((i) => i.kind === 'meeting') ? 'text-meeting-t' : 'text-warn-t'
  return (
    <span
      ref={box}
      className="relative flex min-w-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return
        e.preventDefault()
        e.stopPropagation()
        setPressed(false)
        setHovered(false)
      }}
    >
      <button
        type="button"
        data-timeline-cluster
        aria-expanded={open}
        aria-label={`${name}, ${span}`}
        onClick={() => setPressed(!pressed)}
        className="flex min-w-0 flex-col rounded-control text-left"
      >
        <span className={`truncate text-meta font-medium ${tone}`}>{name}</span>
        <span className="truncate font-mono text-meta text-muted">{span}</span>
      </button>
      {open && (
        <ul
          aria-label={name}
          className={`absolute top-full left-0 ${LAYER.menu} mt-1.5 w-72 rounded-block bg-float p-1.5 shadow-float`}
        >
          {items.map((m) => {
            const joinable = m.joinUrl && (m.end ?? m.start) > nowMinutes
            return (
              <li key={m.key} className="flex min-h-8 items-center gap-2.5 rounded-control px-2">
                <span className="font-mono text-meta text-muted">{clock(m.start)}</span>
                {m.kind === 'due' && (
                  <FlagIcon size={12} aria-label="Due" className="shrink-0 text-warn-t" />
                )}
                {m.to ? (
                  <Link
                    to={m.to}
                    className="min-w-0 flex-1 truncate text-ui text-ink hover:underline"
                  >
                    {m.title}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-ui text-ink">{m.title}</span>
                )}
                {joinable && (
                  <a
                    href={m.joinUrl!}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Join ${m.title}`}
                    className={`${BUTTON.small} h-6.5 shrink-0 px-2 text-meta`}
                  >
                    <JoinIcon size={14} aria-hidden="true" />
                    Join
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </span>
  )
}

/** An element's width, kept current as it is resized; undefined until it is measured. */
function useWidth(ref: RefObject<HTMLElement | null>): number | undefined {
  const [width, setWidth] = useState<number>()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || undefined)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    return () => watch.disconnect()
  }, [ref])
  return width
}
