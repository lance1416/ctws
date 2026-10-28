import type { OrganisationResponse } from '@ctws/contracts'
import { useContext, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { keyLabel } from '../../../platform/keyboard/keys'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { Avatar } from '../../../platform/ui/Avatar'
import { BUTTON, KEY } from '../../../platform/ui/buttonStyles'
import {
  EditIcon,
  KIND_ICON,
  PlacesIcon,
  TypeIcon,
  type IconComponent,
} from '../../../platform/ui/icons'
import { NewContext } from '../../../shell/creates'
import { useRegistry } from '../../../shell/registry'
import { Timeline } from '../../../shell/timeline'
import { OrganisationMark } from '../components/OrganisationMark'
import { ProjectNamed, StageOf } from '../components/Standing'

const TAG =
  'inline-flex h-5.5 items-center gap-1 rounded-control bg-hover px-2 text-meta text-muted'

/** A website as it is read: the host and path, without the scheme or a trailing slash. */
const siteWords = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '')

/**
 * Where the website link may go: an http(s) address only. The server refuses any other on write,
 * but a row from before that rule is drawn as words, never as a link that could run script.
 */
function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null
  } catch {
    return null
  }
}

/**
 * AN ORGANISATION'S PAGE (FR-065, artboard 14): what it is and where at the head, with Log a
 * message; down the left what it is, who is there and which projects it is in; beside it the
 * timeline of what was said and done with it.
 */
export function OrganisationPage({ organisation: o }: { organisation: OrganisationResponse }) {
  const profiled =
    Boolean(o.website || o.city || o.note) ||
    o.people.now.length + o.people.before.length > 0 ||
    o.inProjects.length > 0
  return (
    <div className="flex flex-col gap-4">
      <OrganisationHead organisation={o} />
      <div
        className={`grid items-start gap-4 ${profiled ? 'lg:grid-cols-[17.5rem_minmax(0,1fr)]' : ''}`}
      >
        {profiled && <Profile organisation={o} />}
        <div className="min-w-0 rounded-block border border-line bg-panel p-4">
          <Timeline of={{ type: 'organisation', id: o.id }} filters />
        </div>
      </div>
    </div>
  )
}

function OrganisationHead({ organisation: o }: { organisation: OrganisationResponse }) {
  const openNew = useContext(NewContext)
  const log = useRegistry().creates.find((c) => c.kind === 'communication')
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <OrganisationMark name={o.name} size={56} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 tabIndex={-1} className="truncate text-title tracking-[-0.02em] focus:outline-none">
          {o.name}
        </h1>
        {(o.type || o.city) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {o.type && (
              <span className={TAG}>
                <TypeIcon size={12} aria-hidden="true" />
                {o.type}
              </span>
            )}
            {o.city && (
              <span className={TAG}>
                <PlacesIcon size={12} aria-hidden="true" />
                {o.city}
              </span>
            )}
          </div>
        )}
      </div>
      {log && (
        <button type="button" onClick={() => openNew(log)} className={BUTTON.secondary}>
          <KIND_ICON.communication size={16} aria-hidden="true" />
          Log a message
          <kbd className={KEY}>{keyLabel('N X')}</kbd>
        </button>
      )}
      <Link to={`/organisations/${o.id}/edit`} className={BUTTON.secondary}>
        <EditIcon size={16} aria-hidden="true" />
        Edit
      </Link>
    </div>
  )
}

/** About, People, In projects and Notes; a section with nothing to say is left out. */
function Profile({ organisation: o }: { organisation: OrganisationResponse }) {
  const personTo = useRegistry().relationFor('person').to
  return (
    <aside
      aria-label="Profile"
      className="flex flex-col gap-5 rounded-block border border-line bg-panel p-4"
    >
      {(o.website || o.city) && (
        <Section title="About" icon={KIND_ICON.organisation}>
          <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-3 gap-y-2 pl-6 text-ui">
            {o.website && (
              <Fact name="Website">
                <Website url={o.website} />
              </Fact>
            )}
            {o.city && <Fact name="City">{o.city}</Fact>}
          </dl>
        </Section>
      )}
      {o.people.now.length + o.people.before.length > 0 && (
        <Section
          title="People"
          icon={KIND_ICON.person}
          note={o.people.now.length > 0 ? `${o.people.now.length} now` : null}
        >
          <ul className="flex flex-col gap-2 pl-6">
            {o.people.now.map((p) => (
              <Holder key={p.personId} to={personTo(p.personId)} holder={p} />
            ))}
          </ul>
          {o.people.before.length > 0 && (
            <>
              <h3 className="pl-6 text-meta text-muted">Before</h3>
              <ul className="flex flex-col gap-2 pl-6">
                {o.people.before.map((p) => (
                  <Holder key={`${p.personId}-${p.to}`} to={personTo(p.personId)} holder={p} />
                ))}
              </ul>
            </>
          )}
        </Section>
      )}
      {o.inProjects.length > 0 && (
        <Section title="In projects" icon={KIND_ICON.project}>
          <ul className="flex flex-col gap-2 pl-6">
            {o.inProjects.map((s) => (
              <li key={s.projectId} className="flex min-w-0 items-center justify-between gap-2">
                <ProjectNamed standing={s} />
                <StageOf standing={s} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      {o.note && (
        <Section title="Notes" icon={KIND_ICON.note}>
          <div className="text-prose">
            <NoteBody source={o.note} />
          </div>
        </Section>
      )}
    </aside>
  )
}

function Section({
  title,
  icon: Icon,
  note = null,
  children,
}: {
  title: string
  icon: IconComponent
  note?: string | null
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-ui font-medium text-ink">
        <Icon size={16} aria-hidden="true" className="text-muted" />
        {title}
        {note && <span className="text-meta font-normal text-subtle">{note}</span>}
      </h2>
      {children}
    </section>
  )
}

function Website({ url }: { url: string }) {
  const href = safeHref(url)
  if (!href) return <span className="block truncate">{url}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="block truncate text-ink hover:underline"
    >
      {siteWords(url)}
    </a>
  )
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-meta leading-5 text-muted">{name}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}

/** Someone who holds or held a role here: avatar, name, and the role under it. */
function Holder({
  to,
  holder,
}: {
  to: string
  holder: OrganisationResponse['people']['now'][number]
}) {
  return (
    <li>
      <Link to={to} className="flex min-w-0 items-center gap-2.5 hover:underline">
        <Avatar initials={holder.initials} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-ui text-ink">{holder.name}</span>
          {holder.title && <span className="truncate text-meta text-muted">{holder.title}</span>}
        </span>
      </Link>
    </li>
  )
}
