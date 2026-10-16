import {
  type ReadingItemResponse,
  type ReadingStatus,
  type UpdateReadingItemBody,
} from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { problemText } from '../../../platform/http/api'
import { deleteReadingItem, patchReadingItem } from '../api'
import { readingLabel, recentEntry } from '../logic/item'
import { ProjectChip, ProjectPicker } from '../../../shell/projects'
import { dayPhrase, ymd } from '../../../platform/time/dates'
import { planChoices, type PlanDay } from '../logic/plans'
import { useTimeZone } from '../../../shell/auth'
import { Button } from '../../../platform/ui/Button'
import { DangerAction } from '../../../platform/ui/DangerZone'
import { useReportUnsaved } from '../../../platform/ui/unsavedGuard'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { readingDefaults, readingForm, type ReadingForm } from '../logic/readingForm'
import { FormBar, ItemPane, useDestroy, useItemPane } from '../../../shell/detail'
import { Field } from '../../../platform/ui/Field'
import { CHIP, field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
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
  const pane = useItemPane(onClose)
  return (
    <ItemPane
      pane={pane}
      label="Reading"
      back="/reading"
      recent={recentEntry(item)}
      linked={{ of: { type: 'reading', id: item.id } }}
      danger={<DeleteReading item={item} onDeleted={onClose} />}
    >
      <ReadingFields item={item} pane={pane} />
    </ItemPane>
  )
}

function ReadingFields({
  item,
  pane,
}: {
  item: ReadingItemResponse
  pane: Pick<ReturnType<typeof useItemPane>, 'editing' | 'setEditing' | 'onUnsaved'>
}) {
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)

  // Waits for the list, so the reading that replaces the form already shows the edit.
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof patchReadingItem>[1]) => patchReadingItem(item.id, patch),
    meta: { awaits: [['reading']], ownsError: true },
  })

  if (pane.editing) {
    return (
      <ReadingForm
        item={item}
        busy={save.isPending}
        error={problemText(save.error)}
        onCancel={() => {
          save.reset()
          pane.setEditing(false)
        }}
        onSave={(patch) => save.mutate(patch, { onSuccess: () => pane.setEditing(false) })}
        onUnsaved={pane.onUnsaved}
      />
    )
  }

  return (
    <>
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
        <Button look="secondary" onClick={() => pane.setEditing(true)}>
          Edit
        </Button>
      </div>

      {item.fetchedSummary && !item.title && (
        <p className="max-w-reading text-sm text-ink-muted">{item.fetchedSummary}</p>
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
    </>
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
  onSave: (patch: UpdateReadingItemBody) => void
  /** Whether anything differs from what the form opened on, for the pane's leave guard. */
  onUnsaved: (unsaved: boolean) => void
}) {
  const form = useForm<ReadingForm, unknown, UpdateReadingItemBody>({
    resolver: zodResolver(readingForm),
    defaultValues: readingDefaults(item),
    // A book with no title is simply not saved, as before; focus stays where it is.
    shouldFocusError: false,
  })
  const { status, planOn, projectId } = form.watch()
  const dirty = { shouldDirty: true }
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  useReportUnsaved(form.formState.isDirty && !busy, onUnsaved)

  return (
    <form
      aria-label="Edit reading item"
      onSubmit={form.handleSubmit((patch) => {
        if (!busy) onSave(patch)
      })}
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
          {...form.register('title')}
          placeholder={item.kind === 'link' ? readingLabel({ title: null, url: item.url }) : ''}
          className={`${field} mt-1.5 text-lg font-semibold`}
        />
      </div>

      {item.kind === 'link' ? (
        <div>
          <label htmlFor="r-url" className={label}>
            Link
          </label>
          <input id="r-url" {...form.register('url')} className={`${field} mt-1.5 text-sm`} />
        </div>
      ) : (
        <div>
          <label htmlFor="r-author" className={label}>
            Author
          </label>
          <input id="r-author" {...form.register('author')} className={`${field} mt-1.5 text-sm`} />
        </div>
      )}

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          <Field label="Status">
            <PickOne
              label="Status"
              value={status}
              choices={STATUS_CHOICES}
              onPick={(s) => form.setValue('status', s, dirty)}
            />
          </Field>
          <Field label="Finish by">
            <PickOne
              label="Finish by"
              value={planOn}
              choices={[
                { value: null, label: 'Not set' },
                ...planChoices(today, item.planOn, PLAN_LABELS),
              ]}
              onPick={(day) => form.setValue('planOn', day, dirty)}
            />
          </Field>
          <Field label="Projects">
            <ProjectPicker
              value={projectId}
              onPick={(id) => form.setValue('projectId', id, dirty)}
              none="Not on any project"
            />
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
