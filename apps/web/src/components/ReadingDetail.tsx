import type { ReadingItemResponse, ReadingStatus } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { deleteReadingItem, patchReadingItem, readingKey, readingLabel } from '../api/reading'
import { listProjects } from '../api/projects'
import { useComposing } from '../composition'
import { addDays, dayPhrase, nextMonday, todayIn } from '../dueAt'
import { useProjectRail } from '../projectColor'
import { useTimeZone } from '../useMe'
import { BUTTON } from './buttonStyles'
import { DangerAction, DangerZone } from './DangerZone'
import { DetailHead, DetailPane } from './DetailPane'
import { Field } from './Field'
import { CHIP, field, label } from './formStyles'
import { PickOne } from './inline'
import { LinkedSection } from './Links'

/**
 * ONE THING TO READ, ON ITS OWN LAYER.
 *
 * It used to have no surface at all: a row and a `⋯` menu, with Rename and Delete inside the menu
 * — the only thing in the app whose content was edited from a dropdown. A book has a title, an
 * author, a plan, a line of work and whoever recommended it; that is more than a row, and the
 * edge saying who recommended it could only be read from the other end.
 *
 * The anatomy is the one every other thing wears: read first, one Edit, a form with Save and
 * Cancel, what it is linked to below, and the one irreversible action at the foot.
 */

const STATUS_LABEL: Record<ReadingStatus, string> = {
  todo: 'To read',
  reading: 'Reading',
  done: 'Finished',
  dropped: 'Dropped',
}

const STATUS_CHOICES = (Object.keys(STATUS_LABEL) as ReadingStatus[]).map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}))

/** When to finish it, as named days -- the same four the row's menu offers. */
const PLANS: { label: string; day: (today: string) => string }[] = [
  { label: 'Today', day: (t) => t },
  { label: 'Tomorrow', day: (t) => addDays(t, 1) },
  { label: 'This week', day: (t) => addDays(nextMonday(t), -1) },
  { label: 'Next week', day: (t) => nextMonday(t) },
]

export function ReadingDetail({
  item,
  onClose,
}: {
  item: ReadingItemResponse
  onClose: () => void
}) {
  return (
    <DetailPane label="Reading" onClose={onClose}>
      <ReadingFields item={item} onClose={onClose} />

      <LinkedSection of={{ type: 'reading', id: item.id }} className="mt-4" />

      {/* 最后一个东西，底下再没有别的控件 —— 和删一个人、删一条任务同一个位置。 */}
      <DangerZone>
        <DeleteReading item={item} onDeleted={onClose} />
      </DangerZone>
    </DetailPane>
  )
}

function ReadingFields({ item, onClose }: { item: ReadingItemResponse; onClose: () => void }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const rail = useProjectRail()
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const timeZone = useTimeZone()
  const today = todayIn(timeZone)

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchReadingItem>[1]) => patchReadingItem(item.id, patch),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['reading'] })
      void qc.invalidateQueries({ queryKey: ['links'] })
    },
  })

  const chip = (id: string) => (
    <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${rail(id)}`} />
  )

  const head = (
    <div>
      <DetailHead
        kind={
          <Link
            to="/reading"
            className="rounded text-sm text-fg-muted hover:text-fg hover:underline"
          >
            ← Reading
          </Link>
        }
        onClose={onClose}
      />
    </div>
  )

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        {head}
        <ReadingForm
          item={item}
          projects={projects.data ?? []}
          chip={chip}
          busy={save.isPending}
          onCancel={() => setEditing(false)}
          onSave={(patch) => {
            save.mutate(patch)
            setEditing(false)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {head}

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block truncate text-lg font-semibold text-fg hover:underline"
            >
              {readingLabel(item)}
            </a>
          ) : (
            <h2 className="truncate text-lg font-semibold text-fg">{readingLabel(item)}</h2>
          )}
          {/* 第二行写的是「这是什么」：一本书的作者，或者一条链接的出处。 */}
          <p className="truncate text-sm text-fg-muted">
            {item.kind === 'book' ? (item.author ?? 'Book') : (item.url ?? 'Link')}
          </p>
        </div>
        <button type="button" className={BUTTON.secondary} onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>

      {item.fetchedSummary && !item.title && (
        <p className="max-w-[68ch] text-sm text-fg-muted">{item.fetchedSummary}</p>
      )}

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          <Field label="Status" shape="above">
            <span className="text-sm text-fg">{STATUS_LABEL[item.status]}</span>
          </Field>
          <Field label="Finish by" shape="above">
            <span className={`text-sm ${item.planOn ? 'text-fg' : 'text-fg-subtle'}`}>
              {item.planOn ? dayPhrase(item.planOn, today) : 'Not set'}
            </span>
          </Field>
          <Field label="Projects" shape="above">
            {/* A chip, like a person's projects and a meeting's. */}
            {item.projectId && item.projectName ? (
              <span className="flex">
                <span className={CHIP}>
                  {chip(item.projectId)}
                  <span className="truncate">{item.projectName}</span>
                </span>
              </span>
            ) : (
              <span className="text-sm text-fg-subtle">Not on any project</span>
            )}
          </Field>
        </div>
      </div>
    </div>
  )
}

/**
 * 改一条读物：一张表，一次保存。
 *
 * 一条链接改的是地址，一本书改的是作者 —— 两种东西各有各的那一格，而 `kind` 不在表里：一条链接
 * 不会变成一本书，要换种类就是另记一条（契约里 `updateReadingItemBody` 也是这么说的）。
 */
function ReadingForm({
  item,
  projects,
  chip,
  busy,
  onCancel,
  onSave,
}: {
  item: ReadingItemResponse
  projects: { id: string; name: string; archivedAt: string | null }[]
  chip: (id: string) => ReactNode
  busy: boolean
  onCancel: () => void
  onSave: (patch: Parameters<typeof patchReadingItem>[1]) => void
}) {
  const [title, setTitle] = useState(item.title ?? '')
  const [url, setUrl] = useState(item.url ?? '')
  const [author, setAuthor] = useState(item.author ?? '')
  const [status, setStatus] = useState<ReadingStatus>(item.status)
  const [planOn, setPlanOn] = useState(item.planOn)
  const [projectId, setProjectId] = useState(item.projectId ?? '')
  const timeZone = useTimeZone()
  const today = todayIn(timeZone)
  const composing = useComposing()

  const submit = () => {
    if (busy) return
    if (item.kind === 'book' && title.trim() === '') return
    onSave({
      // 一条链接的标题可以清空：清掉就回到 host 加路径。一本书不行，没有标题的书不是书。
      title: title.trim() === '' ? (item.kind === 'link' ? null : item.title) : title.trim(),
      ...(item.kind === 'link' && url.trim() !== '' ? { url: url.trim() } : {}),
      ...(item.kind === 'book' ? { author: author.trim() || null } : {}),
      status,
      planOn,
      projectId: projectId === '' ? null : projectId,
    })
  }

  return (
    <form
      aria-label="Edit reading item"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      {...composing.bind}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs text-fg-muted">Editing</span>
        <button type="button" className={BUTTON.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={BUTTON.primary} disabled={busy}>
          Save
        </button>
      </div>

      <div>
        <label htmlFor="r-title" className={label}>
          Title
        </label>
        <input
          id="r-title"
          autoFocus
          value={title}
          placeholder={item.kind === 'link' ? readingLabel({ title: null, url: item.url }) : ''}
          onChange={(e) => setTitle(e.target.value)}
          className={`${field} mt-1.5 text-lg font-semibold`}
        />
      </div>

      {item.kind === 'link' ? (
        <div>
          <label htmlFor="r-url" className={label}>
            Link
          </label>
          <input
            id="r-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={`${field} mt-1.5 text-sm`}
          />
        </div>
      ) : (
        <div>
          <label htmlFor="r-author" className={label}>
            Author
          </label>
          <input
            id="r-author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className={`${field} mt-1.5 text-sm`}
          />
        </div>
      )}

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          <Field label="Status" shape="above">
            <PickOne
              label="Status"
              value={status}
              choices={STATUS_CHOICES}
              onPick={(s) => setStatus(s as ReadingStatus)}
            />
          </Field>
          <Field label="Finish by" shape="above">
            <PickOne
              label="Finish by"
              value={planOn ?? ''}
              /* 命名的日子，不是一个日期选择器：没有人把读书计划排到某一天，而「这周末」才是
                 真正想过的那件事 —— 行上的菜单给的也是这四个。 */
              choices={[
                { value: '', label: 'Not set' },
                ...PLANS.map((p) => ({ value: p.day(today), label: p.label })),
              ]}
              onPick={(v) => setPlanOn(v === '' ? null : v)}
            />
          </Field>
          <Field label="Projects" shape="above">
            <PickOne
              label="Projects"
              value={projectId}
              choices={[
                { value: '', label: 'Not on any project' },
                ...projects
                  .filter((p) => !p.archivedAt)
                  .map((p) => ({ value: p.id, label: p.name, mark: chip(p.id) })),
              ]}
              onPick={setProjectId}
            />
          </Field>
        </div>
      </div>
    </form>
  )
}

/** 删掉一条读物。位置和别的东西一样：这个面的最底下，问一次。 */
export function DeleteReading({
  item,
  onDeleted,
}: {
  item: ReadingItemResponse
  onDeleted: () => void
}) {
  const qc = useQueryClient()
  const drop = useMutation({
    mutationFn: () => deleteReadingItem(item.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: readingKey() })
      onDeleted()
    },
  })
  return (
    <DangerAction
      label="Delete item"
      confirmLabel="Confirm deleting this item"
      message={`Delete “${readingLabel(item)}”? This cannot be undone.`}
      busy={drop.isPending}
      onConfirm={() => drop.mutate()}
    />
  )
}
