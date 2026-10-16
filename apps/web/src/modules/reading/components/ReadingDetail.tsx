import { type ReadingItemResponse, type ReadingStatus, type ProjectId } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { problemText } from '../../../platform/http/api'
import { deleteReadingItem, patchReadingItem } from '../api'
import { readingLabel, recentEntry } from '../item'
import { ProjectChip, ProjectPicker } from '../../../shell/projects'
import { dayPhrase, ymd } from '../../../platform/time/dates'
import { planChoices, type PlanDay } from '../plans'
import { useTimeZone } from '../../../shell/auth'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { DangerAction, DangerZone } from '../../../platform/ui/DangerZone'
import { DetailPane } from '../../../platform/ui/DetailPane'
import { UnsavedAsk } from '../../../platform/ui/UnsavedAsk'
import { useReportUnsaved, useUnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { BackHead, FormBar, useDestroy } from '../../../shell/detail'
import { Field } from '../../../platform/ui/Field'
import { CHIP, field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { LinkedSection } from '../../../shell/links'
import { useRecordRecent } from '../../../shell/search'
import { useNow } from '../../../platform/time/useNow'

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
  // Escape, the scrim and the close button ask first when the form has unsaved changes.
  const [unsaved, setUnsaved] = useState(false)
  const guard = useUnsavedGuard(unsaved)
  const requestClose = () => guard.leave(onClose)
  return (
    <DetailPane label="Reading" onClose={requestClose}>
      <ReadingFields
        item={item}
        onClose={requestClose}
        ask={<UnsavedAsk guard={guard} />}
        onUnsaved={setUnsaved}
      />

      <LinkedSection of={{ type: 'reading', id: item.id }} className="mt-4" />

      <DangerZone>
        <DeleteReading item={item} onDeleted={onClose} />
      </DangerZone>
    </DetailPane>
  )
}

function ReadingFields({
  item,
  onClose,
  ask,
  onUnsaved,
}: {
  item: ReadingItemResponse
  onClose: () => void
  /** The leave guard's question, drawn under the head. */
  ask: ReactNode
  onUnsaved: (unsaved: boolean) => void
}) {
  const [editing, setEditing] = useState(false)
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)

  // Waits for the list, so the reading that replaces the form already shows the edit.
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchReadingItem>[1]) => patchReadingItem(item.id, patch),
    meta: { awaits: [['reading']] },
  })

  const head = <BackHead to="/reading" label="Reading" onClose={onClose} />

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        {head}
        {ask}
        <ReadingForm
          item={item}
          busy={save.isPending}
          error={problemText(save.error)}
          onCancel={() => {
            save.reset()
            setEditing(false)
          }}
          onSave={(patch) => save.mutate(patch, { onSuccess: () => setEditing(false) })}
          onUnsaved={onUnsaved}
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
          <Field label="Status">
            <span className="text-sm text-ink">{STATUS_LABEL[item.status]}</span>
          </Field>
          <Field label="Finish by">
            <span className={`text-sm ${item.planOn ? 'text-ink' : 'text-ink-subtle'}`}>
              {item.planOn ? dayPhrase(item.planOn, today) : 'Not set'}
            </span>
          </Field>
          <Field label="Projects">
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

/** The edit form. The kind is not editable: a link never becomes a book. */
function ReadingForm({
  item,
  busy,
  error,
  onCancel,
  onSave,
  onUnsaved,
}: {
  item: ReadingItemResponse
  busy: boolean
  /** Why the server refused the last Save; the form stays open with what was typed. */
  error: string | null
  onCancel: () => void
  onSave: (patch: Parameters<typeof patchReadingItem>[1]) => void
  /** Whether anything differs from what the form opened on, for the pane's leave guard. */
  onUnsaved: (unsaved: boolean) => void
}) {
  const [title, setTitle] = useState(item.title ?? '')
  const [url, setUrl] = useState(item.url ?? '')
  const [author, setAuthor] = useState(item.author ?? '')
  const [status, setStatus] = useState<ReadingStatus>(item.status)
  const [planOn, setPlanOn] = useState(item.planOn)
  const [projectId, setProjectId] = useState<ProjectId | null>(item.projectId)
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  useReportUnsaved([title, url, author, status, planOn, projectId], busy, onUnsaved)

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
      className="flex flex-col gap-4"
    >
      <FormBar busy={busy} onCancel={onCancel} />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

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
          <Field label="Status">
            <PickOne
              label="Status"
              value={status}
              choices={STATUS_CHOICES}
              onPick={(s) => setStatus(s as ReadingStatus)}
            />
          </Field>
          <Field label="Finish by">
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
          <Field label="Projects">
            <ProjectPicker value={projectId} onPick={setProjectId} none="Not on any project" />
          </Field>
        </div>
      </div>
    </form>
  )
}

function DeleteReading({ item, onDeleted }: { item: ReadingItemResponse; onDeleted: () => void }) {
  const drop = useDestroy({
    type: 'reading',
    id: item.id,
    remove: () => deleteReadingItem(item.id),
    awaits: [['reading']],
    onDone: onDeleted,
  })
  return (
    <>
      <DangerAction
        label="Delete item"
        confirmLabel="Confirm deleting this item"
        message={`Delete “${readingLabel(item)}”? This cannot be undone.`}
        busy={drop.isPending}
        onConfirm={() => drop.mutate()}
      />
      {drop.isError && (
        <p role="alert" className="text-sm text-danger">
          {problemText(drop.error)}
        </p>
      )}
    </>
  )
}
