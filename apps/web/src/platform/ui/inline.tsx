import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { CHIP } from './formStyles'
import { MENU_ITEM, MENU_SURFACE } from './menuSurface'
import { CloseIcon, ExpandIcon, NewIcon } from './icons'

/** The radio value of the choice of nothing: a radio's value is a string. */
const NOTHING = '\u0000nothing'

/** One choice; a `null` value is the choice of nothing ("Not set", "Top level"). */
export type Choice<T extends string | null> = { value: T; label: string; mark?: ReactNode }

/** A value chosen from a short list; picking the current value reports nothing. */
export function PickOne<T extends string | null>({
  label,
  value,
  choices,
  onPick,
  disabled = false,
  placeholder = 'Not set',
}: {
  /** The value's name, for the accessible name: “Status”. */
  label: string
  value: T | null
  choices: readonly Choice<T>[]
  onPick: (next: T) => void
  disabled?: boolean
  placeholder?: string
}) {
  const current = choices.find((c) => c.value === value)
  return (
    // Not modal: a modal menu inside a dialog makes every press land on the dialog's scrim, and
    // `aria-hidden`s the dialog itself.
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        disabled={disabled}
        aria-label={`${label}: ${current?.label ?? placeholder}`}
        className="-mx-1.5 flex h-8 min-w-0 items-center max-lg:tap gap-2 rounded-control px-1.5 text-ui text-ink hover:bg-hover disabled:opacity-50"
      >
        {current?.mark && (
          <span aria-hidden="true" className="flex shrink-0">
            {current.mark}
          </span>
        )}
        <span className={`truncate ${current ? '' : 'text-subtle'}`}>
          {current?.label ?? placeholder}
        </span>
        <ExpandIcon size={16} className="h-3 w-3 shrink-0 text-subtle" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU_SURFACE}>
          {/* Radios, so the current one is said as checked, not only seen as "Current". */}
          <DropdownMenu.RadioGroup value={current ? (current.value ?? NOTHING) : ''}>
            {choices.map((c) => (
              <DropdownMenu.RadioItem
                key={c.value ?? NOTHING}
                value={c.value ?? NOTHING}
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
                {c.value === value && (
                  <span aria-hidden="true" className="ml-auto text-meta text-subtle">
                    Current
                  </span>
                )}
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

/** Several values from a list, shown as chips, with a “+” menu that offers the rest. */
export function PickMany<T extends string>({
  label,
  chosen,
  choices,
  onChange,
  empty,
}: {
  label: string
  chosen: readonly Choice<T>[]
  choices: readonly Choice<T>[]
  onChange: (next: T[]) => void
  /** What to say when nothing is chosen. */
  empty: string
}) {
  const live = chosen.map((c) => c.value)
  const rest = choices.filter((c) => !live.includes(c.value))
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5 py-0.5">
      {chosen.map((c) => (
        <span key={c.value} className={CHIP}>
          {c.mark && (
            <span aria-hidden="true" className="flex shrink-0">
              {c.mark}
            </span>
          )}
          <span className="truncate">{c.label}</span>
          <button
            type="button"
            aria-label={`Remove ${label} “${c.label}”`}
            onClick={() => onChange(live.filter((v) => v !== c.value))}
            className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-control text-subtle hover:text-ink max-lg:tap"
          >
            <CloseIcon size={16} className="h-3 w-3" strokeWidth={1.8} />
          </button>
        </span>
      ))}
      {chosen.length === 0 && <span className="text-ui text-subtle">{empty}</span>}
      {rest.length > 0 && (
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger
            aria-label={`Add ${label}`}
            className="flex h-7 w-7 items-center justify-center rounded-control border border-dashed border-line-strong text-subtle hover:bg-hover hover:text-ink max-lg:tap"
          >
            <NewIcon size={16} className="h-3 w-3" strokeWidth={1.8} />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={4} className={MENU_SURFACE}>
              {rest.map((c) => (
                <DropdownMenu.Item
                  key={c.value}
                  onSelect={() => onChange([...live, c.value])}
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
