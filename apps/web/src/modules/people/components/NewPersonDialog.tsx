import type { PersonResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { createPerson, type BirthdayDraft } from '../api'
import { ProjectsPicker } from '../../../shell/projects/ProjectPicker'
import { useComposing } from '../../../platform/keyboard/composition'
import { channelPlaceholder, KIND_CHOICES } from '../channels'
import { useChannelRows } from './ChannelsEditor'
import { BirthdayEditor, birthdayDraftOf } from '../birthday/BirthdayEditor'
import { CIRCLE_CHOICES } from '../labels'
import { boxed, field, label } from '../../../platform/ui/formStyles'
import { PickOne } from '../../../platform/ui/inline'
import { DialogFooter } from '../../../platform/ui/DialogFooter'
import { Modal } from '../../../platform/ui/Modal'

/**
 * NEW PERSON, filled in once: for when you know more than a name (the one-line box beside it is
 * for when you do not). ONE address, because one is what you have when you write someone down;
 * the rest are added on their pane. It follows the person form's rules for writing one.
 */
export function NewPersonDialog({
  onClose,
  onMade,
}: {
  onClose: () => void
  onMade: (made: PersonResponse) => void
}) {
  const nameField = useRef<HTMLInputElement>(null)
  const composing = useComposing()

  const [name, setName] = useState('')
  const [org, setOrg] = useState('')
  const [note, setNote] = useState('')
  // One row: the dialog takes a single address.
  const channels = useChannelRows(() => [{ kind: 'email', value: '', label: null }])
  const address = channels.rows[0]!
  const [projectIds, setProjects] = useState<string[]>([])
  const [circle, setCircle] = useState('')
  // Folded until asked for: writing someone down is often a name alone, and an open empty date
  // form reads as bad data.
  const [birthday, setBirthday] = useState<{ draft: BirthdayDraft; refused: boolean } | null>(null)

  const make = useMutation({
    mutationFn: createPerson,
    meta: { awaits: [['people']] },
    onSuccess: (made) => onMade(made),
  })

  // A day the server refused would only get a 400 from Create.
  const ready = name.trim().length > 0 && !birthday?.refused && !channels.bad
  const submit = () => {
    if (!ready || make.isPending) return
    make.mutate({
      name: name.trim(),
      ...(org.trim() ? { org: org.trim() } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(projectIds.length > 0 ? { projectIds } : {}),
      ...(channels.toSave().length > 0 ? { channels: channels.toSave() } : {}),
      ...(circle ? { circle: circle as 'family' } : {}),
      ...(birthday ? { birthday: birthday.draft } : {}),
    })
  }

  return (
    <Modal title="New person" onClose={onClose} initialFocus={nameField} dismissLabel={null}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        {...composing.bind}
        className="flex flex-col gap-5 px-5 py-4"
      >
        <div>
          <input
            ref={nameField}
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Who is this?"
            onKeyDown={(e) => {
              // isComposing: Enter confirms an IME candidate, it must not submit half a word.
              if (e.key === 'Enter' && !composing.composingNow(e)) {
                e.preventDefault()
                submit()
              }
            }}
            className="w-full rounded-md bg-transparent py-0.5 text-lg font-semibold text-ink"
          />
        </div>

        <div>
          <label htmlFor="person-org" className={label}>
            Company
          </label>
          <input
            id="person-org"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            className={`${field} mt-1.5`}
          />
        </div>

        {/* 同一个编辑器，和他页面上那个是同一套规则：预览、闰月、以及服务端那句拒绝。 */}
        <div>
          <span className={label}>Birthday</span>
          <div className="mt-1.5">
            {birthday ? (
              <>
                <BirthdayEditor
                  birthday={null}
                  onChange={(draft, refused) => setBirthday({ draft, refused })}
                />
                <button
                  type="button"
                  onClick={() => setBirthday(null)}
                  className="mt-1 text-sm text-ink-muted hover:text-ink"
                >
                  Not now
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setBirthday({ draft: birthdayDraftOf(null), refused: false })}
                className="h-9 rounded-md border border-dashed border-rule-strong px-3 text-sm text-ink-muted hover:border-rule-strong hover:text-ink"
              >
                Add a birthday
              </button>
            )}
          </div>
        </div>

        {/* 谁是谁：列表按它分组，而且写下这个人的时候你就知道答案。 */}
        <div>
          <span className={label}>Circle</span>
          <div className="mt-1.5">
            <PickOne label="Circle" value={circle} choices={CIRCLE_CHOICES} onPick={setCircle} />
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
            <ProjectsPicker chosen={projectIds} onChange={setProjects} />
          </div>
        </div>

        <div>
          <label htmlFor="person-note" className={label}>
            Notes
          </label>
          <textarea
            id="person-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
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
