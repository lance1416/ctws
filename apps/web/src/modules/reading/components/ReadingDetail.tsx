import type { ReadingItemResponse, ReadingStatus } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { deleteReadingItem, patchReadingItem } from '../api'
import { readingLabel, recentEntry } from '../item'
import { ProjectChip, ProjectPicker } from '../../../shell/projects/ProjectPicker'
import { useComposing } from '../../../platform/keyboard/composition'
import { dayPhrase, todayIn } from '../../../platform/time/dates'
import { planChoices, type PlanDay } from '../plans'
import { useTimeZone } from '../../../shell/auth/useMe'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { DangerAction, DangerZone } from '../../../platform/ui/DangerZone'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { BackHead } from '../../../shell/detail/BackHead'
import { FormBar } from '../../../shell/detail/FormBar'
import { Field } from '../../../platform/ui/Field'
import { CHIP, field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { LinkedSection } from '../../../shell/links/Links'
import { useRecordRecent } from '../../../shell/search/recent'
import { useDestroy } from '../../../shell/detail/useDestroy'
import { useNow } from '../../../platform/time/useNow'

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

/** When to finish it -- the same named days the row's menu offers. */
const PLAN_LABELS: Record<PlanDay, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This week',
  nextWeek: 'Next week',
}

export function ReadingDetail({
  item,
  onClose,
}: {
  item: ReadingItemResponse
  onClose: () => void
}) {
  useRecordRecent(recentEntry(item))
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
  const [editing, setEditing] = useState(false)
  const timeZone = useTimeZone()
  const today = todayIn(timeZone, useNow())

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchReadingItem>[1]) => patchReadingItem(item.id, patch),
  })

  const head = <BackHead to="/reading" label="Reading" onClose={onClose} />

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        {head}
        <ReadingForm
          item={item}
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
              className="block truncate text-lg font-semibold text-ink hover:underline"
            >
              {readingLabel(item)}
            </a>
          ) : (
            <h2 className="truncate text-lg font-semibold text-ink">{readingLabel(item)}</h2>
          )}
          {/* 第二行写的是「这是什么」：一本书的作者，或者一条链接的出处。 */}
          <p className="truncate text-sm text-ink-muted">
            {item.kind === 'book' ? (item.author ?? 'Book') : (item.url ?? 'Link')}
          </p>
        </div>
        <button type="button" className={BUTTON.secondary} onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>

      {item.fetchedSummary && !item.title && (
        <p className="max-w-[68ch] text-sm text-ink-muted">{item.fetchedSummary}</p>
      )}

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          <Field label="Status" shape="above">
            <span className="text-sm text-ink">{STATUS_LABEL[item.status]}</span>
          </Field>
          <Field label="Finish by" shape="above">
            <span className={`text-sm ${item.planOn ? 'text-ink' : 'text-ink-subtle'}`}>
              {item.planOn ? dayPhrase(item.planOn, today) : 'Not set'}
            </span>
          </Field>
          <Field label="Projects" shape="above">
            {/* A chip, like a person's projects and a meeting's. */}
            {item.projectId && item.projectName ? (
              <span className="flex">
                <span className={CHIP}>
                  <ProjectChip projectId={item.projectId} />
                  <span className="truncate">{item.projectName}</span>
                </span>
              </span>
            ) : (
              <span className="text-sm text-ink-subtle">Not on any project</span>
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
  busy,
  onCancel,
  onSave,
}: {
  item: ReadingItemResponse
  busy: boolean
  onCancel: () => void
  onSave: (patch: Parameters<typeof patchReadingItem>[1]) => void
}) {
  const [title, setTitle] = useState(item.title ?? '')
  const [url, setUrl] = useState(item.url ?? '')
  const [author, setAuthor] = useState(item.author ?? '')
  const [status, setStatus] = useState<ReadingStatus>(item.status)
  const [planOn, setPlanOn] = useState(item.planOn)
  const [projectId, setProjectId] = useState<string | null>(item.projectId)
  const timeZone = useTimeZone()
  const today = todayIn(timeZone, useNow())
  const composing = useComposing()

  const submit = () => {
    // A link's title can be cleared, and it goes back to showing its address; a book without a
    // title is not a book.
    if (busy || (item.kind === 'book' && title.trim() === '')) return
    onSave({
      title: title.trim() || null,
      ...(item.kind === 'link' && url.trim() !== '' ? { url: url.trim() } : {}),
      ...(item.kind === 'book' ? { author: author.trim() || null } : {}),
      status,
      planOn,
      projectId,
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
      <FormBar busy={busy} onCancel={onCancel} />

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
              choices={[
                { value: '', label: 'Not set' },
                ...planChoices(today, item.planOn, PLAN_LABELS),
              ]}
              onPick={(v) => setPlanOn(v === '' ? null : v)}
            />
          </Field>
          <Field label="Projects" shape="above">
            <ProjectPicker value={projectId} onPick={setProjectId} none="Not on any project" />
          </Field>
        </div>
      </div>
    </form>
  )
}

/** 删掉一条读物。位置和别的东西一样：这个面的最底下，问一次。 */
function DeleteReading({ item, onDeleted }: { item: ReadingItemResponse; onDeleted: () => void }) {
  const drop = useDestroy({
    type: 'reading',
    id: item.id,
    remove: () => deleteReadingItem(item.id),
    awaits: [['reading']],
    onDone: onDeleted,
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
