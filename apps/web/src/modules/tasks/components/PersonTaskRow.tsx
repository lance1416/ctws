import type { LinkCandidate } from '@ctws/contracts'
import { addDays } from '@ctws/core/day'
import { shortDay, weekdayOf, ymd } from '../../../platform/time/dates'
import { useNow } from '../../../platform/time/useNow'
import { FlagIcon } from '../../../platform/ui/icons'
import { useTimeZone } from '../../../shell/auth'
import { isFinished } from '../logic/status'
import { treeDue } from '../logic/tree/treeDue'
import { CHIP, DUE_TONE } from './board/BoardCard'
import { StatusMark } from './StatusMark'

/**
 * A task on a person's page (artboard 5): its status, its title, and when, its deadline as the
 * tree says it, or the day it is planned for. Not the sentence that linked it.
 */
export function PersonTaskRow({ thing }: { thing: LinkCandidate }) {
  const timeZone = useTimeZone()
  const today = ymd(useNow(), timeZone)
  if (thing.type !== 'task') return null
  const due = treeDue({ dueAt: thing.dueAt, status: thing.status, waiting: false }, today, timeZone)
  const planned =
    !due && thing.scheduledOn && !isFinished(thing.status)
      ? thing.scheduledOn <= addDays(today, 6) && thing.scheduledOn >= today
        ? `Planned ${weekdayOf(thing.scheduledOn, true)}`
        : `Planned ${shortDay(thing.scheduledOn, today)}`
      : null
  return (
    <span className="grid min-h-9 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 text-ui">
      <span aria-hidden="true" className="flex">
        <StatusMark status={thing.status} size={16} />
      </span>
      <span className={`truncate ${isFinished(thing.status) ? 'text-muted' : 'text-ink'}`}>
        {thing.title}
      </span>
      {due && due.tone !== 'waiting' ? (
        due.tone === 'quiet' ? (
          <span className="text-meta text-subtle">{due.text}</span>
        ) : (
          <span className={`${CHIP} ${DUE_TONE[due.tone]}`}>
            <span className="sr-only">Due </span>
            <FlagIcon size={12} aria-hidden="true" className="shrink-0" />
            {due.text}
          </span>
        )
      ) : (
        <span className="text-meta text-subtle">{planned ?? ''}</span>
      )}
    </span>
  )
}

/** A person's tasks counted as the artboard heads them: "3 open". */
export const openOf = (things: readonly LinkCandidate[]) =>
  `${things.filter((t) => t.type === 'task' && !isFinished(t.status)).length} open`
