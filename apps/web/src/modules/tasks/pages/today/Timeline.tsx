import { BUTTON } from '../../../../platform/ui/buttonStyles'
import { FlagIcon, JoinIcon, KIND_ICON } from '../../../../platform/ui/icons'
import { dayTimeline, lengthOf, type TimedItem } from './dayLine'

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
const pct = (share: number) => `${(share * 100).toFixed(3)}%`

/**
 * THE DAY ON ONE LINE (FR-079, artboard 12): the hours from 08 to 20, the past hatched, a line at
 * now, the stretch free until the next timed thing, meetings as purple spans with Join, and timed
 * deadlines as flags. Things too close to read apart are one node with a count, listed on hover.
 */
export function Timeline({ items, nowMinutes }: { items: TimedItem[]; nowMinutes: number }) {
  const line = dayTimeline(items, nowMinutes)
  const Meeting = KIND_ICON.meeting
  return (
    <section
      aria-label="Timeline of the day"
      className="rounded-block border border-line bg-panel px-4 pt-3 pb-2.5"
    >
      <div className="relative h-16.5">
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
          const label = node.items.map((i) => `${clock(i.start)} ${i.title}`).join('\n')
          if (first.kind === 'due' && !many)
            return (
              <div key={node.key} data-timeline-due>
                <div className="absolute top-0 h-10 w-0.5 bg-warn" style={{ left: pct(node.at) }} />
                <div
                  className="absolute top-0 flex h-10 min-w-0 items-center gap-1.5 pl-2 text-warn-t"
                  style={{ left: pct(node.at), width: pct(Math.max(node.room - node.at, 0.08)) }}
                >
                  <FlagIcon size={14} aria-hidden="true" className="shrink-0" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-meta font-medium">{first.title}</span>
                    <span className="font-mono text-meta">{clock(first.start)}</span>
                  </span>
                </div>
              </div>
            )
          const joinable = !many && first.joinUrl && (first.end ?? first.start) > nowMinutes
          return (
            <div key={node.key} data-timeline-meeting title={many ? label : undefined}>
              <div
                className="absolute top-0 grid h-10 min-w-6 place-items-center rounded-control bg-meeting text-on-project"
                style={{ left: pct(node.at), width: pct(node.until - node.at) }}
              >
                {many ? (
                  <span className="text-meta font-medium tabular-nums">{node.items.length}</span>
                ) : (
                  <Meeting size={14} aria-hidden="true" />
                )}
              </div>
              <div
                className="absolute top-0 flex h-10 min-w-0 items-center gap-2.5 pl-2 overflow-hidden"
                style={{
                  left: `calc(${pct(node.until)} + 0px)`,
                  width: pct(Math.max(node.room - node.until, 0.06)),
                }}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-meta font-medium text-meeting-t">
                    {many ? `${node.items.length} meetings` : first.title}
                  </span>
                  <span className="truncate font-mono text-meta text-muted">
                    {many
                      ? `${clock(first.start)}–${clock(node.items.at(-1)!.start)}`
                      : clock(first.start)}
                  </span>
                </span>
                {joinable && (
                  <a
                    href={first.joinUrl!}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={`${BUTTON.secondary} h-6.5 shrink-0 px-2 text-meta`}
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
