import type { TaskId, TodayTaskResponse } from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { nextMonday } from '../../../../platform/time/dates'
import { BUTTON } from '../../../../platform/ui/buttonStyles'
import { ExpandIcon } from '../../../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../../../platform/ui/menuSurface'
import { DayPickButton } from '../../../../shell/dates'

/** The days an overdue task is planned for in one press: today, tomorrow, next Monday. */
const planDays = (day: string) => [
  { label: 'Today', to: day },
  { label: 'Tomorrow', to: addDays(day, 1) },
  { label: 'Mon', to: nextMonday(day) },
]

/** An overdue row's action (FR-079): plan it for a day, a press each, or another from the picker. */
export function PlanButtons({
  task,
  day,
  onMove,
}: {
  task: Pick<TodayTaskResponse, 'id' | 'title'>
  day: string
  onMove: (id: TaskId, to: string) => void
}) {
  return (
    <span className="inline-flex items-center gap-1">
      {planDays(day).map((d) => (
        <button
          key={d.label}
          type="button"
          onClick={() => onMove(task.id, d.to)}
          aria-label={`Plan “${task.title}” for ${d.label === 'Mon' ? 'next Monday' : d.label.toLocaleLowerCase()}`}
          className="inline-flex h-6.5 items-center rounded-control border border-line bg-panel px-2 text-meta font-medium text-ink hover:bg-hover"
        >
          {d.label}
        </button>
      ))}
      <DayPickButton
        label={`Plan “${task.title}” for another day`}
        today={day}
        onPick={(to) => onMove(task.id, to)}
      />
    </span>
  )
}

/** Overdue's head, past five (FR-015): every one planned for the same day at once. */
export function MoveAllMenu({
  overdue,
  day,
  onMove,
}: {
  overdue: readonly Pick<TodayTaskResponse, 'id' | 'children'>[]
  day: string
  onMove: (id: TaskId, to: string) => void
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={`${BUTTON.quiet} h-7 px-2.5 text-meta`}>
        Move all to…
        <ExpandIcon size={12} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={MENU_SURFACE}>
          {planDays(day).map((d) => (
            <DropdownMenu.Item
              key={d.label}
              // A parent's plan is its children's (FR-043).
              onSelect={() => overdue.filter((t) => !t.children).forEach((t) => onMove(t.id, d.to))}
              className={MENU_ITEM}
            >
              {d.label === 'Mon' ? 'Next Monday' : d.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
