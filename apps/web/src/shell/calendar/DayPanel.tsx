import type { ReactNode } from 'react'
import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { longDay, nearDay } from '../../platform/time/dates'
import { BlockHead } from '../../platform/ui/Block'
import { BUTTON, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import {
  CakeIcon,
  CloseIcon,
  DoneIcon,
  FlagIcon,
  JoinIcon,
  KIND_ICON,
  ToDoIcon,
  type IconComponent,
} from '../../platform/ui/icons'
import { KIND_TEXT, KIND_TINT } from '../../platform/ui/kinds'
import { NewContext } from '../creates'
import { useEveryProject } from '../projects/api'
import { ProjectSquare } from '../projects/ProjectSquare'
import { useRegistry } from '../registry'
import type { DayParts, Placed } from './dayParts'
import { useLunarName } from './lunarName'

/** One day of the calendar, and a meeting or a task made on it. */
export function DayPanel({
  day,
  today,
  parts,
  opener,
  onClose,
}: {
  day: string
  today: string
  parts: DayParts
  opener: (entry: Placed) => (() => void) | null
  /** Over the grid, a way to close it. */
  onClose?: () => void
}) {
  const lunar = useLunarName(day)
  const { creates } = useRegistry()
  const openNew = useContext(NewContext)
  const make = [
    { kind: 'meeting', label: 'New meeting', icon: KIND_ICON.meeting },
    { kind: 'task', label: 'Plan a task', icon: ToDoIcon },
  ].flatMap(({ kind, label, icon }) => {
    const creator = creates.find((c) => c.kind === kind)
    return creator ? [{ creator, label, icon }] : []
  })
  const empty = Object.values(parts).every((list) => list.length === 0)
  const row = (entry: Placed, lead: ReactNode, Mark: IconComponent | null, trail?: ReactNode) => (
    <Row key={entry.key} entry={entry} lead={lead} Mark={Mark} open={opener(entry)} trail={trail} />
  )
  const late = (entry: Placed) => entry.day < today && !entry.done

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-0.5 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-subject text-ink">{longDay(day)}</h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close  Esc"
              className={`${ICON_BUTTON} order-last ml-auto`}
            >
              <CloseIcon size={16} aria-hidden="true" />
            </button>
          )}
          {lunar && (
            <span className="inline-flex h-5.5 items-center rounded-small bg-hover px-2 text-meta text-muted">
              {lunar}
            </span>
          )}
        </div>
        {day === today && <span className="text-meta text-muted">Today</span>}
      </div>

      {parts.meetings.length > 0 && (
        <Section
          icon={KIND_ICON.meeting}
          title="Meetings"
          tint={`${KIND_TINT.meeting} ${KIND_TEXT.meeting}`}
        >
          {parts.meetings.map((m) =>
            row(
              m,
              <span className="font-mono text-meta font-medium text-meeting-t tabular-nums">
                {m.time}
              </span>,
              null,
              m.joinUrl && (
                <a
                  href={m.joinUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={`Join ${m.title}`}
                  className={`${BUTTON.small} h-6.5 px-2 text-meta`}
                >
                  <JoinIcon size={14} aria-hidden="true" />
                  Join
                </a>
              ),
            ),
          )}
        </Section>
      )}
      {parts.due.length > 0 && (
        <Section icon={FlagIcon} title="Due">
          {parts.due.map((t) =>
            row(
              t,
              <span className={`text-meta ${late(t) ? 'text-stop-t' : 'text-muted'}`}>
                {late(t) ? 'Late' : (nearDay(day, today) ?? '')}
              </span>,
              t.done ? DoneIcon : FlagIcon,
            ),
          )}
        </Section>
      )}
      {parts.followUps.length > 0 && (
        <Section
          icon={KIND_ICON.communication}
          title="Follow up"
          tint={`${KIND_TINT.communication} ${KIND_TEXT.communication}`}
        >
          {parts.followUps.map((f) =>
            row(
              f,
              late(f) ? <span className="text-meta text-stop-t">Late</span> : null,
              KIND_ICON.communication,
            ),
          )}
        </Section>
      )}
      {parts.birthdays.length > 0 && (
        <Section icon={CakeIcon} title="Birthdays" tint={`${KIND_TINT.person} ${KIND_TEXT.person}`}>
          {parts.birthdays.map((b) =>
            row(
              b,
              null,
              CakeIcon,
              b.turns && <span className="text-meta text-muted">{b.turns}</span>,
            ),
          )}
        </Section>
      )}
      {parts.planned.length > 0 && (
        <Section icon={ToDoIcon} title="Planned" count={parts.planned.length}>
          {parts.planned.map((t) => row(t, null, ToDoIcon))}
        </Section>
      )}
      {empty && (
        <p className="border-t border-line px-4 py-3 text-ui text-muted">Nothing on this day</p>
      )}

      {make.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          {make.map(({ creator, label, icon: Icon }) => (
            <button
              key={creator.kind}
              type="button"
              onClick={() => openNew(creator, { opens: false, day })}
              className={`${BUTTON.small} h-7 px-2.5 text-ui`}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({
  icon,
  title,
  tint = 'bg-hover text-muted',
  count,
  children,
}: {
  icon: IconComponent
  title: string
  tint?: string
  count?: number
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="border-t border-line pb-3">
      <BlockHead icon={icon} tint={tint} title={title} level="h3" ruled={false} count={count} />
      <ul className="flex flex-col px-4">{children}</ul>
    </section>
  )
}

/** A thing on the day: what leads it, its mark, its name opening it, its project's square. */
function Row({
  entry,
  lead,
  Mark,
  open,
  trail,
}: {
  entry: Placed
  lead: ReactNode
  Mark: IconComponent | null
  open: (() => void) | null
  trail?: ReactNode
}) {
  const projects = useEveryProject()
  const project = entry.projectId ? projects.data?.find((p) => p.id === entry.projectId) : null
  // A deadline met stays on its day, struck through.
  const name = `min-w-0 truncate text-left text-ui hover:underline ${
    entry.done ? 'text-muted line-through' : 'text-ink'
  }`
  return (
    <li className="grid min-h-7 grid-cols-[48px_20px_minmax(0,1fr)_auto_auto] items-center gap-x-2.5">
      <span className="min-w-0 truncate">{lead}</span>
      {/* A meeting leads with its project, as Today's do; the rest end with it. */}
      {Mark ? (
        <Mark size={14} aria-hidden="true" className="text-muted" />
      ) : project ? (
        <ProjectSquare project={project} />
      ) : (
        <span />
      )}
      {open ? (
        <button type="button" onClick={open} className={name}>
          {entry.title}
        </button>
      ) : (
        <Link to={entry.to} className={name}>
          {entry.title}
        </Link>
      )}
      {Mark && project ? <ProjectSquare project={project} /> : <span />}
      {trail ?? <span />}
    </li>
  )
}
