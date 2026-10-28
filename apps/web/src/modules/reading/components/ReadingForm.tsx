import {
  type ReadingItemResponse,
  type ReadingStatus,
  type UpdateReadingItemBody,
} from '@ctws/contracts'
import { problemText } from '../../../platform/http/api'
import { deleteReadingItem, readingKeys } from '../api'
import { READING_STATUS_LABEL, readingLabel } from '../logic/item'
import { ProjectPicker } from '../../../shell/projects'
import { ymd } from '../../../platform/time/dates'
import { planChoices, type PlanDay } from '../logic/plans'
import { useTimeZone } from '../../../shell/auth'
import { DangerAction } from '../../../platform/ui/DangerZone'
import { useReportUnsaved } from '../../../platform/ui/unsavedGuard'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { readingDefaults, readingForm, type ReadingForm } from '../logic/readingForm'
import { FormBar, useDestroy } from '../../../shell/detail'
import { Field } from '../../../platform/ui/Field'
import { field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { useNow } from '../../../platform/time/useNow'

export const STATUS_CHOICES = (Object.keys(READING_STATUS_LABEL) as ReadingStatus[]).map((s) => ({
  value: s,
  label: READING_STATUS_LABEL[s],
}))

const PLAN_LABELS: Record<PlanDay, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This week',
  nextWeek: 'Next week',
}

/** The edit form. The kind is not editable: a link never becomes a book. */
export function ReadingForm({
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
  /** Whether anything differs from what the form opened on, for the page's leave guard. */
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
      <FormBar busy={busy} failed={error} onCancel={onCancel} />

      <div>
        <label htmlFor="r-title" className={label}>
          Title
        </label>
        <input
          id="r-title"
          autoFocus
          {...form.register('title')}
          placeholder={item.kind === 'link' ? readingLabel({ title: null, url: item.url }) : ''}
          className={`${field} mt-1.5 text-subject`}
        />
      </div>

      {item.kind === 'link' ? (
        <div>
          <label htmlFor="r-url" className={label}>
            Link
          </label>
          <input id="r-url" {...form.register('url')} className={`${field} mt-1.5 text-ui`} />
        </div>
      ) : (
        <div>
          <label htmlFor="r-author" className={label}>
            Author
          </label>
          <input id="r-author" {...form.register('author')} className={`${field} mt-1.5 text-ui`} />
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

export function DeleteReading({
  item,
  onDeleted,
}: {
  item: ReadingItemResponse
  onDeleted: () => void
}) {
  const drop = useDestroy({
    type: 'reading',
    id: item.id,
    remove: () => deleteReadingItem(item.id),
    awaits: [readingKeys.all],
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
        <p role="alert" className="text-ui text-stop-t">
          {problemText(drop.error)}
        </p>
      )}
    </>
  )
}
