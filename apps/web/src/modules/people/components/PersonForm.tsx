import type { Circle, Gender, PersonResponse } from '@ctws/contracts'
import { useState } from 'react'
import { WritingMode } from '../../../platform/notes/WritingMode'
import { BUTTON } from '../../../platform/ui/buttonStyles'
import { Field } from '../../../platform/ui/Field'
import { field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { useReportUnsaved } from '../../../platform/ui/unsavedGuard'
import { PickCity } from '../../../shell/cities'
import { FormBar } from '../../../shell/detail'
import { ProjectsPicker } from '../../../shell/projects'
import type { BirthdayDraft, patchPerson } from '../api'
import { BirthdayEditor } from '../birthday/BirthdayEditor'
import { givenDate, plainDate } from '../birthday/text'
import { byKind } from '../logic/channels'
import { CIRCLE_CHOICES, GENDER_CHOICES } from '../logic/labels'
import { ChannelsEditor, useChannelRows } from './ChannelsEditor'

/**
 * The person form, with one Save. Linked edges are not in it: they are saved the moment they are
 * named.
 */
export function PersonForm({
  person,
  busy,
  error,
  onCancel,
  onSave,
  onUnsaved,
}: {
  person: PersonResponse
  busy: boolean
  /** Why the server refused the last Save; the form stays open with what was typed. */
  error: string | null
  onCancel: () => void
  onSave: (patch: Parameters<typeof patchPerson>[1]) => void
  /** Whether anything differs from what the form opened on, for the pane's leave guard. */
  onUnsaved?: (unsaved: boolean) => void
}) {
  const [name, setName] = useState(person.name)
  const [org, setOrg] = useState(person.org ?? '')
  const [title, setTitle] = useState(person.title ?? '')
  const [hometown, setHometown] = useState(person.hometown ?? '')
  const [city, setCity] = useState(person.city ?? '')
  const [gender, setGender] = useState<Gender | null>(person.gender)
  const [circle, setCircle] = useState<Circle | null>(person.circle)
  const [projectIds, setProjectIds] = useState(person.projects.map((p) => p.id))
  const channels = useChannelRows(() => byKind(person.channels).map((c) => ({ ...c, saved: true })))
  const [note, setNote] = useState(person.note ?? '')
  const [writing, setWriting] = useState(false)
  const [pickingDay, setPickingDay] = useState(false)
  // Untouched is `undefined` (leave the birthday be); `null` removes it.
  const [birthday, setBirthday] = useState<BirthdayDraft | null | undefined>(undefined)
  // The server has said the day does not exist: Save would only get a 400.
  const [badDay, setBadDay] = useState(false)
  useReportUnsaved(
    [
      name,
      org,
      title,
      hometown,
      city,
      gender,
      circle,
      projectIds,
      channels.toSave(),
      note,
      birthday,
    ],
    busy,
    onUnsaved,
  )
  // Untouched, the button shows the saved birthday.
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
      gender,
      circle,
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
          {/* Its controls are many, so they open on request across the whole row. */}
          <Field label="Birthday">
            <button
              type="button"
              aria-expanded={pickingDay}
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
          {/* Picked, not typed, so a city is stored one way. */}
          <PickCity label="Hometown" id="c-home" value={hometown} onChange={setHometown} />
          <PickCity label="Lives in" id="c-city" value={city} onChange={setCity} />
          <Writes label="Company" id="c-org" value={org} onChange={setOrg} />
          <Writes label="Title" id="c-title" value={title} onChange={setTitle} />
          <Field label="Gender">
            <PickOne label="Gender" value={gender} choices={GENDER_CHOICES} onPick={setGender} />
          </Field>
          <Field label="Circle">
            <PickOne label="Circle" value={circle} choices={CIRCLE_CHOICES} onPick={setCircle} />
          </Field>
          <Field label="Projects">
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
