import {
  type CircleId,
  type CreatePersonBody,
  type Gender,
  type OrganisationId,
  type PersonResponse,
  type PersonRoleInput,
  type ProjectId,
  type UpdatePersonBody,
} from '@ctws/contracts'
import { PhoneFormBar } from '../../../platform/ui/PhoneFormBar'
import { avatarInitials, clockTime, displayName, splitName } from '@ctws/core'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useComposing } from '../../../platform/keyboard/composition'
import { keyLabel } from '../../../platform/keyboard/keys'
import { useDebouncedValue } from '../../../platform/time/useDebouncedValue'
import { useNow } from '../../../platform/time/useNow'
import { Avatar } from '../../../platform/ui/Avatar'
import { BUTTON, CHOSEN, KEY_ON_INK } from '../../../platform/ui/buttonStyles'
import { area, boxed, field, label } from '../../../platform/ui/formStyles'
import {
  CakeIcon,
  CirclesIcon,
  CloseIcon,
  ContactIcon,
  DoneIcon,
  KIND_ICON,
  NewIcon,
  PlacesIcon,
  type IconComponent,
} from '../../../platform/ui/icons'
import { LAYER } from '../../../platform/ui/layers'
import { ZoneBox, zoneFrom } from '../../../platform/ui/ZoneBox'
import { UnsavedAsk } from '../../../platform/ui/UnsavedAsk'
import { useUnsavedGuard } from '../../../platform/ui/unsavedGuard'
import { useAccountToday } from '../../../shell/auth'
import { PickCity } from '../../../shell/cities'
import { DayField } from '../../../shell/dates'
import {
  circlesQuery,
  createOrganisation,
  organisationSearchQuery,
  peopleKeys,
  putCircles,
  type BirthdayDraft,
} from '../api'
import { BirthdayEditor } from '../birthday/BirthdayEditor'
import { byKind } from '../logic/channels'
import { cityAndCountry } from '../logic/places'
import { GENDER_CHOICES } from '../logic/labels'
import { setNewPersonDraft } from '../logic/newPersonDraft'
import { ChannelsEditor, useChannelRows } from './ChannelsEditor'
import { useSortKey } from '../hooks/useSortKey'

const PersonIcon = KIND_ICON.person
const OrganisationIcon = KIND_ICON.organisation
const NoteIcon = KIND_ICON.note

type Alias = { key: number; name: string; label: string }

/** A role as the form holds it: an organisation picked (an id) or only named (to be added). */
type Role = {
  key: number
  organisationId: OrganisationId | null
  organisationName: string
  title: string
  from: string | null
  to: string | null
}

/** Everything the form holds but the addresses and the birthday, which keep their own state. */
type Draft = {
  givenName: string
  middleName: string
  familyName: string
  aliases: Alias[]
  roles: Role[]
  city: string
  cityKey: string | null
  /** The zone of the city they live in, when it is known. */
  cityZone: string | null
  hometown: string
  hometownKey: string | null
  /** Set by hand; otherwise the zone is the city's (FR-063). */
  manualZone: string | null
  circleIds: CircleId[]
  gender: Gender | null
  note: string
}

let keys = 0
const nextKey = () => ++keys

function draftOf(person: PersonResponse | null): Draft {
  return {
    givenName: person?.givenName ?? '',
    middleName: person?.middleName ?? '',
    familyName: person?.familyName ?? '',
    aliases: (person?.aliases ?? []).map((a) => ({
      key: nextKey(),
      name: a.name,
      label: a.label ?? '',
    })),
    roles: (person?.roles ?? []).map((r) => ({
      key: nextKey(),
      organisationId: r.organisationId,
      organisationName: r.organisationName,
      title: r.title ?? '',
      from: r.from,
      to: r.to,
    })),
    city: person?.city ?? '',
    cityKey: person?.cityKey ?? null,
    cityZone: person?.timeZoneSource === 'city' ? person.timeZone : null,
    hometown: person?.hometown ?? '',
    hometownKey: person?.hometownKey ?? null,
    manualZone: person?.timeZoneSource === 'manual' ? person.timeZone : null,
    circleIds: person?.circleIds ?? [],
    gender: person?.gender ?? null,
    note: person?.note ?? '',
  }
}

/** A name typed as one string, in the form's three boxes. */
function namedParts(name: string): Pick<Draft, 'givenName' | 'middleName' | 'familyName'> {
  const parts = splitName(name)
  return {
    givenName: parts.givenName,
    middleName: parts.middleName ?? '',
    familyName: parts.familyName ?? '',
  }
}

const text = (v: string) => (v.trim() === '' ? null : v.trim())

/** Who is written down, as Create or Save sends it; roles go after, as their own list. */
export type PersonWrite = {
  body: CreatePersonBody & UpdatePersonBody
  /** The roles, with the organisations only named so far to be added first. */
  roles: () => Promise<PersonRoleInput[]>
  rolesChanged: boolean
}

/**
 * WRITING A PERSON DOWN (FR-062, FR-063, artboard 11): every field at once, grouped, the name's
 * preview and the person's time as they are typed; Tab runs from the first field to Create, and
 * Ctrl Enter sends it from any field. Only the name is needed. The same form edits them, filled.
 */
export function PersonEditor({
  person,
  projectId = null,
  typedName = null,
  busy,
  error,
  cancelTo,
  onSubmit,
  children,
}: {
  /** Null on New person. */
  person: PersonResponse | null
  /** The project New person was asked for from, kept on them (FR-055). */
  projectId?: ProjectId | null
  /** The words New person was asked for under (a project's picker): split into the name's parts. */
  typedName?: string | null
  busy: boolean
  error: string | null
  cancelTo: string
  onSubmit: (write: PersonWrite) => void
  /** Under the form: an edit's delete. */
  children?: ReactNode
}) {
  const ids = useId()
  const qc = useQueryClient()
  const today = useAccountToday()
  const now = useNow()
  const [opened] = useState(() => draftOf(person))
  // What was typed counts as written: leaving asks, as it would had it been typed here.
  const [d, setDraft] = useState(() =>
    typedName ? { ...opened, ...namedParts(typedName) } : opened,
  )
  const set = (patch: Partial<Draft>) => setDraft((was) => ({ ...was, ...patch }))
  const channels = useChannelRows(() =>
    person
      ? byKind(person.channels).map((c) => ({ ...c, saved: true }))
      : [{ kind: 'email', value: '', label: null }],
  )
  // Left alone, the birthday is not written: `undefined`. Cleared, `null`.
  const [birthday, setBirthday] = useState<BirthdayDraft | null | undefined>(undefined)
  const [badDay, setBadDay] = useState(false)
  // Folded until asked for: an open grid with a day picked reads as a birthday given.
  // Bumped to start the birthday controls afresh, after a day picked on New person is cleared.
  const [dayKey, setDayKey] = useState(0)
  const [unnamed, setUnnamed] = useState(false)
  // The row Another name or Another role just added: its first box takes the typing (BUG-085).
  const [added, setAdded] = useState<number | null>(null)

  const parts = {
    givenName: d.givenName.trim(),
    middleName: text(d.middleName),
    familyName: text(d.familyName),
  }
  const named = parts.givenName !== '' || parts.familyName !== null
  // A family name alone is the name they go by.
  const shown = parts.givenName
    ? displayName(parts)
    : displayName({ givenName: parts.familyName ?? '', middleName: null, familyName: null })
  const sortKey = useSortKey()
  const filed =
    named && sortKey
      ? sortKey(parts.givenName ? parts : { ...parts, givenName: parts.familyName ?? '' })
      : null
  const initials = named
    ? avatarInitials(
        parts.givenName ? parts : { givenName: parts.familyName ?? '', familyName: null },
      )
    : null

  // The sidebar holds a place for them, marked New, while they are written down (FR-062).
  useEffect(() => {
    if (person) return
    setNewPersonDraft(named && filed && initials ? { name: shown, sortKey: filed, initials } : null)
  }, [person, named, shown, filed, initials])
  useEffect(() => () => setNewPersonDraft(null), [])

  const rolesChanged =
    JSON.stringify(d.roles.map(({ key: _, ...r }) => r)) !==
    JSON.stringify(opened.roles.map(({ key: _, ...r }) => r))
  const dirty =
    JSON.stringify({ ...d, aliases: d.aliases.map(({ key: _, ...a }) => a), roles: [] }) !==
      JSON.stringify({
        ...opened,
        aliases: opened.aliases.map(({ key: _, ...a }) => a),
        roles: [],
      }) ||
    rolesChanged ||
    channels.changed() ||
    birthday !== undefined
  const guard = useUnsavedGuard(dirty && !busy)

  const zone = d.manualZone ?? d.cityZone

  const send = () => {
    if (!named) {
      setUnnamed(true)
      return
    }
    if (channels.bad || badDay) return
    const roles = d.roles.filter((r) => r.organisationId || r.organisationName.trim())
    onSubmit({
      body: {
        givenName: parts.givenName || (parts.familyName ?? ''),
        middleName: parts.givenName ? parts.middleName : null,
        familyName: parts.givenName ? parts.familyName : null,
        aliases: d.aliases
          .filter((a) => a.name.trim())
          .map((a) => ({ name: a.name.trim(), label: text(a.label) })),
        circleIds: d.circleIds,
        city: text(d.city),
        cityKey: text(d.city) ? d.cityKey : null,
        hometown: text(d.hometown),
        hometownKey: text(d.hometown) ? d.hometownKey : null,
        timeZone: d.manualZone,
        gender: d.gender,
        note: text(d.note),
        channels: channels.toSave(),
        ...(birthday === undefined ? {} : { birthday }),
        ...(person === null && projectId ? { projectIds: [projectId] } : {}),
      },
      rolesChanged: rolesChanged || (person === null && roles.length > 0),
      roles: async () => {
        const out: PersonRoleInput[] = []
        for (const r of roles) {
          const organisationId =
            r.organisationId ?? (await createOrganisation(r.organisationName.trim()))
          out.push({ organisationId, title: text(r.title), from: r.from, to: r.to })
        }
        // New organisations are in the list now.
        void qc.invalidateQueries({ queryKey: ['organisations'] })
        return out
      },
    })
  }

  const nowRoles = d.roles.filter((r) => r.to === null).length
  const beforeRoles = d.roles.length - nowRoles

  return (
    <form
      noValidate
      aria-label={person ? `Edit ${person.name}` : 'New person'}
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
      // in the head on screen (FR-062).
      className="grid min-h-full shrink-0 grid-cols-[minmax(0,1fr)_auto] content-start gap-x-3 gap-y-4"
    >
      <div data-form-head className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
        <Avatar initials={initials} size={56} />
        <div className="flex min-w-0 flex-col">
          <h1 tabIndex={-1} className="truncate text-title tracking-[-0.02em] focus:outline-none">
            {person ? `Edit ${person.name}` : 'New person'}
          </h1>
          <p data-name-preview className="text-meta text-muted">
            {named
              ? `Shown as ${shown}.${filed ? ` Sorted under ${filed}.` : ''}`
              : 'Shown as their name, once given.'}
          </p>
        </div>
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
          <Block title="Name" icon={PersonIcon}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Text
                id={`${ids}-given`}
                label="Given name"
                value={d.givenName}
                autoFocus
                invalid={unnamed}
                onChange={(givenName) => {
                  setUnnamed(false)
                  set({ givenName })
                }}
              />
              <Text
                id={`${ids}-middle`}
                label="Middle name"
                placeholder="Optional"
                value={d.middleName}
                onChange={(middleName) => set({ middleName })}
              />
              <Text
                id={`${ids}-family`}
                label="Family name"
                value={d.familyName}
                invalid={unnamed}
                onChange={(familyName) => {
                  setUnnamed(false)
                  set({ familyName })
                }}
              />
            </div>
            {unnamed && (
              <p role="alert" className="text-meta text-stop-t">
                Give them a name.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <span className={label}>Other names</span>
              {d.aliases.map((a, i) => (
                <div key={a.key} className="flex items-center gap-2">
                  <input
                    autoFocus={a.key === added}
                    aria-label={`Label of other name ${i + 1}`}
                    placeholder="Label"
                    value={a.label}
                    onChange={(e) =>
                      set({
                        aliases: d.aliases.map((x) =>
                          x.key === a.key ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                    className={`${boxed} w-36 shrink-0`}
                  />
                  <input
                    aria-label={`Other name ${i + 1}`}
                    placeholder="Name"
                    value={a.name}
                    onChange={(e) =>
                      set({
                        aliases: d.aliases.map((x) =>
                          x.key === a.key ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                    className={`${boxed} min-w-0 flex-1`}
                  />
                  <Remove
                    what={`other name ${i + 1}`}
                    onRemove={() => set({ aliases: d.aliases.filter((x) => x.key !== a.key) })}
                  />
                </div>
              ))}
              <Another
                onAdd={() => {
                  const key = nextKey()
                  setAdded(key)
                  set({ aliases: [...d.aliases, { key, name: '', label: '' }] })
                }}
              >
                Another name
              </Another>
            </div>
          </Block>

          <Block
            title="Work"
            icon={OrganisationIcon}
            note={
              d.roles.length === 0
                ? null
                : [
                    nowRoles > 0 ? `${nowRoles} now` : null,
                    beforeRoles > 0 ? `${beforeRoles} before` : null,
                  ]
                    .filter(Boolean)
                    .join(', ')
            }
          >
            {d.roles.length > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_6rem_6rem_auto] items-center gap-2 max-lg:grid-cols-1 max-lg:gap-3">
                {['Organisation', 'Role', 'From', 'To'].map((h) => (
                  <span key={h} aria-hidden="true" className={`${label} max-lg:hidden`}>
                    {h}
                  </span>
                ))}
                <span className="max-lg:hidden" />
                {d.roles.map((r, i) => {
                  const change = (patch: Partial<Role>) =>
                    set({ roles: d.roles.map((x) => (x.key === r.key ? { ...x, ...patch } : x)) })
                  return (
                    <RoleRow
                      key={r.key}
                      at={i + 1}
                      role={r}
                      fresh={r.key === added}
                      today={today}
                      onChange={change}
                      onRemove={() => set({ roles: d.roles.filter((x) => x.key !== r.key) })}
                    />
                  )
                })}
              </div>
            )}
            <Another
              onAdd={() => {
                const key = nextKey()
                setAdded(key)
                set({
                  roles: [
                    ...d.roles,
                    {
                      key,
                      organisationId: null,
                      organisationName: '',
                      title: '',
                      from: null,
                      to: null,
                    },
                  ],
                })
              }}
            >
              Another role
            </Another>
          </Block>

          <Block title="Places and time" icon={PlacesIcon}>
            <div className="grid gap-3 sm:grid-cols-2">
              <PickCity
                id={`${ids}-city`}
                label="Lives in"
                value={d.city}
                shown={d.cityKey ? cityAndCountry(d.city) : undefined}
                onChange={(city) => set({ city })}
                onPick={(c) => set({ cityKey: c?.key ?? null, cityZone: c?.timeZone ?? null })}
              />
              <PickCity
                id={`${ids}-hometown`}
                label="Hometown"
                value={d.hometown}
                shown={d.hometownKey ? cityAndCountry(d.hometown) : undefined}
                onChange={(hometown) => set({ hometown })}
                onPick={(c) => set({ hometownKey: c?.key ?? null })}
              />
            </div>
            <ZoneLine
              zone={zone}
              fromCity={d.manualZone === null && d.cityZone !== null}
              now={now}
              onZone={(manualZone) => set({ manualZone })}
            />
          </Block>

          <Block title="Circles" icon={CirclesIcon} note="Pick any">
            <Circles picked={d.circleIds} onPick={(circleIds) => set({ circleIds })} />
            <fieldset className="flex flex-wrap items-center gap-3">
              {/* Centred on the 32 of the choices beside it by the box, not by a tall line. */}
              <legend className={`${label} float-left mr-3 flex h-8 items-center`}>Gender</legend>
              <div className="flex gap-0.5 rounded-control bg-hover p-0.5">
                {GENDER_CHOICES.map((g) => (
                  <label
                    key={g.label}
                    className="flex h-7 cursor-pointer items-center rounded-control px-2.5 text-ui text-muted max-lg:tap has-[:checked]:bg-panel has-[:checked]:font-medium has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-task"
                  >
                    <input
                      type="radio"
                      name={`${ids}-gender`}
                      checked={d.gender === g.value}
                      onChange={() => set({ gender: g.value })}
                      className="sr-only"
                    />
                    {g.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </Block>
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Block title="Ways to reach them" icon={ContactIcon}>
            <ChannelsEditor channels={channels} />
          </Block>

          <Block title="Birthday" icon={CakeIcon} tint="text-person">
            {/* Out from the start, nothing chosen until a day is picked (FR-062, N-01). */}
            {birthday === null ? (
              <p className="flex items-center gap-2 text-ui text-muted">
                No birthday.
                <button
                  type="button"
                  onClick={() => setBirthday(undefined)}
                  className={BUTTON.link}
                >
                  Undo
                </button>
              </p>
            ) : (
              <>
                <BirthdayEditor
                  key={dayKey}
                  birthday={person?.birthday ?? null}
                  onChange={(draft, refused) => {
                    setBirthday(draft)
                    setBadDay(refused)
                  }}
                />
                {person?.birthday ? (
                  <button
                    type="button"
                    onClick={() => setBirthday(null)}
                    // Its words in line with the fields above; the hover keeps its padding.
                    className={`${BUTTON.inline} -ml-2 self-start`}
                  >
                    Remove the birthday
                  </button>
                ) : (
                  birthday !== undefined && (
                    <button
                      type="button"
                      onClick={() => {
                        setBirthday(undefined)
                        setBadDay(false)
                        setDayKey((k) => k + 1)
                      }}
                      className={`${BUTTON.inline} self-start`}
                    >
                      Clear the birthday
                    </button>
                  )
                )}
              </>
            )}
          </Block>

          <Block title="Notes" icon={NoteIcon}>
            <textarea
              aria-label="Notes"
              placeholder="What you want to remember"
              value={d.note}
              onChange={(e) => set({ note: e.target.value })}
              rows={5}
              className={area}
            />
          </Block>
        </div>
      </div>

      {children && <div className="col-span-2 row-start-4">{children}</div>}

      <PhoneFormBar
        title={person ? `Edit ${person.name}` : 'New person'}
        submit={person ? 'Save' : 'Create person'}
        disabled={busy || channels.bad || badDay}
        cancelTo={cancelTo}
      />
      <div className="col-start-2 row-start-1 flex items-center gap-2 self-center max-lg:hidden">
        <Link to={cancelTo} className={BUTTON.quiet}>
          Cancel
        </Link>
        <button type="submit" disabled={busy || channels.bad || badDay} className={BUTTON.primary}>
          <DoneIcon size={16} aria-hidden="true" />
          {person ? 'Save' : 'Create person'}
          <kbd className={KEY_ON_INK}>{keyLabel('Ctrl Enter')}</kbd>
        </button>
      </div>
    </form>
  )
}

/** One group of the form, a block with its icon and title (artboard 11). */
function Block({
  title,
  icon: Icon,
  tint = 'text-muted',
  note,
  children,
}: {
  title: string
  icon: IconComponent
  tint?: string
  note?: string | null
  children: ReactNode
}) {
  return (
    <section
      aria-label={title}
      className="flex min-w-0 flex-col rounded-block border border-line bg-panel"
    >
      <h2 className="flex h-10 items-center gap-2 px-3 text-ui font-medium text-ink">
        <Icon size={16} aria-hidden="true" className={tint} />
        {title}
        {note && <span className="text-meta font-normal text-subtle">{note}</span>}
      </h2>
      <div className="flex flex-col gap-3 px-3 pb-3">{children}</div>
    </section>
  )
}

function Text({
  id,
  label: name,
  value,
  onChange,
  placeholder,
  autoFocus = false,
  invalid = false,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  autoFocus?: boolean
  invalid?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={label}>
        {name}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={field}
      />
    </div>
  )
}

function Another({ onAdd, children }: { onAdd: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="inline-flex items-center gap-1.5 self-start rounded-control px-1 py-0.5 text-ui text-muted hover:text-ink max-lg:tap"
    >
      <NewIcon size={14} aria-hidden="true" />
      {children}
    </button>
  )
}

function Remove({ what, onRemove }: { what: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove ${what}`}
      className="inline-grid size-7 shrink-0 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink max-lg:tap"
    >
      <CloseIcon size={14} aria-hidden="true" />
    </button>
  )
}

/** One role: where, as what, from when, to when or Now (FR-047, FR-062). */
function RoleRow({
  at,
  role,
  fresh,
  today,
  onChange,
  onRemove,
}: {
  at: number
  role: Role
  /** Just added: its organisation box takes the typing. */
  fresh: boolean
  today: string
  onChange: (patch: Partial<Role>) => void
  onRemove: () => void
}) {
  return (
    // On a phone, two lines a role: where and as what, then from and to; its × at the end of the
    // first (DES-001 "表单").
    <div className="contents max-lg:grid max-lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] max-lg:items-center max-lg:gap-2">
      <OrganisationBox at={at} role={role} fresh={fresh} onChange={onChange} />
      <input
        aria-label={`Role ${at}`}
        value={role.title}
        onChange={(e) => onChange({ title: e.target.value })}
        className={`${boxed} min-w-0`}
      />
      <DayField
        mode="month"
        bare
        label={`Role ${at} from`}
        value={role.from}
        today={today}
        onChange={(from) => onChange({ from })}
      />
      {role.to === null ? (
        <button
          type="button"
          aria-label={`Role ${at} to: now. Set an end`}
          onClick={() => onChange({ to: today.slice(0, 7) })}
          className={`${boxed} flex items-center text-left`}
        >
          <span className="inline-flex h-5.5 items-center rounded-control bg-go-bg px-2 text-meta font-medium text-go-t">
            Now
          </span>
        </button>
      ) : (
        // Emptied, it is Now again: the box says so when there is nothing in it.
        <DayField
          mode="month"
          bare
          label={`Role ${at} to`}
          placeholder="Now"
          value={role.to}
          today={today}
          onChange={(to) => onChange({ to })}
        />
      )}
      <span className="contents max-lg:col-start-3 max-lg:row-start-1 max-lg:block">
        <Remove what={`role ${at}`} onRemove={onRemove} />
      </span>
    </div>
  )
}

/** An organisation for a role: one already known, picked from a search, or a new name to add. */
function OrganisationBox({
  at,
  role,
  fresh,
  onChange,
}: {
  at: number
  role: Role
  fresh: boolean
  onChange: (patch: Partial<Role>) => void
}) {
  const [typing, setTyping] = useState(false)
  // One picked from the list is its tag until it is pressed to change it (N-03).
  const [changing, setChanging] = useState(false)
  const listId = useId()
  const asked = useDebouncedValue(role.organisationName.trim())
  const hits = useQuery({
    ...organisationSearchQuery(asked),
    enabled: typing && asked.length > 0,
    placeholderData: keepPreviousData,
  })
  const composing = useComposing()
  const [pointed, setPointed] = useState(0)
  const found = typing && asked ? (hits.data ?? []) : []
  const exact = found.some((o) => o.name.toLowerCase() === asked.toLowerCase())
  const open = typing && asked.length > 0 && (found.length > 0 || !exact)
  // The rows the arrows walk: those found, then adding the name as a new one.
  const rows = [...found, ...(exact ? [] : [null])]
  const active = Math.min(pointed, Math.max(rows.length - 1, 0))
  // Until the list has caught up with the words, Enter has nothing to choose yet (BUG-082).
  const behind = role.organisationName.trim() !== asked || hits.isFetching
  const choose = (o: (typeof rows)[number]) => {
    if (o) onChange({ organisationId: o.id, organisationName: o.name })
    setTyping(false)
    setChanging(false)
  }
  if (role.organisationId && !changing)
    return (
      <button
        type="button"
        aria-label={`Organisation of role ${at}: ${role.organisationName}. Change it`}
        onClick={() => setChanging(true)}
        className={`${boxed} flex w-full min-w-0 items-center text-left`}
      >
        <span className="inline-flex h-5.5 min-w-0 items-center gap-1 rounded-control bg-organisation-bg px-2 text-meta font-medium text-organisation-t">
          <OrganisationIcon size={12} aria-hidden="true" className="shrink-0" />
          <span className="truncate">{role.organisationName}</span>
        </span>
      </button>
    )
  return (
    <div className="relative min-w-0">
      <input
        autoFocus={changing || fresh}
        aria-label={`Organisation of role ${at}`}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && rows.length > 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={role.organisationName}
        onChange={(e) => {
          setTyping(true)
          setPointed(0)
          onChange({ organisationName: e.target.value, organisationId: null })
        }}
        {...composing.bind}
        onKeyDown={(e) => {
          if (composing.composingNow(e) || !open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setPointed((active + 1) % rows.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setPointed((active - 1 + rows.length) % rows.length)
          } else if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
            // The list's Enter, never the form's.
            e.preventDefault()
            if (!behind) choose(rows[active] ?? null)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setTyping(false)
          }
        }}
        onBlur={() =>
          window.setTimeout(() => {
            setTyping(false)
            setChanging(false)
          }, 120)
        }
        className={`${boxed} w-full ${role.organisationId ? 'text-organisation-t' : ''}`}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className={`absolute ${LAYER.menu} mt-1 max-h-56 w-full min-w-48 overflow-y-auto rounded-block bg-float py-1 shadow-float`}
        >
          {rows.map((o, i) => (
            <li
              key={o?.id ?? 'new'}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // `onMouseDown`: a click comes after the blur, when the list is already closing.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(o)
              }}
              onMouseEnter={() => setPointed(i)}
              className={`flex cursor-pointer items-center gap-2 truncate px-3 py-1.5 text-ui ${
                o ? 'text-ink' : 'text-muted'
              } ${i === active ? 'bg-select' : ''}`}
            >
              {o ? (
                <OrganisationIcon
                  size={14}
                  aria-hidden="true"
                  className="shrink-0 text-organisation"
                />
              ) : (
                <NewIcon size={14} aria-hidden="true" className="shrink-0" />
              )}
              {o ? o.name : `Add “${asked}” as a new organisation`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Where they keep time: their city's zone, said so, or one chosen by hand; and their clock now. */
function ZoneLine({
  zone,
  fromCity,
  now,
  onZone,
}: {
  zone: string | null
  fromCity: boolean
  now: Date
  onZone: (zone: string | null) => void
}) {
  const [changing, setChanging] = useState(false)
  const [typed, setTyped] = useState('')
  // Done, Enter and leaving the box all keep what was typed (BUG-048): a zone it names, or the
  // first it matches; nothing typed means "from the city"; words matching no zone change nothing.
  const commit = (words: string) => {
    const next = zoneFrom(words)
    if (next !== undefined) onZone(next)
    setChanging(false)
  }
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-control bg-hover px-3 py-2 text-ui">
      <span className="text-meta text-muted">Time zone</span>
      {changing ? (
        <ZoneBox
          zone={zone}
          placeholder="From Lives in"
          typed={typed}
          onType={setTyped}
          onZone={(next) => {
            onZone(next)
            setChanging(false)
          }}
          onLeave={() => commit(typed)}
        />
      ) : (
        <span className="flex min-w-0 items-center gap-2">
          {/* A zone's name is words; the time beside it is mono. */}
          <span className="truncate text-ink">{zone ?? 'Not known'}</span>
          {fromCity && <span className="text-meta text-subtle">From Lives in</span>}
        </span>
      )}
      <button
        type="button"
        // Done keeps the box's focus, so leaving it does not commit a second time.
        onMouseDown={(e) => changing && e.preventDefault()}
        onClick={() => {
          if (changing) return commit(typed)
          setTyped(zone ?? '')
          setChanging(true)
        }}
        className={BUTTON.inline}
      >
        {changing ? 'Done' : 'Change'}
      </button>
      <span className="text-meta text-muted">Their time</span>
      <span className="font-mono text-ink">{zone ? clockTime(now, zone) : '—'}</span>
    </div>
  )
}

/** The circles, any number picked, and a new one named in place (FR-062). */
function Circles({
  picked,
  onPick,
}: {
  picked: readonly CircleId[]
  onPick: (next: CircleId[]) => void
}) {
  const composing = useComposing()
  const circles = useQuery(circlesQuery())
  const qc = useQueryClient()
  const [naming, setNaming] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const add = async () => {
    const name = naming?.trim()
    if (!name || !circles.data) return setNaming(null)
    try {
      const after = await putCircles([
        ...circles.data.map((c) => ({ id: c.id, name: c.name })),
        { name },
      ])
      qc.setQueryData(circlesQuery().queryKey, after)
      void qc.invalidateQueries({ queryKey: peopleKeys.all })
      const made = after.find((c) => c.name === name)
      if (made) onPick([...picked, made.id])
      setNaming(null)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(circles.data ?? []).map((c) => {
        const on = picked.includes(c.id)
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(on ? picked.filter((p) => p !== c.id) : [...picked, c.id])}
            className={`inline-flex h-7 items-center gap-1 rounded-control px-2.5 text-ui max-lg:tap ${
              on ? CHOSEN : 'bg-hover text-muted hover:text-ink'
            }`}
          >
            {on && <DoneIcon size={12} aria-hidden="true" />}
            {c.name}
          </button>
        )
      })}
      {naming === null ? (
        <button
          type="button"
          onClick={() => setNaming('')}
          className="inline-flex h-7 items-center gap-1 rounded-control border border-dashed max-lg:tap border-line-strong px-2.5 text-ui text-muted hover:text-ink"
        >
          <NewIcon size={12} aria-hidden="true" />
          New circle
        </button>
      ) : (
        <input
          aria-label="New circle"
          autoFocus
          value={naming}
          onChange={(e) => setNaming(e.target.value)}
          {...composing.bind}
          onKeyDown={(e) => {
            // A circle's name is often typed through an IME: its Enter picks the word.
            if (composing.composingNow(e)) return
            if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              void add()
            }
            if (e.key === 'Escape') {
              e.stopPropagation()
              setNaming(null)
            }
          }}
          onBlur={() => void add()}
          className={`${boxed} h-7 w-36`}
        />
      )}
      {failed && (
        <span role="alert" className="text-meta text-stop-t">
          Couldn’t add the circle. Try again.
        </span>
      )}
    </div>
  )
}
