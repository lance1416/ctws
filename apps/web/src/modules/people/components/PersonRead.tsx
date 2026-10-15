import type { PersonResponse } from '@ctws/contracts'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { NoteBody } from '../../../platform/notes/NoteBody'
import { WritingMode } from '../../../platform/notes/WritingMode'
import { BUTTON, LINK } from '../../../platform/ui/buttonStyles'
import { Field } from '../../../platform/ui/Field'
import { CHIP } from '../../../platform/ui/formStyles'
import { ProjectChip } from '../../../shell/projects/ProjectPicker'
import { patchPerson } from '../api'
import { BirthdayField } from '../birthday/BirthdayRead'
import { byKind, channelHref, channelLabel, KIND_LABEL } from '../channels'
import { CIRCLE_LABELS, GENDER_LABELS } from '../labels'
import { useNoteAutosave } from '../noteAutosave'
import { usePhone } from '../usePhone'

/**
 * A PERSON, READ: every value is text, and Edit is the one thing to press -- as on a task. The
 * notes are the exception: "Edit notes" opens the writing layer straight away, because a line
 * remembered about someone should not wait on a form about them.
 */
export function PersonRead({ person, onEdit }: { person: PersonResponse; onEdit: () => void }) {
  // The phone library, for reading too: a number is grouped here as it is in the list.
  const phone = usePhone()
  const [writing, setWriting] = useState(false)
  // The note alone, waiting on no refetch: the writing layer keeps its own text.
  const saveNote = useMutation({
    mutationFn: (note: string | null) => patchPerson(person.id, { note }),
  })
  const notes = useNoteAutosave((next) => saveNote.mutateAsync(next.trim() === '' ? null : next))
  const unsaved = notes.failed ? "Couldn't save the note" : null

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold text-ink">{person.name}</h2>
          {(person.title || person.org) && (
            <p className="truncate text-sm text-ink-muted">
              {[person.title, person.org].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {person.circle && (
          <span className="shrink-0 rounded-full border border-rule px-2.5 py-1 text-xs text-ink-muted">
            {CIRCLE_LABELS[person.circle]}
          </span>
        )}
        <button type="button" className={BUTTON.secondary} onClick={onEdit}>
          Edit
        </button>
      </div>

      {/* How to reach them first: it is what a person's page is for. */}
      {person.channels.length > 0 && (
        <Field label="Person" shape="above">
          <ul data-channels className="flex flex-col gap-0.5">
            {byKind(person.channels).map((c, i) => (
              <li key={i} className="flex min-w-0 items-center gap-1.5">
                <span className="w-12 shrink-0 text-xs text-ink-muted">{KIND_LABEL[c.kind]}</span>
                <a
                  href={channelHref(c.kind, c.value)!}
                  // A number is read and checked, so its digits line up.
                  className={`min-w-0 flex-1 truncate text-sm ${LINK} ${
                    c.kind === 'phone' ? 'tabular-nums' : ''
                  }`}
                >
                  {channelLabel(c.kind, c.value, phone?.displayPhone)}
                </a>
                {c.label && <span className="shrink-0 text-xs text-ink-subtle">{c.label}</span>}
              </li>
            ))}
          </ul>
        </Field>
      )}

      {/* The rest, one thing a cell; the columns follow this block's own width (`@container`),
          since the pane is narrow whatever the window is. */}
      <div className="@container">
        <div
          data-person-fields
          className="grid items-start gap-x-6 gap-y-4 @xl:grid-cols-2 @2xl:grid-cols-3"
        >
          <BirthdayField person={person} />
          <Reads label="Hometown" value={person.hometown} />
          <Reads label="Lives in" value={person.city} />
          <Reads label="Company" value={person.org} />
          <Reads label="Title" value={person.title} />
          <Reads
            label="Gender"
            value={person.gender ? (GENDER_LABELS[person.gender] ?? null) : null}
          />
          <Reads label="Circle" value={person.circle ? CIRCLE_LABELS[person.circle] : null} />
          <Field label="Projects" shape="above">
            {person.projects.length === 0 ? (
              <p className="text-sm text-ink-subtle">Not on any project</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {person.projects.map((p) => (
                  <li key={p.id} className={CHIP}>
                    <ProjectChip projectId={p.id} />
                    <span className="truncate">{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>
      </div>

      {/* The notes, through the task notes' Markdown and at their 68ch measure. */}
      <div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs text-ink-muted">Notes</span>
          <button type="button" className={BUTTON.secondary} onClick={() => setWriting(true)}>
            Edit notes
          </button>
        </div>
        <div data-person-notes className="mt-1.5 max-w-[68ch] text-ink">
          {person.note ? (
            <NoteBody source={person.note} />
          ) : (
            <p className="text-sm text-ink-subtle">No notes yet</p>
          )}
        </div>
        {unsaved && (
          <p role="alert" className="mt-1.5 text-sm text-danger">
            {unsaved}
          </p>
        )}
      </div>
      {writing && (
        <WritingMode
          heading={person.name}
          source={person.note ?? ''}
          problem={unsaved}
          onChange={notes.change}
          onClose={() => {
            void notes.flush()
            setWriting(false)
          }}
        />
      )}
    </>
  )
}

/** A read-only field: an empty one says Not set, like every other empty cell. */
function Reads({ label, value }: { label: string; value: string | null }) {
  return (
    <Field label={label} shape="above">
      <p className={`truncate text-sm ${value ? 'text-ink' : 'text-ink-subtle'}`}>
        {value || 'Not set'}
      </p>
    </Field>
  )
}
