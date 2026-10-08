import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useComposing } from '../composition'

/**
 * THE THREE WAYS TO CHANGE SOMETHING IN A DETAIL PANE, and every module uses the same three.
 *
 * The rule the audit settled on: a value you can only pick is picked where it is shown and
 * written at once; a value you compose is clicked into and written when you leave it; a set is
 * added to and removed from in place. There is no 编辑 mode and no 保存 button anywhere, because
 * neither of them means anything for a decision -- they are the shape of a FORM, and a form is
 * for composing several things at once and then committing them together.
 *
 * The mis-click worry that the old reading/editing split answered is answered here by the
 * controls themselves: a menu has to be opened, and text has to be clicked into.
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
  placeholder = '没有设定',
}: {
  /** What this value IS, for the accessible name: 「状态」. The control is both label and value. */
  label: string
  value: T | null
  choices: readonly Choice<T>[]
  onPick: (next: T) => void
  disabled?: boolean
  placeholder?: string
}) {
  const current = choices.find((c) => c.value === value)
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled}
        aria-label={`${label}：${current?.label ?? placeholder}`}
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
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU}>
          {choices.map((c) => (
            <DropdownMenu.Item
              key={c.value}
              onSelect={() => {
                if (c.value !== value) onPick(c.value)
              }}
              className={ITEM}
            >
              {c.mark && (
                <span aria-hidden="true" className="flex shrink-0">
                  {c.mark}
                </span>
              )}
              <span className="truncate">{c.label}</span>
              {c.value === value && <span className="ml-auto text-xs text-fg-subtle">当前</span>}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/**
 * SEVERAL values out of a list, shown as chips with a 「+」 that offers the rest.
 *
 * A multi-select and not a second dropdown, because what it answers is 「这个人在哪几条线上」 and
 * a list of two or three names IS the answer -- hiding them behind a closed control would mean
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
  const rest = choices.filter((c) => !chosen.some((p) => p.value === c.value))
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 py-0.5">
      {chosen.map((c) => (
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
            aria-label={`把${label}「${c.label}」去掉`}
            onClick={() => onChange(chosen.filter((p) => p.value !== c.value).map((p) => p.value))}
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
      {chosen.length === 0 && <span className="text-sm text-fg-subtle">{empty}</span>}
      {rest.length > 0 && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label={`加一个${label}`}
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
            <DropdownMenu.Content align="start" sideOffset={4} className={MENU}>
              {rest.map((c) => (
                <DropdownMenu.Item
                  key={c.value}
                  onSelect={() => onChange([...chosen.map((p) => p.value), c.value])}
                  className={ITEM}
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
 * no 保存, because the only thing a save could add is a second act to perform after you have
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
        aria-label={`改${label}`}
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

const MENU =
  'max-h-80 min-w-40 overflow-y-auto rounded-xl border border-border-subtle bg-surface-panel p-1 shadow-panel'
const ITEM =
  'flex h-9 min-w-0 cursor-default items-center gap-2 rounded-lg px-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover'

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
