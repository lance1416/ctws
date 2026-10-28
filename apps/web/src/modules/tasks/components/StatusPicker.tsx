import { TASK_STATUSES, type TaskStatus } from '@ctws/contracts'
import { ExpandIcon } from '../../../platform/ui/icons'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { STATUS_LABEL } from '../../../platform/ui/StatusMark'
import { StatusMark } from '../../../platform/ui/StatusMark'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'

/**
 * The status, changed where it is shown. A pick writes at once, so there is no Save and nothing
 * for the pane's leave guard to keep.
 */
export function StatusPicker({
  status,
  onPick,
  busy,
}: {
  status: TaskStatus
  onPick: (next: TaskStatus) => void
  /** A pick is being written: the menu will not open again until it lands. */
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu.Root open={open} onOpenChange={(next) => setOpen(next && !busy)}>
      <DropdownMenu.Trigger
        // Not `disabled`: the closing menu hands focus back to this button, and a disabled one
        // drops it to <body>.
        aria-disabled={busy || undefined}
        // The name carries the current value: this one button both shows and changes it.
        aria-label={`Status: ${STATUS_LABEL[status]}`}
        className="-mx-1.5 flex h-8 items-center gap-2 rounded-control px-1.5 text-ui text-ink hover:bg-hover aria-disabled:opacity-50"
      >
        <span aria-hidden="true" className="flex">
          <StatusMark status={status} />
        </span>
        {STATUS_LABEL[status]}
        <ExpandIcon size={16} className="h-3 w-3 text-subtle" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className={MENU_SURFACE}>
          {TASK_STATUSES.map((s) => (
            <DropdownMenu.Item
              key={s}
              onSelect={() => {
                // Picking the current status writes nothing.
                if (s !== status) onPick(s)
              }}
              className={MENU_ITEM}
            >
              <span aria-hidden="true" className="flex">
                <StatusMark status={s} />
              </span>
              {STATUS_LABEL[s]}
              {s === status && <span className="ml-auto text-meta text-subtle">Current</span>}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
