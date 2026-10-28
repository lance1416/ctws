import type {
  CreateOrganisationBody,
  OrganisationResponse,
  UpdateOrganisationBody,
} from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { keyLabel } from '../../../platform/keyboard/keys'
import { BUTTON, KEY_ON_INK } from '../../../platform/ui/buttonStyles'
import { area, field, label } from '../../../platform/ui/formStyles'
import { DoneIcon, KIND_ICON, PlacesIcon, type IconComponent } from '../../../platform/ui/icons'
import { UnsavedAsk } from '../../../platform/ui/UnsavedAsk'
import { useUnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { PickCity } from '../../../shell/cities'
import { overviewQuery } from '../api'
import { OrganisationMark } from './OrganisationMark'

type Draft = {
  name: string
  type: string
  website: string
  city: string
  cityKey: string | null
  note: string
}

const draftOf = (o: OrganisationResponse | null): Draft => ({
  name: o?.name ?? '',
  type: o?.type ?? '',
  website: o?.website ?? '',
  city: o?.city ?? '',
  cityKey: o?.cityKey ?? null,
  note: o?.note ?? '',
})

const text = (v: string) => (v.trim() === '' ? null : v.trim())

/** A website typed without its scheme is read as https, as a browser's address bar does. */
const site = (v: string) => {
  const t = text(v)
  return t === null || /^https?:\/\//i.test(t) ? t : `https://${t}`
}

/**
 * WRITING AN ORGANISATION DOWN (FR-064, FR-065; the form after artboard 11): the name, its type
 * from the ones used so far or a new one, its website and city, and notes. Only the name is
 * needed; Ctrl Enter saves from any field. The same form edits one, filled.
 */
export function OrganisationEditor({
  organisation,
  typedName = null,
  busy,
  error,
  cancelTo,
  onSubmit,
  children,
}: {
  /** Null on New organisation. */
  organisation: OrganisationResponse | null
  /** The words New organisation was asked for under (a project's picker). */
  typedName?: string | null
  busy: boolean
  error: string | null
  cancelTo: string
  onSubmit: (body: CreateOrganisationBody & UpdateOrganisationBody) => void
  /** Under the form: an edit's delete. */
  children?: ReactNode
}) {
  const ids = useId()
  const [opened] = useState(() => draftOf(organisation))
  // What was typed counts as written: leaving asks, as it would had it been typed here.
  const [d, setDraft] = useState(() => (typedName ? { ...opened, name: typedName } : opened))
  const set = (patch: Partial<Draft>) => setDraft((was) => ({ ...was, ...patch }))
  const [unnamed, setUnnamed] = useState(false)
  const types = useQuery(overviewQuery()).data?.types.map((t) => t.type) ?? []
  const dirty = JSON.stringify(d) !== JSON.stringify(opened)
  const guard = useUnsavedGuard(dirty && !busy)

  const send = () => {
    if (text(d.name) === null) {
      setUnnamed(true)
      document.getElementById(`${ids}-name`)?.focus()
      return
    }
    onSubmit({
      name: d.name.trim(),
      type: text(d.type),
      website: site(d.website),
      city: text(d.city),
      cityKey: d.cityKey,
      note: text(d.note),
    })
  }

  return (
    <form
      noValidate
      aria-label={organisation ? `Edit ${organisation.name}` : 'New organisation'}
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) send()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return
        e.preventDefault()
        if (!busy) e.currentTarget.requestSubmit()
      }}
      // The actions come last in the document, so Tab reaches them after the last field, and sit
      // in the head on screen, as on New person.
      className="grid min-h-full shrink-0 grid-cols-[minmax(0,1fr)_auto] content-start gap-x-3 gap-y-4"
    >
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
        <OrganisationMark name={d.name.trim() || '?'} size={56} />
        <h1 tabIndex={-1} className="truncate text-title tracking-[-0.02em] focus:outline-none">
          {organisation ? `Edit ${organisation.name}` : 'New organisation'}
        </h1>
      </div>

      <div className="col-span-2 row-start-2 flex flex-col gap-3">
        {guard.asking && <UnsavedAsk guard={guard} />}
        {error && (
          <p role="alert" className="text-ui text-stop-t">
            {error}
          </p>
        )}
      </div>

      <div className="col-span-2 row-start-3 grid items-start gap-3 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <Group title="Name" icon={KIND_ICON.organisation}>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${ids}-name`} className={label}>
                Name
              </label>
              <input
                id={`${ids}-name`}
                value={d.name}
                autoFocus
                aria-invalid={unnamed || undefined}
                onChange={(e) => {
                  setUnnamed(false)
                  set({ name: e.target.value })
                }}
                className={field}
              />
              {unnamed && (
                <p role="alert" className="text-meta text-stop-t">
                  An organisation needs a name.
                </p>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${ids}-type`} className={label}>
                Type
              </label>
              <input
                id={`${ids}-type`}
                value={d.type}
                placeholder="Company, Law firm, School"
                onChange={(e) => set({ type: e.target.value })}
                className={field}
              />
              {/* The types used so far, one press each; a new one is just typed. */}
              {types.length > 0 && (
                <div role="group" aria-label="Types used so far" className="flex flex-wrap gap-1">
                  {types.map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={d.type.trim() === t}
                      onClick={() => set({ type: t })}
                      className="inline-flex h-6 items-center rounded-control bg-hover px-2 text-meta text-muted hover:text-ink aria-pressed:bg-select aria-pressed:font-medium aria-pressed:text-ink"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Group>
          <Group title="About" icon={PlacesIcon}>
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${ids}-website`} className={label}>
                Website
              </label>
              <input
                id={`${ids}-website`}
                value={d.website}
                inputMode="url"
                placeholder="example.com"
                onChange={(e) => set({ website: e.target.value })}
                className={field}
              />
            </div>
            <PickCity
              id={`${ids}-city`}
              label="City"
              value={d.city}
              onChange={(city) => set({ city })}
              onPick={(c) => set({ cityKey: c?.key ?? null })}
            />
          </Group>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <Group title="Notes" icon={KIND_ICON.note}>
            <textarea
              aria-label="Notes"
              placeholder="What you want to remember"
              value={d.note}
              onChange={(e) => set({ note: e.target.value })}
              rows={5}
              className={area}
            />
          </Group>
        </div>
      </div>

      {children && <div className="col-span-2 row-start-4">{children}</div>}

      <div className="col-start-2 row-start-1 flex items-center gap-2 self-center">
        <Link to={cancelTo} className={BUTTON.quiet}>
          Cancel
        </Link>
        <button type="submit" disabled={busy} className={BUTTON.primary}>
          <DoneIcon size={16} aria-hidden="true" />
          {organisation ? 'Save' : 'Create organisation'}
          <kbd className={KEY_ON_INK}>{keyLabel('Ctrl Enter')}</kbd>
        </button>
      </div>
    </form>
  )
}

/** One group of the form, a block with its icon and title. */
function Group({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: IconComponent
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col rounded-block border border-line bg-panel"
    >
      <h2 className="flex h-10 items-center gap-2 px-3 text-ui font-medium text-ink">
        <Icon size={16} aria-hidden="true" className="text-muted" />
        {title}
      </h2>
      <div className="flex flex-col gap-3 px-3 pb-3">{children}</div>
    </section>
  )
}
