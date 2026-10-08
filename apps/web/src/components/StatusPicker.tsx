import { TASK_STATUSES, type TaskStatus } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { STATUS_LABEL } from './statusLabel'
import { StatusMark } from './StatusMark'
import { MENU_SURFACE } from './menuSurface'

/**
 * THE STATUS, CHANGED WHERE IT IS SHOWN (D78).
 *
 * It used to take three acts: 编辑, pick, 保存. That is a form's shape imposed on a decision that
 * has none -- the status is one value out of five, there is nothing to compose and nothing to
 * revise, so there is nothing for a 保存 to mean.
 *
 * WHY A MENU AND NOT FIVE MARKS SITTING ON THE PANE. The earlier split of reading and editing
 * came from a real complaint -- 「编辑和信息显示在同一个地方，容易误触」 -- and that complaint was
 * about a live form you could knock with your elbow, not about a control you have to open. A menu
 * keeps the deliberateness (open it, then choose) while costing one act instead of three, and it
 * is how every tool of this shape does it. The rows keep their one-click toggle, because there
 * the target is a single named transition rather than a choice among five.
 *
 * It writes IMMEDIATELY and has no dirty state, so it is outside the pane's leave guard: there is
 * never an unsaved status to lose.
 */
export function StatusPicker({
  status,
  onPick,
  disabled = false,
}: {
  status: TaskStatus
  onPick: (next: TaskStatus) => void
  disabled?: boolean
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled}
        // The accessible name carries the CURRENT value, so a screen reader hears what the status
        // is as well as what the control does -- this one button is both.
        aria-label={`Status: ${STATUS_LABEL[status]}`}
        data-status-picker
        className="-mx-1.5 flex h-8 items-center gap-2 rounded-lg px-1.5 text-sm text-fg hover:bg-surface-hover disabled:opacity-50"
      >
        <span aria-hidden="true" className="flex">
          <StatusMark status={status} />
        </span>
        {STATUS_LABEL[status]}
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3 text-fg-subtle">
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
              className="flex h-9 cursor-default items-center gap-2 rounded-lg px-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
            >
              <span aria-hidden="true" className="flex">
                <StatusMark status={s} />
              </span>
              {STATUS_LABEL[s]}
              {s === status && <span className="ml-auto text-xs text-fg-subtle">Current</span>}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
