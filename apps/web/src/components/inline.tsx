import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useComposing } from '../composition'
import { MENU_ITEM, MENU_SURFACE } from './menuSurface'

/**
 * THE THREE WAYS TO CHANGE SOMETHING IN A DETAIL PANE, and every module uses the same three.
 *
 * The rule the audit settled on: a value you can only pick is picked where it is shown and
 * written at once; a value you compose is clicked into and written when you leave it; a set is
 * added to and removed from in place. There is no edit mode and no Save button anywhere, because
 * neither means anything for a decision -- they are the shape of a FORM, and a form is for
 * composing several things at once and committing them together.
 *
 * A mis-click cannot change anything, because of the controls themselves: a menu has to be
 * opened, and text has to be clicked into.
 */

/** One option in a `PickOne`. */
export type Choice<T extends string> = { value: T; label: string; mark?: ReactNode }

/**
 * A value chosen from a short list: status, kind, a project.
 *
 * It shows the current value and writes the moment one is chosen. Picking the one it already has
 * writes nothing -- a request that changes nothing, followed by a refetch that shows the same
 * thing, is a flicker with no meaning.
 */
export function PickOne<T extends string>({
  label,
  value,
  choices,
  onPick,
  disabled = false,
  placeholder = 'Not set',
}: {
  /** What this value IS, for the accessible name: “Status”. The control is both label and value. */
  label: string
  value: T | null
  choices: readonly Choice<T>[]
  onPick: (next: T) => void
  disabled?: boolean
  placeholder?: string
}) {
  const current = choices.find((c) => c.value === value)
  return (
    /**
     * NOT MODAL. A modal menu puts `pointer-events: none` on everything behind it, so inside a
     * dialog EVERY press -- on a label, on a field, on the panel -- lands on the dialog's own
     * scrim instead of where it was aimed, and the dialog closes under the cursor while someone
     * is picking. It also `aria-hidden`s the dialog that contains it.
     *
     * A picker is not a modal act: it closes on an outside press and on Escape either way. What
     * it must not do is take the page hostage.
     */
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        disabled={disabled}
        aria-label={`${label}: ${current?.label ?? placeholder}`}
        className="-mx-1.5 flex h-8 min-w-0 items-center gap-2 rounded-lg px-1.5 text-sm text-fg hover:bg-surface-hover disabled:opacity-50"
      >
        {current?.mark && (
          <span aria-hidden="true" className="flex shrink-0">
            {current.mark}
          </span>
        )}
        <span className={`truncate ${current ? '' : 'text-fg-subtle'}`}>
          {current?.label ?? placeholder}
        </span>
        <Chevron />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU_SURFACE}>
          {choices.map((c) => (
            <DropdownMenu.Item
              key={c.value}
              onSelect={() => {
                if (c.value !== value) onPick(c.value)
              }}
              className={MENU_ITEM}
            >
              {c.mark && (
                <span aria-hidden="true" className="flex shrink-0">
                  {c.mark}
                </span>
              )}
              <span className="truncate">{c.label}</span>
              {c.value === value && <span className="ml-auto text-xs text-fg-subtle">Current</span>}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/**
 * SEVERAL values out of a list, shown as chips with a “+” that offers the rest.
 *
 * A multi-select and not a second dropdown, because what it answers is which lines of work
 * somebody is on, and a list of two or three names IS the answer -- hiding them behind a closed control would mean
 * opening it to read what you already asked for.
 */
export function PickMany({
  label,
  chosen,
  choices,
  onChange,
  empty,
}: {
  label: string
  chosen: readonly { value: string; label: string; mark?: ReactNode }[]
  choices: readonly { value: string; label: string; mark?: ReactNode }[]
  onChange: (next: string[]) => void
  /** What to say when nothing is chosen. */
  empty: string
}) {
  /**
   * WHAT HAS BEEN PICKED, INCLUDING WHAT IS STILL IN FLIGHT.
   *
   * `chosen` is the server's answer, and it arrives a request later. Picking two things quickly
   * computes both new sets from the SAME stale list, so the second write drops the first -- a
   * lost update that reads on screen as one of the two never having been added.
   *
   * The optimistic list leads, and is dropped the moment the server's answer agrees with it.
   */
  const [pending, setPending] = useState<string[] | null>(null)
  const settled = chosen.map((c) => c.value)
  useEffect(() => {
    if (pending && same(pending, settled)) setPending(null)
  }, [pending, settled])

  const live = pending ?? settled
  const byValue = new Map([...choices, ...chosen].map((c) => [c.value, c]))
  const shown = live.map((v) => byValue.get(v)).filter((c) => c !== undefined)
  const change = (next: string[]) => {
    setPending(next)
    onChange(next)
  }
  const rest = choices.filter((c) => !live.includes(c.value))
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 py-0.5">
      {shown.map((c) => (
        <span
          key={c.value}
          className="flex h-7 min-w-0 items-center gap-1.5 rounded-lg bg-surface-hover px-2 text-xs text-fg"
        >
          {c.mark && (
            <span aria-hidden="true" className="flex shrink-0">
              {c.mark}
            </span>
          )}
          <span className="truncate">{c.label}</span>
          <button
            type="button"
            aria-label={`Remove ${label} “${c.label}”`}
            onClick={() => change(live.filter((v) => v !== c.value))}
            className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-subtle hover:text-fg"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}
      {shown.length === 0 && <span className="text-sm text-fg-subtle">{empty}</span>}
      {rest.length > 0 && (
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger
            aria-label={`Add ${label}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-dashed border-border-strong text-fg-subtle hover:bg-surface-hover hover:text-fg"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3">
              <path
                d="M8 3.5v9M3.5 8h9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={4} className={MENU_SURFACE}>
              {rest.map((c) => (
                <DropdownMenu.Item
                  key={c.value}
                  onSelect={() => change([...live, c.value])}
                  className={MENU_ITEM}
                >
                  {c.mark && (
                    <span aria-hidden="true" className="flex shrink-0">
                      {c.mark}
                    </span>
                  )}
                  <span className="truncate">{c.label}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </span>
  )
}

/**
 * TEXT YOU COMPOSE: a title, a note, a company name.
 *
 * Click it and it becomes a field; leaving it writes what is there; Escape puts it back. There is
 * no Save, because the only thing a save could add is a second act to perform after you have
 * already finished typing.
 *
 * Escape STOPS PROPAGATING, so the first press cancels the edit and does not also close the pane
 * -- one key, one level at a time.
 */
export function InlineText({
  label,
  value,
  onSave,
  placeholder,
  multiline = false,
  className = '',
}: {
  label: string
  value: string
  onSave: (next: string) => void
  placeholder: string
  multiline?: boolean
  /** Styling for the READING state, so a title can be large and a note plain. */
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const box = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const composing = useComposing()
  // Focus goes back to the control that opened the field. Without it the field unmounts and
  // focus falls to <body>: the next Escape reaches nothing, so backing out of an edit leaves the
  // keyboard stranded outside the pane it was in (WCAG 2.4.3).
  const returning = useRef(false)
  useEffect(() => {
    if (editing || !returning.current) return
    returning.current = false
    trigger.current?.focus()
  }, [editing])

  // A background refetch must not overwrite what is being typed, so the draft is only re-seeded
  // while the field is closed.
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const commit = () => {
    returning.current = true
    setEditing(false)
    const next = draft.trim()
    if (next !== value.trim()) onSave(next)
  }

  if (!editing) {
    return (
      <button
        ref={trigger}
        type="button"
        aria-label={`Edit ${label}`}
        onClick={() => {
          setDraft(value)
          setEditing(true)
        }}
        className={`-mx-1.5 min-w-0 rounded-lg px-1.5 py-0.5 text-left hover:bg-surface-hover ${
          value ? '' : 'text-fg-subtle'
        } ${className}`}
      >
        {value || placeholder}
      </button>
    )
  }

  const common = {
    ref: box,
    autoFocus: true,
    // Without these the tracked half of the composition guard never arms, and Enter on a Mac
    // committing English out of a Chinese IME would save and close the editor.
    ...composing.bind,
    value: draft,
    'aria-label': label,
    placeholder,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    className: `-mx-1.5 w-full rounded-lg border border-border-strong bg-surface px-1.5 py-0.5 text-fg ${className}`,
  }
  const onKeyDown = (e: {
    key: string
    shiftKey: boolean
    preventDefault: () => void
    stopPropagation: () => void
    nativeEvent: { isComposing?: boolean }
  }) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setDraft(value)
      returning.current = true
      setEditing(false)
      return
    }
    // Enter commits a single line; in a note it is a newline, and leaving the field commits.
    if (e.key === 'Enter' && !multiline && !composing.composingNow(e)) {
      e.preventDefault()
      commit()
    }
  }

  return multiline ? (
    <textarea {...common} rows={4} onKeyDown={onKeyDown} />
  ) : (
    <input {...common} onKeyDown={onKeyDown} />
  )
}

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 shrink-0 text-fg-subtle">
      <path
        d="M4 6.5l4 4 4-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Two sets of values, compared as sets: the server may return them in its own order. */
function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v))
}
