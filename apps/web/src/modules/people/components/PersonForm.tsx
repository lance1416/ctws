import type { PersonResponse } from '@ctws/contracts'
import { useState } from 'react'
import { useComposing } from '../../../platform/keyboard/composition'
import { WritingMode } from '../../../platform/notes/WritingMode'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { Field } from '../../../platform/ui/Field'
import { field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { PickCity } from '../../../shell/cities/PickCity'
import { FormBar } from '../../../shell/detail/FormBar'
import { ProjectsPicker } from '../../../shell/projects/ProjectPicker'
import type { BirthdayDraft, patchPerson } from '../api'
import { BirthdayEditor } from '../birthday/BirthdayEditor'
import { givenDate, plainDate } from '../birthday/text'
import { byKind } from '../channels'
import { CIRCLE_CHOICES, GENDER_CHOICES } from '../labels'
import { ChannelsEditor, useChannelRows } from './ChannelsEditor'

/**
 * A PERSON, EDITED: one form and one Save; Cancel as if nothing happened. Two things are not in
 * it: the birthday's own controls open in a second layer of their cell, and Linked edges are
 * written the moment they are named, as a task's dependencies are.
 */
export function PersonForm({
  person,
  busy,
  error,
  onCancel,
  onSave,
}: {
  person: PersonResponse
  busy: boolean
  /** Why the server refused the last Save; the form stays open with what was typed. */
  error: string | null
  onCancel: () => void
  onSave: (patch: Parameters<typeof patchPerson>[1]) => void
}) {
  const [name, setName] = useState(person.name)
  const [org, setOrg] = useState(person.org ?? '')
  const [title, setTitle] = useState(person.title ?? '')
  const [hometown, setHometown] = useState(person.hometown ?? '')
  const [city, setCity] = useState(person.city ?? '')
  const [gender, setGender] = useState(person.gender ?? '')
  const [circle, setCircle] = useState(person.circle ?? '')
  const [projectIds, setProjectIds] = useState(person.projects.map((p) => p.id))
  const channels = useChannelRows(() => byKind(person.channels).map((c) => ({ ...c, saved: true })))
  const [note, setNote] = useState(person.note ?? '')
  const [writing, setWriting] = useState(false)
  const [pickingDay, setPickingDay] = useState(false)
  // Untouched is `undefined` (leave the birthday be); `null` removes it.
  const [birthday, setBirthday] = useState<BirthdayDraft | null | undefined>(undefined)
  // The server has said the day does not exist: Save would only get a 400.
  const [badDay, setBadDay] = useState(false)
  const composing = useComposing()
  // What the birthday button says: untouched, the birthday already saved.
  const dayText =
    birthday === undefined
      ? person.birthday
        ? givenDate(person.birthday)
        : null
      : birthday
        ? plainDate(birthday)
        : null

  const submit = () => {
    if (busy || badDay || channels.bad || name.trim() === '') return
    onSave({
      name: name.trim(),
      org: org.trim() || null,
      title: title.trim() || null,
      hometown: hometown.trim() || null,
      city: city.trim() || null,
      gender: (gender || null) as 'male' | null,
      circle: (circle || null) as 'family' | null,
      projectIds,
      channels: channels.toSave(),
      note: note.trim() || null,
      ...(birthday === undefined ? {} : { birthday }),
    })
  }

  return (
    <form
      aria-label="Edit person"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      {...composing.bind}
      className="flex flex-col gap-4"
    >
      <FormBar
        busy={busy}
        disabled={badDay || channels.bad || name.trim() === ''}
        onCancel={onCancel}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="c-name" className={label}>
          Name
        </label>
        <input
          id="c-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${field} mt-1.5 text-lg font-semibold`}
        />
      </div>

      <div>
        <span className={label}>Person</span>
        <ChannelsEditor channels={channels} />
      </div>

      <div className="@container">
        <div className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3">
          {/* The birthday is saved with this form, but its controls are many, so they open on
              request, across the row -- in a third of it they would fold into four lines. */}
          <Field label="Birthday" shape="above">
            <button
              type="button"
              aria-expanded={pickingDay}
              // Its own name: on screen it says `Not set`, as an empty gender or circle does.
              aria-label={dayText ? `Birthday, ${dayText}` : 'Birthday, not set'}
              onClick={() => setPickingDay(!pickingDay)}
              className={`-mx-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left text-sm hover:bg-hover ${
                dayText ? 'text-ink' : 'text-ink-subtle'
              }`}
            >
              <span className="truncate">{dayText ?? 'Not set'}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                className="h-3 w-3 shrink-0 text-ink-subtle"
              >
                <path
                  d="M4 6.5l4 4 4-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </Field>
          {pickingDay && (
            <div className="col-span-full rounded-md border border-rule-strong p-3">
              <BirthdayEditor
                birthday={person.birthday}
                onChange={(draft, refused) => {
                  setBirthday(draft)
                  setBadDay(refused)
                }}
              />
              {person.birthday && (
                <button
                  type="button"
                  className={`mt-2 ${BUTTON.quiet}`}
                  onClick={() => {
                    setBirthday(null)
                    setBadDay(false)
                    setPickingDay(false)
                  }}
                >
                  Remove the birthday
                </button>
              )}
            </div>
          )}
          {/* A city is picked, so it is stored one way: not "Oxford" for one and "oxford, uk"
              for another. */}
          <PickCity label="Hometown" id="c-home" value={hometown} onChange={setHometown} />
          <PickCity label="Lives in" id="c-city" value={city} onChange={setCity} />
          <Writes label="Company" id="c-org" value={org} onChange={setOrg} />
          <Writes label="Title" id="c-title" value={title} onChange={setTitle} />
          <Field label="Gender" shape="above">
            <PickOne label="Gender" value={gender} choices={GENDER_CHOICES} onPick={setGender} />
          </Field>
          <Field label="Circle" shape="above">
            <PickOne label="Circle" value={circle} choices={CIRCLE_CHOICES} onPick={setCircle} />
          </Field>
          <Field label="Projects" shape="above">
            <ProjectsPicker chosen={projectIds} onChange={setProjectIds} />
          </Field>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <label htmlFor="c-note" className={`flex-1 ${label}`}>
            Notes
          </label>
          <button type="button" className={BUTTON.quiet} onClick={() => setWriting(true)}>
            Write in full
          </button>
        </div>
        <textarea
          id="c-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className={`${field} mt-1.5 max-w-[68ch]`}
        />
      </div>
      {writing && (
        <WritingMode
          heading={name || person.name}
          source={note}
          onChange={setNote}
          onClose={() => setWriting(false)}
        />
      )}
    </form>
  )
}

/** A short field of the form: the label above, the input below. */
function Writes({
  label: text,
  id,
  value,
  onChange,
}: {
  label: string
  id: string
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${field} mt-1 text-sm`}
      />
    </div>
  )
}
