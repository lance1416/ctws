import { TASK_STATUSES, type TaskStatus } from '@ctws/contracts'
import { monthDay, ymd } from '../../../platform/time/dates'
import { FlagIcon, LockIcon, NewIcon, PLACE_ICON } from '../../../platform/ui/icons'
import type { ChangeLine } from '../../../shell/contract'
import { StatusMark } from '../../../platform/ui/StatusMark'

/** What a status became, as the line says it: "Started", "Done". */
const BECAME: Record<TaskStatus, string> = {
  in_progress: 'Started',
  done: 'Done',
  cancelled: 'Cancelled',
  backlog: 'Put in the backlog',
  todo: 'Back to do',
}

const isStatus = (v: unknown): v is TaskStatus =>
  typeof v === 'string' && (TASK_STATUSES as readonly string[]).includes(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
/** One field of a logged payload, whatever shape the payload has. */
const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[key] : null
/** A logged value's `from` or `to`. */
const side = (payload: unknown, key: 'from' | 'to'): unknown => field(payload, key)

/**
 * A task's changes on its timeline (FR-044, FR-045): "Started", "Due Oct 22 → Oct 24",
 * "Renamed from …". A parent's status follows its children's and says nothing of its own here.
 */
export function describeTaskChange(
  event: { type: string; payload: unknown },
  timeZone: string,
): ChangeLine | null {
  const was = side(event.payload, 'from')
  const now = side(event.payload, 'to')
  // A deadline is an instant, said as its day on the account's clock; a plan is already a day.
  const dayOf = (v: unknown): string | null => {
    const s = text(v)
    if (!s) return null
    return monthDay(event.type === 'due_changed' ? ymd(new Date(s), timeZone) : s)
  }
  const span = (label: string, cleared: string) => {
    const [a, b] = [dayOf(was), dayOf(now)]
    if (!b) return cleared
    return a ? `${label} ${a} → ${b}` : `${label} ${b}`
  }
  switch (event.type) {
    case 'created':
      return { mark: <NewIcon size={16} />, text: 'Created' }
    case 'status_changed': {
      if ((event.payload as { derived?: boolean } | null)?.derived) return null
      if (!isStatus(now)) return null
      return { mark: <StatusMark status={now} size={16} />, text: BECAME[now] }
    }
    case 'due_changed':
      return { mark: <FlagIcon size={16} />, text: span('Due', 'Deadline cleared') }
    case 'scheduled_changed':
      return { mark: <PLACE_ICON.calendar size={16} />, text: span('Planned', 'Plan cleared') }
    case 'title_changed': {
      const old = text(was)
      return old ? { mark: null, text: `Renamed from “${old}”` } : null
    }
    case 'notes_changed':
      return { mark: null, text: 'Notes edited' }
    case 'stage_changed': {
      const [from, to] = [text(was), text(now)]
      if (!to) return { mark: null, text: 'Stage cleared' }
      return { mark: null, text: from ? `Stage ${from} → ${to}` : `Stage set to ${to}` }
    }
    case 'stage_renamed':
      return { mark: null, text: `Stage renamed ${text(was) ?? ''} → ${text(now) ?? ''}` }
    case 'moved':
      return { mark: null, text: 'Moved' }
    // Named by the title it had then; a change logged before titles were kept says less.
    case 'dependency_added': {
      const blocker = text(field(event.payload, 'title'))
      return {
        mark: <LockIcon size={16} />,
        text: blocker ? `Waiting on ${blocker}` : 'Waiting on another task',
      }
    }
    case 'dependency_removed': {
      const blocker = text(field(event.payload, 'title'))
      return {
        mark: <LockIcon size={16} />,
        text: blocker ? `No longer waiting on ${blocker}` : 'No longer waiting',
      }
    }
    case 'became_parent':
      return { mark: null, text: 'Broken into subtasks' }
    case 'became_leaf':
      return { mark: null, text: 'Its last subtask went' }
    default:
      return null
  }
}
