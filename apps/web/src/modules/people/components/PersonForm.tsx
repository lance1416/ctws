import type { PersonResponse, UpdatePersonBody } from '@ctws/contracts'
import { Icon } from '../../../platform/ui/icons'
import { useState } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { WritingMode } from '../../../platform/notes/WritingMode'
import { Button } from '../../../platform/ui/Button'
import { Field } from '../../../platform/ui/Field'
import { field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { useReportUnsaved } from '../../../platform/ui/unsavedGuard'
import { PickCity } from '../../../shell/cities'
import { FormBar } from '../../../shell/detail'
import { ProjectsPicker } from '../../../shell/projects'
import { BirthdayEditor } from '../birthday/BirthdayEditor'
import { givenDate, plainDate } from '../birthday/text'
import { byKind } from '../logic/channels'
import { CIRCLE_CHOICES, GENDER_CHOICES } from '../logic/labels'
import { personPatch, personValues, usePersonForm } from '../hooks/usePersonForm'
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
  onSave: (patch: UpdatePersonBody) => void
  /** Whether anything differs from what the form opened on, for the pane's leave guard. */
  onUnsaved?: (unsaved: boolean) => void
}) {
  const { form, values, named } = usePersonForm(personValues(person))
  const dirty = { shouldDirty: true }
  const channels = useChannelRows(() => byKind(person.channels).map((c) => ({ ...c, saved: true })))
  const [openedChannels] = useState(() => JSON.stringify(channels.toSave()))
  const [writing, setWriting] = useState(false)
  const [pickingDay, setPickingDay] = useState(false)
  // The server has said the day does not exist: Save would only get a 400.
  const [badDay, setBadDay] = useState(false)
  const { birthday } = values
  useReportUnsaved(
    (form.formState.isDirty || JSON.stringify(channels.toSave()) !== openedChannels) && !busy,
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

  const ready = named && !badDay && !channels.bad

  return (
    <form
      aria-label="Edit person"
      onSubmit={form.handleSubmit((v) => {
        if (!busy && ready) onSave(personPatch(v, channels.toSave()))
      })}
      className="flex flex-col gap-4"
    >
      <FormBar busy={busy} disabled={!ready} onCancel={onCancel} />
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
          {...form.register('name')}
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
              <Icon glyph="chevronDown" className="h-3 w-3 shrink-0 text-ink-subtle" />
            </button>
          </Field>
          {pickingDay && (
            <div className="col-span-full rounded-md border border-rule-strong p-3">
              <BirthdayEditor
                birthday={person.birthday}
                onChange={(draft, refused) => {
                  form.setValue('birthday', draft, dirty)
                  setBadDay(refused)
                }}
              />
              {person.birthday && (
                <Button
                  look="quiet"
                  className="mt-2"
                  onClick={() => {
                    form.setValue('birthday', null, dirty)
                    setBadDay(false)
                    setPickingDay(false)
                  }}
                >
                  Remove the birthday
                </Button>
              )}
            </div>
          )}
          {/* Picked, not typed, so a city is stored one way. */}
          <PickCity
            label="Hometown"
            id="c-home"
            value={values.hometown}
            onChange={(next) => form.setValue('hometown', next, dirty)}
          />
          <PickCity
            label="Lives in"
            id="c-city"
            value={values.city}
            onChange={(next) => form.setValue('city', next, dirty)}
          />
          <Writes label="Company" id="c-org" field={form.register('org')} />
          <Writes label="Title" id="c-title" field={form.register('title')} />
          <Field label="Gender">
            <PickOne
              label="Gender"
              value={values.gender}
              choices={GENDER_CHOICES}
              onPick={(next) => form.setValue('gender', next, dirty)}
            />
          </Field>
          <Field label="Circle">
            <PickOne
              label="Circle"
              value={values.circle}
              choices={CIRCLE_CHOICES}
              onPick={(next) => form.setValue('circle', next, dirty)}
            />
          </Field>
          <Field label="Projects">
            <ProjectsPicker
              chosen={values.projectIds}
              onChange={(ids) => form.setValue('projectIds', ids, dirty)}
            />
          </Field>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <label htmlFor="c-note" className={`flex-1 ${label}`}>
            Notes
          </label>
          <Button look="quiet" onClick={() => setWriting(true)}>
            Write in full
          </Button>
        </div>
        <textarea
          id="c-note"
          {...form.register('note')}
          rows={4}
          className={`${field} mt-1.5 max-w-reading`}
        />
      </div>
      {writing && (
        <WritingMode
          heading={values.name || person.name}
          source={values.note}
          onChange={(next) => form.setValue('note', next, dirty)}
          onClose={() => setWriting(false)}
        />
      )}
    </form>
  )
}

function Writes({
  label: text,
  id,
  field: registered,
}: {
  label: string
  id: string
  field: UseFormRegisterReturn
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <input id={id} {...registered} className={`${field} mt-1 text-sm`} />
    </div>
  )
}
