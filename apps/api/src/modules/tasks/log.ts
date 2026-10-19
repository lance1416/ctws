import { type TaskEventType, type TaskId } from '@ctws/contracts'
import type { Tx } from '../../platform/db/client'
import type { Actor } from '../../platform/db/scope'
import { eventLog } from '../../shell/events'

/**
 * The task half of the change log: the shell's `eventLog`, with the subject's type fixed and the
 * event types held to `TASK_EVENT_TYPES`. It runs inside the caller's transaction.
 */
type LogEvent = { taskId: TaskId; type: TaskEventType; payload: unknown }

export function taskLog(q: Tx, ctx: Actor) {
  const log = eventLog(q, ctx)
  const subject = (taskId: TaskId) => ({ type: 'task' as const, id: taskId })
  return {
    append: (taskId: TaskId, type: TaskEventType, payload: unknown): Promise<void> =>
      log.append(subject(taskId), type, payload),
    /** Several events in one insert, in the order given. */
    appendAll: (list: readonly LogEvent[]): Promise<void> =>
      log.appendAll(
        list.map((e) => ({ subject: subject(e.taskId), type: e.type, payload: e.payload })),
      ),
  }
}
