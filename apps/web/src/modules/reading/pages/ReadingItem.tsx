import {
  idFrom,
  readingId,
  type ReadingItemResponse,
  type ReadingStatus,
  type UpdateReadingItemBody,
} from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { dayPhrase, shortDay, ymd } from '../../../platform/time/dates'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { DangerZone } from '../../../platform/ui/DangerZone'
import {
  EditIcon,
  KIND_ICON,
  LinkIcon,
  OpenFullIcon,
  type IconComponent,
} from '../../../platform/ui/icons'
import { Avatar } from '../../../platform/ui/Avatar'
import { PickOne } from '../../../platform/ui/inline'
import { UnsavedAsk } from '../../../platform/ui/UnsavedAsk'
import { useUnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { useAccountToday, useTimeZone } from '../../../shell/auth'
import { DeletedNotice } from '../../../shell/detail'
import { useSubjectOf } from '../../../shell/layout'
import { useKindBlocks } from '../../../shell/links'
import { ProjectSquare, useEveryProject } from '../../../shell/projects'
import { useRegistry } from '../../../shell/registry'
import { useForgetWhenGone, useRecordRecent } from '../../../shell/search'
import { Timeline } from '../../../shell/timeline'
import { patchReadingItem, readingKeys, readingQuery } from '../api'
import { byline } from '../components/ReadingCard'
import { DeleteReading, ReadingForm, STATUS_CHOICES } from '../components/ReadingForm'
import { initialsOf, readingLabel, recentEntry } from '../logic/item'

/** The item the address names, or that there is none. */
function useAddressed() {
  const { id = '' } = useParams()
  const items = useQuery(readingQuery())
  const item = items.data?.find((i) => i.id === idFrom(readingId, id))
  return { id, item, gone: items.isSuccess && !item }
}

/** Where a link may go: http(s) only; anything else stays words (FR-073). */
const safeLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

/** What a status's day is called on the page: started, finished, dropped. */
export const SINCE_WORDS: Record<ReadingStatus, string> = {
  todo: 'Added',
  reading: 'Started',
  done: 'Finished',
  dropped: 'Dropped',
}

/** `/reading/:id`: one item's page (FR-073), or what happened to it. */
export function ReadingItem() {
  const { id, item, gone } = useAddressed()
  useForgetWhenGone('reading', id, gone)
  useSubjectOf(item ? { type: 'reading', id: item.id, title: readingLabel(item) } : null)
  useRecordRecent(item ? recentEntry(item) : null)
  if (gone) return <DeletedNotice type="reading" id={id} />
  if (!item) return null
  return <ReadingPage key={item.id} item={item} />
}

/**
 * ONE ITEM'S PAGE (FR-073, the shared page of FR-021): its title, who wrote it or where it lives
 * and its status at the head, with Open link and Edit; down the left what it is, its days, who
 * recommended it and its project; beside it its timeline and what it is linked to.
 */
function ReadingPage({ item }: { item: ReadingItemResponse }) {
  const registry = useRegistry()
  const { blocks, picker } = useKindBlocks({
    of: { type: 'reading', id: item.id },
    kinds: (['person', 'task', 'meeting'] as const).filter((k) =>
      registry.relations.some((r) => r.type === k),
    ),
    owned: [],
  })
  return (
    <div className="flex flex-col gap-4">
      <ReadingHead item={item} />
      <div className="grid items-start gap-4 lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <Profile item={item} />
        <div className="flex min-w-0 flex-col gap-4">
          {/* What it is linked to, then what happened to it: as a person's page has them (R-04). */}
          <div className="grid items-start gap-3 xl:grid-cols-2">{blocks}</div>
          <div className="rounded-block border border-line bg-panel p-4">
            <Timeline of={{ type: 'reading', id: item.id }} />
          </div>
          {picker}
        </div>
      </div>
    </div>
  )
}

function ReadingHead({ item }: { item: ReadingItemResponse }) {
  const link = safeLink(item.url)
  const status = useMutation({
    mutationFn: (to: ReadingStatus) => patchReadingItem(item.id, { status: to }),
    meta: { changes: ['reading'], awaits: [readingKeys.all], ownsError: true },
  })
  const Icon = item.kind === 'book' ? KIND_ICON.reading : LinkIcon
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <span
        aria-hidden="true"
        className="inline-grid size-14 shrink-0 place-items-center rounded-card bg-reading-bg text-reading"
      >
        <Icon size={24} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h1 tabIndex={-1} className="truncate text-title tracking-[-0.02em] focus:outline-none">
          {readingLabel(item)}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-ui text-muted">
          {byline(item) && <span className="truncate">{byline(item)}</span>}
          {/* The status changed here and now: To read to Reading is the commonest edit (FR-073). */}
          <span className="inline-flex h-7 items-center rounded-control bg-reading-bg px-1.5 text-reading-t">
            <PickOne
              label="Status"
              value={item.status}
              choices={STATUS_CHOICES}
              // Not disabled while it saves: the menu hands focus back to it as it closes.
              onPick={(to) => status.mutate(to)}
            />
          </span>
        </div>
        {status.isError && (
          <p role="alert" className="text-ui text-stop-t">
            {problemText(status.error)}
          </p>
        )}
      </div>
      {link && (
        <a href={link} target="_blank" rel="noreferrer noopener" className={BUTTON.secondary}>
          <OpenFullIcon size={16} aria-hidden="true" />
          Open link
        </a>
      )}
      <Link to={`/reading/${item.id}/edit`} className={BUTTON.secondary}>
        <EditIcon size={16} aria-hidden="true" />
        Edit
      </Link>
    </div>
  )
}

function Profile({ item }: { item: ReadingItemResponse }) {
  const today = useAccountToday()
  const zone = useTimeZone()
  const project = useEveryProject().data?.find((p) => p.id === item.projectId)
  const link = safeLink(item.url)
  const day = (iso: string) => shortDay(ymd(new Date(iso), zone), today)
  return (
    <aside
      aria-label="Profile"
      className="flex flex-col gap-5 rounded-block border border-line bg-panel p-4"
    >
      <Section title="About" icon={item.kind === 'book' ? KIND_ICON.reading : LinkIcon}>
        <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-2 pl-6 text-ui">
          {item.kind === 'book' ? (
            <Fact name="Author">{item.author ?? 'Not known'}</Fact>
          ) : (
            <Fact name="Link">
              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={link}
                  className="block truncate hover:underline"
                >
                  {byline(item) ?? link}
                </a>
              ) : (
                <span className="break-all">{item.url}</span>
              )}
            </Fact>
          )}
          <Fact name="Added">{day(item.createdAt)}</Fact>
          {item.status !== 'todo' && (
            <Fact name={SINCE_WORDS[item.status]}>{day(item.statusSince)}</Fact>
          )}
          {item.planOn && <Fact name="Finish by">{dayPhrase(item.planOn, today)}</Fact>}
        </dl>
      </Section>
      {item.recommendedBy && (
        <Section title="Recommended by" icon={KIND_ICON.person}>
          <Link
            to={`/people/${item.recommendedBy.id}`}
            data-recommended-by={item.recommendedBy.id}
            className="flex items-center gap-2 pl-6 text-ui text-ink hover:underline"
          >
            <Avatar initials={initialsOf(item.recommendedBy.name)} />
            {item.recommendedBy.name}
          </Link>
        </Section>
      )}
      {project && (
        <Section title="In project" icon={KIND_ICON.project}>
          <Link
            to={`/projects/${project.id}`}
            className="flex items-center gap-2 pl-6 text-ui text-ink hover:underline"
          >
            <ProjectSquare project={project} />
            {project.name}
          </Link>
        </Section>
      )}
      {item.fetchedSummary && !item.title && (
        <Section title="From the page" icon={KIND_ICON.note}>
          <p className="pl-6 text-ui text-muted">{item.fetchedSummary}</p>
        </Section>
      )}
    </aside>
  )
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: IconComponent
  children: ReactNode
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2.5">
      <h2 className="flex items-center gap-2 text-ui font-medium text-ink">
        <Icon size={16} aria-hidden="true" className="text-muted" />
        {title}
      </h2>
      {children}
    </section>
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

/** `/reading/:id/edit`: the form, and delete at its foot (FR-073, FR-035). */
export function ReadingEdit() {
  const { id, item, gone } = useAddressed()
  if (gone) return <DeletedNotice type="reading" id={id} />
  if (!item) return null
  return <EditPage key={item.id} item={item} />
}

function EditPage({ item }: { item: ReadingItemResponse }) {
  const navigate = useNavigate()
  const [unsaved, setUnsaved] = useState(false)
  const [done, setDone] = useState(false)
  const guard = useUnsavedGuard(unsaved && !done)
  const back = () => navigate(`/reading/${item.id}`)
  const save = useMutation({
    mutationFn: (patch: UpdateReadingItemBody) => patchReadingItem(item.id, patch),
    meta: { changes: ['reading'], awaits: [readingKeys.all], ownsError: true },
    onSuccess: () => {
      // Drawn with nothing left to lose first, so the guard lets the page go.
      flushSync(() => setDone(true))
      back()
    },
  })
  return (
    <div className="flex min-h-full max-w-3xl shrink-0 flex-col gap-4">
      <h1 tabIndex={-1} className="text-title tracking-[-0.02em] focus:outline-none">
        Edit {readingLabel(item)}
      </h1>
      <UnsavedAsk guard={guard} />
      <div className="rounded-block border border-line bg-panel p-4">
        <ReadingForm
          item={item}
          busy={save.isPending}
          error={problemText(save.error)}
          onCancel={() => guard.leave(back)}
          onSave={(patch) => save.mutate(patch)}
          onUnsaved={setUnsaved}
        />
      </div>
      <DangerZone>
        <DeleteReading item={item} onDeleted={() => navigate('/reading')} />
      </DangerZone>
    </div>
  )
}
