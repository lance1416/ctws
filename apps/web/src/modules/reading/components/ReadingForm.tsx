import {
  idFrom,
  personId,
  type ReadingItemResponse,
  type ReadingStatus,
  type UpdateReadingItemBody,
} from '@ctws/contracts'
import { problemText } from '../../../platform/http/api'
import { deleteReadingItem, readingKeys } from '../api'
import { initialsOf, READING_STATUS_LABEL, readingLabel } from '../logic/item'
import { ProjectPicker } from '../../../shell/projects'
import { ymd } from '../../../platform/time/dates'
import { planChoices, type PlanDay } from '../logic/plans'
import { useTimeZone } from '../../../shell/auth'
import { DangerAction } from '../../../platform/ui/DangerZone'
import { useReportUnsaved } from '../../../platform/ui/unsavedGuard'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { readingDefaults, readingForm, type ReadingForm } from '../logic/readingForm'
import { FormBar, saveOnChord, useDestroy } from '../../../shell/detail'
import { Field } from '../../../platform/ui/Field'
import { boxed, field, label } from '../../../platform/ui/formStyles'
import { Avatar } from '../../../platform/ui/Avatar'
import { PickOne } from '../../../platform/ui/inline'
import { useNow } from '../../../platform/time/useNow'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { CloseIcon } from '../../../platform/ui/icons'
import { PickThing } from '../../../shell/search'
import { useState, type ReactNode } from 'react'

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
  const { status, planOn, projectId, recommendedBy } = form.watch()
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
      onKeyDown={saveOnChord}
      className="flex flex-col gap-4"
    >
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
            {/* Framed as a field (E-01), so it reads as one to open. */}
            <Boxed>
              <PickOne
                label="Status"
                value={status}
                choices={STATUS_CHOICES}
                onPick={(s) => form.setValue('status', s, dirty)}
              />
            </Boxed>
          </Field>
          <Field label="Finish by">
            <Boxed>
              <PickOne
                label="Finish by"
                value={planOn}
                choices={[
                  { value: null, label: 'Not set' },
                  ...planChoices(today, item.planOn, PLAN_LABELS),
                ]}
                onPick={(day) => form.setValue('planOn', day, dirty)}
              />
            </Boxed>
          </Field>
          <Field label="Projects">
            <Boxed>
              <ProjectPicker
                value={projectId}
                onPick={(id) => form.setValue('projectId', id, dirty)}
                none="Not on any project"
              />
            </Boxed>
          </Field>
          <Field label="Recommended by">
            <RecommendedBy
              item={item}
              value={recommendedBy}
              onPick={(who) => form.setValue('recommendedBy', who, dirty)}
            />
          </Field>
        </div>
      </div>

      <FormBar busy={busy} failed={error} onCancel={onCancel} title="Edit reading" />
    </form>
  )
}

/** A picker drawn as a field. */
const Boxed = ({ children }: { children: ReactNode }) => (
  <div className={`${boxed} flex items-center px-2`}>{children}</div>
)

type Recommender = ReadingForm['recommendedBy']

/**
 * Who recommended it (FR-073): one person, picked from people only, or nobody. The name is the
 * picker's trigger; the × beside it clears it.
 */
function RecommendedBy({
  item,
  value,
  onPick,
}: {
  item: ReadingItemResponse
  value: Recommender
  onPick: (who: Recommender) => void
}) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={() => setPicking(true)}
        aria-label={`Recommended by: ${value?.name ?? 'Nobody'}`}
        className="-mx-1.5 flex h-8 min-w-0 items-center rounded-control px-1.5 text-ui text-ink hover:bg-hover max-lg:min-h-11"
      >
        {/* The person as a tag, their avatar and name, as on the item's page (E-02). */}
        {value && <Avatar initials={initialsOf(value.name)} />}
        <span className={`ml-1.5 truncate ${value ? '' : 'text-subtle'}`}>
          {value?.name ?? 'Nobody'}
        </span>
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onPick(null)}
          aria-label="Clear who recommended it"
          title="Clear who recommended it"
          className={ICON_BUTTON}
        >
          <CloseIcon size={14} aria-hidden="true" />
        </button>
      )}
      {picking && (
        <PickThing
          of={{ type: 'reading', id: item.id }}
          title={`Who recommended “${readingLabel(item)}”?`}
          only="person"
          leaveOut={value ? [value.id] : []}
          busy={false}
          error={null}
          onPick={(thing) => {
            onPick({ id: idFrom(personId, thing.id), name: thing.title })
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
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
        label={`Delete ${readingLabel(item)}`}
        confirmLabel="Confirm deleting this item"
        // What goes, then what stays (FR-035).
        message={`Delete ${readingLabel(item)}? It goes from your reading. Notes about it, and the people, tasks and projects it is linked to, stay.`}
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
