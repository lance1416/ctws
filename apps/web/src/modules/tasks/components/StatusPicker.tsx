import { TASK_STATUSES, type TaskStatus } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { STATUS_LABEL } from '../status'
import { StatusMark } from './StatusMark'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'

/**
 * THE STATUS, CHANGED WHERE IT IS SHOWN.
 *
 * ONE ACT, not three. Edit, pick, save is a form's shape imposed on a decision that has none:
 * the status is one value out of five, with nothing to compose and nothing to revise, so a Save
 * would mean nothing.
 *
 * WHY A MENU AND NOT FIVE MARKS SITTING ON THE PANE. Reading and editing are kept apart because
 * a live form can be knocked with an elbow -- which is not true of a control you have to open. A
 * menu keeps the deliberateness (open it, then choose) at the cost of one act, and it is how
 * every tool of this shape does it. The rows keep their one-click toggle, because there
 * the target is a single named transition rather than a choice among five.
 *
 * It writes IMMEDIATELY and has no dirty state, so it is outside the pane's leave guard: there is
 * never an unsaved status to lose.
 */
export function StatusPicker({
  status,
  onPick,
  busy = false,
}: {
  status: TaskStatus
  onPick: (next: TaskStatus) => void
  /** A pick is being written: the menu will not open again until it lands. */
  busy?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu.Root open={open} onOpenChange={(next) => setOpen(next && !busy)}>
      <DropdownMenu.Trigger
        // Not `disabled`: the closing menu hands focus back to this button, and a disabled one
        // drops it to <body> (WCAG 2.4.3).
        aria-disabled={busy || undefined}
        // The accessible name carries the CURRENT value, so a screen reader hears what the status
        // is as well as what the control does -- this one button is both.
        aria-label={`Status: ${STATUS_LABEL[status]}`}
        data-status-picker
        className="-mx-1.5 flex h-8 items-center gap-2 rounded-md px-1.5 text-sm text-ink hover:bg-hover aria-disabled:opacity-50"
      >
        <span aria-hidden="true" className="flex">
          <StatusMark status={status} />
        </span>
        {STATUS_LABEL[status]}
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 text-ink-subtle">
          <path
            d="M4 6.5l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU_SURFACE}>
          {TASK_STATUSES.map((s) => (
            <DropdownMenu.Item
              key={s}
              onSelect={() => {
                // Picking the one it already is would be a write that changes nothing and a
                // refetch that shows the same thing.
                if (s !== status) onPick(s)
              }}
              className={MENU_ITEM}
            >
              <span aria-hidden="true" className="flex">
                <StatusMark status={s} />
              </span>
              {STATUS_LABEL[s]}
              {s === status && <span className="ml-auto text-xs text-ink-subtle">Current</span>}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
