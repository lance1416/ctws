import type { ReadingStatus } from '@ctws/contracts'
import { monthDay } from '../../../platform/time/dates'
import { DoneIcon, EditIcon, KIND_ICON, NewIcon } from '../../../platform/ui/icons'
import type { ChangeLine } from '../../../shell/contract'

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[key] : null

/** What a status became, as the line says it. */
const BECAME: Record<ReadingStatus, string> = {
  todo: 'Back to read',
  reading: 'Started reading',
  done: 'Finished',
  dropped: 'Dropped',
}

/**
 * A reading item's changes on its timeline (FR-073): "Added", "Started reading", "Finished",
 * "Renamed from …", "Finish by Oct 3". Which project it moved to says nothing here: its head says.
 */
export function describeReadingChange(event: {
  type: string
  payload: unknown
}): ChangeLine | null {
  const was = field(event.payload, 'from')
  const now = field(event.payload, 'to')
  switch (event.type) {
    case 'created':
      return { mark: <NewIcon size={16} />, text: 'Added' }
    case 'field_changed': {
      const which = text(field(event.payload, 'field'))
      if (which === 'status') {
        const to = text(now) as ReadingStatus | null
        if (!to || !(to in BECAME)) return null
        const Mark = to === 'done' ? DoneIcon : KIND_ICON.reading
        return { mark: <Mark size={16} />, text: BECAME[to] }
      }
      if (which === 'title') {
        const old = text(was)
        return old ? { mark: <EditIcon size={16} />, text: `Renamed from “${old}”` } : null
      }
      if (which === 'planOn') {
        const day = text(now)
        return {
          mark: <EditIcon size={16} />,
          text: day ? `Finish by ${monthDay(day)}` : 'No day to finish by',
        }
      }
      return null
    }
    default:
      return null
  }
}
