import { type PersonResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { createPerson } from '../api'
import { createBody, newPerson, usePersonForm } from '../hooks/usePersonForm'
import { ProjectsPicker } from '../../../shell/projects'
import { useComposing } from '../../../platform/keyboard/composition'
import { channelPlaceholder, KIND_CHOICES } from '../logic/channels'
import { useChannelRows } from './ChannelsEditor'
import { BirthdayEditor, birthdayDraftOf } from '../birthday/BirthdayEditor'
import { CIRCLE_CHOICES } from '../logic/labels'
import { boxed, field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { DialogFooter } from '../../../platform/ui/DialogFooter'
import { Modal } from '../../../platform/ui/Modal'

/** New person, for when you know more than a name; one address here, the rest on their pane. */
export function NewPersonDialog({
  onClose,
  onMade,
}: {
  onClose: () => void
  onMade: (made: PersonResponse) => void
}) {
  const nameField = useRef<HTMLInputElement>(null)
  const composing = useComposing()

  const { form, values, named } = usePersonForm(newPerson)
  const dirty = { shouldDirty: true }
  const name = form.register('name')
  // One row: the dialog takes a single address.
  const channels = useChannelRows(() => [{ kind: 'email', value: '', label: null }])
  const address = channels.rows[0]!
  // Folded until asked for: an open, empty date form reads as bad data.
  const { birthday } = values
  const [refusedDay, setRefusedDay] = useState(false)

  const make = useMutation({
    mutationFn: createPerson,
    meta: { awaits: [['people']], ownsError: true },
    onSuccess: (made) => onMade(made),
  })

  // A day the server refused would only get a 400 from Create.
  const ready = named && !(birthday && refusedDay) && !channels.bad
  const submit = form.handleSubmit((v) => {
    if (ready && !make.isPending) make.mutate(createBody(v, channels.toSave()))
  })

  return (
    <Modal title="New person" onClose={onClose} initialFocus={nameField} dismissLabel={null}>
      <form
        onSubmit={(e) => void submit(e)}
        {...composing.bind}
        className="flex flex-col gap-5 px-5 py-4"
      >
        <div>
          <input
            {...name}
            ref={(el) => {
              name.ref(el)
              nameField.current = el
            }}
            aria-label="Name"
            placeholder="Who is this?"
            onKeyDown={(e) => {
              // isComposing: Enter confirms an IME candidate, it must not submit half a word.
              if (e.key === 'Enter' && !composing.composingNow(e)) {
                e.preventDefault()
                void submit()
              }
            }}
            className="w-full rounded-md bg-transparent py-0.5 text-lg font-semibold text-ink"
          />
        </div>

        <div>
          <label htmlFor="person-org" className={label}>
            Company
          </label>
          <input id="person-org" {...form.register('org')} className={`${field} mt-1.5`} />
        </div>

        <div>
          <span className={label}>Birthday</span>
          <div className="mt-1.5">
            {birthday ? (
              <>
                <BirthdayEditor
                  birthday={null}
                  onChange={(draft, refused) => {
                    form.setValue('birthday', draft, dirty)
                    setRefusedDay(refused)
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    form.setValue('birthday', undefined, dirty)
                    setRefusedDay(false)
                  }}
                  className="mt-1 text-sm text-ink-muted hover:text-ink"
                >
                  Not now
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => form.setValue('birthday', birthdayDraftOf(null), dirty)}
                className="h-9 rounded-md border border-dashed border-rule-strong px-3 text-sm text-ink-muted hover:border-rule-strong hover:text-ink"
              >
                Add a birthday
              </button>
            )}
          </div>
        </div>

        <div>
          <span className={label}>Circle</span>
          <div className="mt-1.5">
            <PickOne
              label="Circle"
              value={values.circle}
              choices={CIRCLE_CHOICES}
              onPick={(next) => form.setValue('circle', next, dirty)}
            />
          </div>
        </div>

        <div>
          <span className={label}>Person</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <div className="flex min-w-[6.5rem] items-center">
              <PickOne
                label="Kind"
                value={address.kind}
                choices={KIND_CHOICES}
                onPick={(next) => channels.setKind(0, next)}
              />
            </div>
            <input
              aria-label="Address"
              value={address.value}
              placeholder={channelPlaceholder(address.kind)}
              type={address.kind === 'phone' ? 'tel' : 'text'}
              inputMode={address.kind === 'phone' ? 'tel' : 'text'}
              aria-invalid={channels.shown[0] !== undefined}
              onChange={(e) => channels.type(0, e.target.value)}
              onBlur={() => channels.leave(0)}
              className={`min-w-[12rem] flex-1 ${boxed} ${address.kind === 'phone' ? 'tabular-nums' : ''}`}
            />
          </div>
          {channels.shown[0] !== undefined && (
            <p className="mt-1.5 text-xs text-danger">{channels.shown[0]}</p>
          )}
        </div>

        <div>
          <span className={label}>Projects</span>
          <div className="mt-1.5">
            <ProjectsPicker
              chosen={values.projectIds}
              onChange={(ids) => form.setValue('projectIds', ids, dirty)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="person-note" className={label}>
            Notes
          </label>
          <textarea
            id="person-note"
            {...form.register('note')}
            rows={3}
            className={`${field} mt-1.5`}
          />
        </div>

        <DialogFooter
          submit="Create"
          error={make.error}
          busy={make.isPending}
          disabled={!ready}
          onCancel={onClose}
        />
      </form>
    </Modal>
  )
}
