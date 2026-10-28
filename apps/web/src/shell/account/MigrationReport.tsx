import {
  api,
  idFrom,
  organisationId,
  personId,
  type MigrationItem,
  type MigrationReportResponse,
  type ObjectType,
  type TaskStatus,
} from '@ctws/contracts'
import { displayName } from '@ctws/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { call } from '../../platform/http/api'
import { monthDay } from '../../platform/time/dates'
import { BUTTON } from '../../platform/ui/buttonStyles'
import { boxed } from '../../platform/ui/formStyles'
import {
  DoneIcon,
  KIND_ICON,
  MarkDoneIcon,
  MovedIcon,
  PLACE_ICON,
  PlacesIcon,
  TimeZoneIcon,
  type IconComponent,
} from '../../platform/ui/icons'
import { meKey } from '../auth/useMe'
import { KIND_TEXT } from '../../platform/ui/kinds'
import { STATUS_LABEL, StatusMark } from '../../platform/ui/StatusMark'
import { useEveryProject } from '../projects/api'
import { ProjectSquare } from '../projects/ProjectSquare'
import { useRegistry } from '../registry'
import { checkItem, finishReport, migrationKeys, migrationQuery } from './api'

type Section = MigrationItem['section']

/** The report's parts, in the sidebar's two groups (FR-099, artboard 28). */
type ReportPart = { id: Section; label: string; icon: IconComponent; tone: string }

/** Each part's icon in the colour of the kind of thing it is about (MR-01). */
const NEED_A_LOOK: readonly ReportPart[] = [
  { id: 'names', label: 'Names', icon: KIND_ICON.person, tone: KIND_TEXT.person },
  {
    id: 'organisationsToMerge',
    label: 'Organisations to merge',
    icon: KIND_ICON.organisation,
    tone: KIND_TEXT.organisation,
  },
  {
    id: 'parentsStatus',
    label: 'Parents whose status changed',
    icon: KIND_ICON.task,
    tone: KIND_TEXT.task,
  },
  {
    id: 'peopleWithoutCity',
    label: 'People without a city',
    icon: TimeZoneIcon,
    tone: KIND_TEXT.person,
  },
  {
    id: 'rolesWithoutCompany',
    label: 'Roles without a company',
    icon: KIND_ICON.organisation,
    tone: KIND_TEXT.organisation,
  },
]
const IF_YOU_LIKE: readonly ReportPart[] = [
  {
    id: 'plannedDatesMoved',
    label: 'Planned dates moved down',
    icon: PLACE_ICON.calendar,
    tone: KIND_TEXT.task,
  },
  {
    id: 'projectColours',
    label: 'Project colours and initials',
    icon: KIND_ICON.project,
    tone: KIND_TEXT.project,
  },
  { id: 'citiesByName', label: 'Cities matched by name', icon: PlacesIcon, tone: KIND_TEXT.person },
]

/** "Everything else": what the move counted, in words; a count it does not name is not shown. */
const MOVED: readonly [string, string][] = [
  ['meetingNotes', 'Meeting notes that became notes'],
  ['belongs', 'Things kept in their project'],
  ['attends', 'People kept in their meetings'],
  ['recommends', 'Reading kept with who recommended it'],
  ['extraRecommenders', 'Other recommenders kept as links'],
  ['about', 'Links kept between things'],
  ['createdAdded', '“Created” lines added to timelines'],
  ['deleted', 'Things deleted before, kept as a record'],
]

const sectionId = (s: Section | 'else') => `report-${s}`

const waiting = (i: MigrationItem) => i.attention && !i.checked

/**
 * THE MIGRATION REPORT (FR-099, artboard 28): the places the move to the new layout made a guess
 * for you, a part each, to look at once: names put right in place, organisations merged or kept
 * apart, the rest marked as looking right or opened. Done ends it, and its prompts go.
 */
export function MigrationReport() {
  const report = useQuery(migrationQuery())
  const [chosen, setChosen] = useState<Section | 'else'>('names')
  const qc = useQueryClient()
  const navigate = useNavigate()
  const done = useMutation({
    mutationFn: finishReport,
    meta: { refresh: false },
    onSuccess: async () => {
      qc.removeQueries({ queryKey: migrationKeys.report })
      await qc.invalidateQueries({ queryKey: meKey })
      navigate('/account')
    },
  })
  if (report.isError)
    return <p className="text-ui text-muted">There is no report of a move to show.</p>
  const data = report.data
  if (!data) return null
  const of = (s: Section) => data.items.filter((i) => i.section === s)

  // A part chosen in the sidebar is the one shown as chosen; the first until one is.
  const sidebar = (parts: readonly ReportPart[], counted: (s: Section) => number | null) =>
    parts.map((s) => (
      <SideRow
        key={s.id}
        {...s}
        count={counted(s.id)}
        chosen={chosen === s.id}
        onChoose={() => setChosen(s.id)}
      />
    ))

  return (
    // The sidebar sits where the shell's do, the main area's left edge, top to bottom (MR-01).
    <div className="-m-5 flex min-h-[calc(100%+2.5rem)] max-lg:pb-20">
      <nav
        aria-label="Migration report"
        className="sticky top-0 hidden h-[calc(100dvh-2.75rem)] w-62 shrink-0 flex-col overflow-y-auto border-r border-line bg-chrome pb-3 lg:flex"
      >
        <h2 className="flex h-11 shrink-0 items-center px-3.5 text-ui font-medium text-ink">
          Migration report
        </h2>
        <SideGroup title="Need a look">
          {sidebar(NEED_A_LOOK, (id) => {
            const left = of(id).filter(waiting).length
            return left > 0 ? left : null
          })}
        </SideGroup>
        <SideGroup title="To check if you like">
          {sidebar(IF_YOU_LIKE, (id) => of(id).length || null)}
          <SideRow
            id="else"
            label="Everything else"
            icon={MovedIcon}
            tone="text-muted"
            count={null}
            chosen={chosen === 'else'}
            onChoose={() => setChosen('else')}
          />
        </SideGroup>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-3 p-5">
        <div className="mb-1 flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-title text-ink">Your data in the new layout</h1>
            <p className="text-ui text-muted">
              Moved on {monthDay(data.ranAt.slice(0, 10))}. A backup from just before is kept. These
              are the places where a guess was made for you.
            </p>
          </div>
          <span data-report-left className="mt-2 text-ui text-muted tabular-nums">
            {data.pending > 0 ? `${data.pending} left` : 'All looked at'}
          </span>
          <button
            type="button"
            disabled={done.isPending}
            onClick={() => done.mutate()}
            className={BUTTON.secondary}
          >
            <DoneIcon size={16} aria-hidden="true" />
            Done
          </button>
        </div>
        {done.isError && (
          <p role="alert" className="text-ui text-stop-t">
            Couldn’t finish the report. It is still here.
          </p>
        )}

        <Names items={of('names')} />
        <Merges items={of('organisationsToMerge')} />
        {[...NEED_A_LOOK.slice(2), ...IF_YOU_LIKE].map((s) => (
          <Plain key={s.id} section={s} items={of(s.id)} />
        ))}
        <Else counts={data.counts.moved} />
      </div>
    </div>
  )
}

function SideGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col pb-2">
      <h3 className="px-4 pt-2.5 pb-1 text-meta font-medium text-subtle">{title}</h3>
      <ul className="flex flex-col">{children}</ul>
    </section>
  )
}

/** A part of the report: its name, and how many are left in it, or its tick when none are. */
function SideRow({
  id,
  label,
  icon: Icon,
  tone,
  count,
  chosen,
  onChoose,
}: {
  id: Section | 'else'
  label: string
  icon: IconComponent
  tone: string
  count: number | null
  chosen: boolean
  onChoose: () => void
}) {
  return (
    <li>
      <a
        href={`#${sectionId(id)}`}
        onClick={onChoose}
        aria-current={chosen ? 'true' : undefined}
        className={`mx-1 flex min-h-9 items-center gap-1.5 rounded-control px-1.5 text-ui text-ink ${
          chosen ? 'bg-select font-medium' : 'hover:bg-hover'
        }`}
      >
        <Icon size={16} aria-hidden="true" className={`shrink-0 ${tone}`} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count === null ? (
          <MarkDoneIcon size={14} aria-label="Looked at" className="text-go" />
        ) : (
          <span className="text-meta font-normal text-muted tabular-nums">{count}</span>
        )}
      </a>
    </li>
  )
}

/** A part's block: its icon, name and what it holds, then its rows. */
function Part({
  id,
  icon: Icon,
  title,
  says,
  action,
  children,
}: {
  id: Section | 'else'
  icon: IconComponent
  title: string
  says?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={sectionId(id)}
      aria-label={title}
      className="shrink-0 scroll-mt-4 overflow-hidden rounded-block border border-line bg-panel"
    >
      <div className="flex h-11 items-center gap-2 border-b border-line pr-2 pl-3">
        <span className="inline-grid size-6 place-items-center rounded-control bg-hover text-muted">
          <Icon size={14} aria-hidden="true" />
        </span>
        <h2 className="text-ui font-medium text-ink">{title}</h2>
        {says && <span className="text-meta text-muted">{says}</span>}
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </section>
  )
}

/** Why a guess is listed, or that it has been looked at. */
function Why({ item }: { item: MigrationItem }) {
  if (item.checked)
    return (
      <span className="inline-flex h-5.5 items-center rounded-key whitespace-nowrap bg-go-bg px-2 text-meta font-medium text-go-t">
        Checked
      </span>
    )
  if (!item.why) return null
  return (
    <span
      className={`inline-flex h-5.5 items-center rounded-key whitespace-nowrap px-2 text-meta font-medium ${
        item.attention ? 'bg-warn-bg text-warn-t' : 'bg-hover text-muted'
      }`}
    >
      {item.why}
    </span>
  )
}

/** Marks a guess looked at, the report read again with it. */
function useCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, checked }: { key: string; checked: boolean }) => checkItem(key, checked),
    meta: { refresh: false },
    onSuccess: async (report: MigrationReportResponse) => {
      qc.setQueryData(migrationKeys.report, report)
      await qc.invalidateQueries({ queryKey: meKey })
    },
  })
}

/** "Looks right": a guess looked at and left as it is. */
function LooksRight({ item }: { item: MigrationItem }) {
  const check = useCheck()
  if (!waiting(item))
    return (
      <span className="justify-self-end">
        <Why item={item} />
      </span>
    )
  return (
    <span className="flex items-center gap-2 justify-self-end">
      <Why item={item} />
      <button
        type="button"
        disabled={check.isPending}
        onClick={() => check.mutate({ key: item.key, checked: true })}
        className={`${BUTTON.secondary} h-7 shrink-0 px-2.5 text-meta whitespace-nowrap`}
      >
        Looks right
      </button>
    </span>
  )
}

const NAME_GRID =
  'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_15rem] items-center gap-x-2.5 px-3.5'

/** Names: each person's old name and its three parts, put right in place (FR-095). */
function Names({ items }: { items: MigrationItem[] }) {
  const [all, setAll] = useState(false)
  const toLook = items.filter((i) => i.attention)
  const shown = all ? items : toLook
  return (
    <Part
      id="names"
      icon={KIND_ICON.person}
      title="Names"
      // One count throughout (MR-03): what still waits, the rest, and all of them.
      says={`${items.filter(waiting).length} to look at, ${items.filter((i) => !waiting(i)).length} look right`}
      action={
        items.length > toLook.length && (
          <button
            type="button"
            onClick={() => setAll(!all)}
            className={`${BUTTON.secondary} h-7 px-2.5 text-meta`}
          >
            {all ? 'Show the ones to look at' : `Show all ${items.length}`}
          </button>
        )
      }
    >
      <div className={`${NAME_GRID} h-9 border-b border-line text-meta font-medium text-muted`}>
        <span>Was</span>
        <span>Given name</span>
        <span>Middle name</span>
        <span>Family name</span>
        <span>Shown as</span>
        <span />
      </div>
      <ul>
        {shown.map((item) => (
          <NameRow key={item.key} item={item} />
        ))}
      </ul>
    </Part>
  )
}

type Parts = { givenName: string; middleName: string; familyName: string }

/** One person's name: saved as a field is left, and with it the guess counts as looked at. */
function NameRow({ item }: { item: MigrationItem }) {
  const person = useQuery({
    queryKey: ['people', 'one', item.id],
    queryFn: ({ signal }) =>
      call(api.people.get, { params: { id: idFrom(personId, item.id!) } }, { signal }),
    enabled: item.id !== null,
  })
  const qc = useQueryClient()
  const check = useCheck()
  const [typed, setTyped] = useState<Parts | null>(null)
  const parts: Parts = typed ?? {
    givenName: person.data?.givenName ?? '',
    middleName: person.data?.middleName ?? '',
    familyName: person.data?.familyName ?? '',
  }
  const save = useMutation({
    mutationFn: (next: Parts) =>
      call(api.people.update, {
        params: { id: idFrom(personId, item.id!) },
        body: {
          givenName: next.givenName.trim(),
          middleName: next.middleName.trim() || null,
          familyName: next.familyName.trim() || null,
        },
      }),
    meta: { changes: ['person'] },
    onSuccess: async (saved) => {
      qc.setQueryData(['people', 'one', item.id], saved)
      setTyped(null)
      if (!item.checked) check.mutate({ key: item.key, checked: true })
    },
  })
  const leave = () => {
    if (!typed || !person.data || typed.givenName.trim() === '') return
    const was = person.data
    if (
      typed.givenName.trim() === was.givenName &&
      (typed.middleName.trim() || null) === was.middleName &&
      (typed.familyName.trim() || null) === was.familyName
    )
      return setTyped(null)
    save.mutate(typed)
  }
  const field = (key: keyof Parts, name: string) => (
    <input
      aria-label={`${name} of ${item.title}`}
      value={parts[key]}
      disabled={!person.data}
      onChange={(e) => setTyped({ ...parts, [key]: e.target.value })}
      onBlur={leave}
      className={`${boxed} w-full`}
    />
  )
  return (
    <li
      data-report-name={item.key}
      className={`${NAME_GRID} min-h-11 border-b border-line py-1.5 last:border-b-0`}
    >
      <span className="truncate font-mono text-meta text-muted">{item.was}</span>
      {field('givenName', 'Given name')}
      {field('middleName', 'Middle name')}
      {field('familyName', 'Family name')}
      <span className="truncate text-ui text-ink">
        {parts.givenName.trim()
          ? displayName({
              givenName: parts.givenName.trim(),
              middleName: parts.middleName.trim() || null,
              familyName: parts.familyName.trim() || null,
            })
          : item.now}
      </span>
      <LooksRight item={item} />
      {save.isError && (
        <p role="alert" className="col-span-6 text-meta text-stop-t">
          Couldn’t save the name. What you typed is still here.
        </p>
      )}
    </li>
  )
}

/** Organisations that may be one: merged into the one most people are at, or kept apart. */
function Merges({ items }: { items: MigrationItem[] }) {
  if (items.length === 0) return null
  return (
    <Part
      id="organisationsToMerge"
      icon={KIND_ICON.organisation}
      title="Organisations to merge"
      says="Made from the company names you had"
    >
      <ul>
        {items.map((item) => (
          <MergeRow key={item.key} item={item} />
        ))}
      </ul>
    </Part>
  )
}

function MergeRow({ item }: { item: MigrationItem }) {
  const check = useCheck()
  const group = item.group ?? []
  const merge = useMutation({
    mutationFn: async () => {
      for (const other of group.filter((g) => g.id !== item.id))
        await call(api.organisations.merge, {
          params: { id: idFrom(organisationId, other.id) },
          body: { into: idFrom(organisationId, item.id!) },
        })
    },
    meta: { changes: ['organisation', 'person'] },
    onSuccess: () => check.mutate({ key: item.key, checked: true }),
  })
  return (
    <li
      data-report-merge={item.key}
      className="flex flex-wrap items-center gap-2.5 border-b border-line px-3.5 py-2.5 last:border-b-0"
    >
      {group.map((g) => (
        <span key={g.id} className="flex items-center gap-1.5">
          <span className="inline-flex h-6 items-center gap-1.5 rounded-key bg-organisation-bg px-2 text-meta font-medium text-organisation-t">
            <KIND_ICON.organisation size={12} aria-hidden="true" />
            {g.name}
          </span>
          <span className="text-meta text-muted">
            {g.people === 1 ? '1 person' : `${g.people} people`}
          </span>
        </span>
      ))}
      <span className="flex-1" />
      {item.checked ? (
        <Why item={item} />
      ) : (
        <>
          <button
            type="button"
            disabled={merge.isPending || check.isPending}
            onClick={() => check.mutate({ key: item.key, checked: true })}
            className={BUTTON.secondary}
          >
            Keep apart
          </button>
          <button
            type="button"
            disabled={merge.isPending || check.isPending}
            onClick={() => merge.mutate()}
            className={BUTTON.secondary}
          >
            Merge as {item.now}
          </button>
        </>
      )}
      {merge.isError && (
        <p role="alert" className="w-full text-meta text-stop-t">
          Couldn’t merge them. Nothing was moved.
        </p>
      )}
    </li>
  )
}

/** A part of rows that open their thing: what it was, what it is now, and why it is listed. */
function Plain({
  section,
  items,
}: {
  section: { id: Section; label: string; icon: IconComponent }
  items: MigrationItem[]
}) {
  const relationFor = useRegistry().relationFor
  if (items.length === 0) return null
  const where = (type: ObjectType | null, id: string | null) =>
    type && id ? relationFor(type).to(id) : null
  return (
    <Part id={section.id} icon={section.icon} title={section.label}>
      <ul>
        {items.map((item) => {
          const to = where(item.type, item.id)
          return (
            <li
              key={item.key}
              data-report-item={item.key}
              className="grid min-h-11 grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line px-3.5 py-1.5 last:border-b-0"
            >
              {to ? (
                // Put right on its own page (MR-06).
                <Link to={to} className="truncate text-ui text-ink hover:underline">
                  {item.title}
                  <span aria-hidden="true" className="ml-1 text-muted">
                    ↗
                  </span>
                </Link>
              ) : (
                <span className="truncate text-ui text-ink">{item.title}</span>
              )}
              <Value item={item} which="was" />
              <Value item={item} which="now" />
              <LooksRight item={item} />
            </li>
          )
        })}
      </ul>
    </Part>
  )
}

/** The old colours' names, as the move read them, in the new names it gave them. */
const OLD_COLOUR: Record<string, string> = {
  'project-1': 'blue',
  'project-2': 'amber',
  'project-3': 'green',
  'project-4': 'pink',
  'project-5': 'teal',
  'project-6': 'olive',
}

/**
 * What a guess was or is, drawn as what it is (MR-04, MR-05): a status by its mark and name, the
 * second after an arrow; a project's colour as a swatch, and now its square; else the words.
 */
function Value({ item, which }: { item: MigrationItem; which: 'was' | 'now' }) {
  const projects = useEveryProject()
  const value = item[which]
  if (item.section === 'parentsStatus' && value && value in STATUS_LABEL) {
    const status = value as TaskStatus
    return (
      <span className="flex min-w-0 items-center gap-2 text-ui text-ink">
        {which === 'now' && (
          <span aria-hidden="true" className="text-muted">
            →
          </span>
        )}
        <StatusMark status={status} size={14} />
        {STATUS_LABEL[status]}
      </span>
    )
  }
  if (item.section === 'projectColours') {
    if (which === 'now') {
      const project = projects.data?.find((p) => p.id === item.id)
      return project ? (
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="text-muted">
            →
          </span>
          <ProjectSquare project={project} />
        </span>
      ) : (
        <span />
      )
    }
    const was = value ? (OLD_COLOUR[value] ?? value) : null
    return was && was in PROJECT_SWATCH ? (
      <span
        role="img"
        aria-label={`Was ${was}`}
        className={`size-4 rounded-key ${PROJECT_SWATCH[was as keyof typeof PROJECT_SWATCH]}`}
      />
    ) : (
      <span />
    )
  }
  return which === 'was' ? (
    <span className="truncate font-mono text-meta text-muted">{value ?? '—'}</span>
  ) : (
    <span className="truncate text-ui text-ink">{value}</span>
  )
}

/** Each project colour's swatch. */
const PROJECT_SWATCH = {
  blue: 'bg-project-blue',
  amber: 'bg-project-amber',
  green: 'bg-project-green',
  pink: 'bg-project-pink',
  teal: 'bg-project-teal',
  olive: 'bg-project-olive',
  red: 'bg-project-red',
  violet: 'bg-project-violet',
} as const

function Else({ counts }: { counts: Record<string, number> }) {
  const rows = MOVED.filter(([key]) => (counts[key] ?? 0) > 0)
  return (
    <Part id="else" icon={MovedIcon} title="Everything else">
      {rows.length === 0 ? (
        <p className="px-3.5 py-3 text-ui text-subtle">Nothing else was moved.</p>
      ) : (
        <ul>
          {rows.map(([key, label]) => (
            <li
              key={key}
              className="flex min-h-10 items-center border-b border-line px-3.5 text-ui text-ink last:border-b-0"
            >
              <span className="flex-1">{label}</span>
              <span className="tabular-nums">{counts[key]}</span>
            </li>
          ))}
        </ul>
      )}
    </Part>
  )
}
