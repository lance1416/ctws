import type { OrganisationInTouch } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useContext, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { shortDay, ymd } from '../../../platform/time/dates'
import { Block, BlockFailed } from '../../../platform/ui/Block'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { NewIcon, ReceivedIcon, SentIcon } from '../../../platform/ui/icons'
import { PageHead } from '../../../platform/ui/PageHead'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { NewContext } from '../../../shell/creates'
import { ModuleEmpty } from '../../../shell/layout'
import { useRegistry } from '../../../shell/registry'
import { inTouchQuery, organisationsQuery, overviewQuery } from '../api'
import { ofType } from '../components/OrganisationsSidebar'
import { OrganisationMark } from '../components/OrganisationMark'
import { ProjectNamed, StageOf } from '../components/Standing'
import { OTHER, pluralType } from '../logic/types'

/** The table shows this many before "All N" (FR-064). */
const SHOWN = 5

/**
 * THE ORGANISATIONS OVERVIEW (FR-064, artboard 18): which kinds there are, and who you were in
 * touch with in the last 30 days, where each stands in its project.
 */
export function OrganisationsOverview() {
  const organisations = useQuery(organisationsQuery())
  const overview = useQuery(overviewQuery())
  const openNew = useContext(NewContext)
  const creator = useRegistry().creates.find((c) => c.kind === 'organisation')
  const [params] = useSearchParams()
  const type = params.get('type')
  if (organisations.isSuccess && organisations.data.length === 0)
    return <ModuleEmpty kind="organisation" />
  const types = [
    ...(overview.data?.types ?? []),
    ...(overview.data?.untyped ? [{ type: OTHER, count: overview.data.untyped }] : []),
  ]
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <PageHead>Organisations</PageHead>
        </div>
        {creator && (
          <button
            type="button"
            onClick={() => openNew(creator, { opens: true })}
            className={BUTTON.secondary}
          >
            <NewIcon size={16} aria-hidden="true" />
            New organisation
          </button>
        )}
      </div>
      {overview.data && (
        <div role="group" aria-label="Type" className="flex flex-wrap gap-1.5">
          <Chip to="/organisations" on={type === null} count={overview.data.total}>
            All
          </Chip>
          {types.map((t) => (
            <Chip
              key={t.type}
              to={`/organisations?type=${encodeURIComponent(t.type)}`}
              on={type === t.type}
              count={t.count}
            >
              {t.type === OTHER ? OTHER : pluralType(t.type)}
            </Chip>
          ))}
        </div>
      )}
      <InTouch type={type} />
    </div>
  )
}

function Chip({
  to,
  on,
  count,
  children,
}: {
  to: string
  on: boolean
  count: number
  children: string
}) {
  return (
    <Link
      to={to}
      aria-current={on ? 'true' : undefined}
      className={`inline-flex h-6 items-center gap-1.5 rounded-control px-2 text-meta font-medium max-lg:tap ${
        on ? 'bg-select text-ink' : 'bg-hover text-muted hover:text-ink'
      }`}
    >
      {children}
      <span className="font-normal text-subtle tabular-nums">{count}</span>
    </Link>
  )
}

/** "In touch, last 30 days": one row an organisation, five before "All N" (FR-064, FR-015). */
function InTouch({ type }: { type: string | null }) {
  const inTouch = useQuery(inTouchQuery())
  const organisations = useQuery(organisationsQuery())
  const [all, setAll] = useState(false)
  const byId = new Map((organisations.data ?? []).map((o) => [o.id as string, o]))
  const rows = (inTouch.data?.rows ?? []).filter((r) => {
    const o = byId.get(r.organisationId)
    return o !== undefined && ofType(o, type)
  })
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <Block
      kind="organisation"
      title="In touch, last 30 days"
      count={rows.length}
      empty={inTouch.isSuccess && rows.length === 0 ? 'None' : null}
    >
      {inTouch.isError ? (
        <BlockFailed what="organisations in touch" onRetry={() => void inTouch.refetch()} />
      ) : (
        <ul className="flex flex-col py-1.5">
          {shown.map((r) => (
            <InTouchRow key={r.organisationId} row={r} />
          ))}
        </ul>
      )}
      {rows.length > shown.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="flex h-9 max-lg:h-11 w-full items-center border-t border-line px-3 text-ui text-muted hover:bg-hover hover:text-ink"
        >
          All {rows.length}
        </button>
      )}
    </Block>
  )
}

function InTouchRow({ row }: { row: OrganisationInTouch }) {
  const today = useAccountToday()
  const timeZone = useTimeZone()
  const day = ymd(new Date(row.lastContact.occurredAt), timeZone)
  const Way = row.lastContact.direction === 'sent' ? SentIcon : ReceivedIcon
  return (
    <li
      data-in-touch={row.organisationId}
      className="grid min-h-10 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_7rem_6rem] items-center gap-x-3 px-3 text-ui max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-y-1.5 max-lg:py-3"
    >
      {/* On a phone a card, every one the same: the name; when and how many; the project and its
          stage. What a card lacks is left empty, never filled by what comes after (P4-14). */}
      <Link
        to={`/organisations/${row.organisationId}`}
        className="flex min-w-0 items-center gap-3 text-ink hover:underline max-lg:col-span-2 max-lg:min-h-11"
      >
        <OrganisationMark name={row.organisationName} />
        <span className="truncate">{row.organisationName}</span>
      </Link>
      <span className="min-w-0 max-lg:order-last max-lg:ml-9">
        {row.standing && <ProjectNamed standing={row.standing} />}
      </span>
      <span className="min-w-0 max-lg:order-last max-lg:justify-self-end">
        <StageOf standing={row.standing} />
      </span>
      <span className="flex items-center gap-2 text-meta text-muted max-lg:ml-9">
        {/* Either way on the message tint, as the people overview marks them (H-02). */}
        <span className="inline-grid size-6 place-items-center rounded-control bg-communication-bg text-communication">
          <Way size={14} aria-hidden="true" />
          <span className="sr-only">
            {row.lastContact.direction === 'sent' ? 'Sent' : 'Received'}
          </span>
        </span>
        <span className="font-mono tabular-nums">
          {day === today ? 'Today' : shortDay(day, today)}
        </span>
      </span>
      {/* With the organisation itself, no one in it: nothing to count. */}
      <span className="text-meta text-muted max-lg:justify-self-end">
        {row.peopleCount === 0
          ? ''
          : row.peopleCount === 1
            ? '1 person'
            : `${row.peopleCount} people`}
      </span>
    </li>
  )
}
