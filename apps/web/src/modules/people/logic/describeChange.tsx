import { EditIcon, KIND_ICON, NewIcon } from '../../../platform/ui/icons'
import type { ChangeLine } from '../../../shell/contract'

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
/** One field of a logged payload, whatever shape the payload has. */
const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[key] : null

/** What a place field is called on the line. */
const PLACE_WORDS: Record<string, string> = { city: 'Lives in', hometown: 'Hometown' }

/**
 * A person's changes on their timeline (FR-045, FR-061): "Added", "Renamed from …", "Lives in
 * London", and the roles they took and left. Gender says nothing here: it is not news.
 */
export function describePersonChange(event: { type: string; payload: unknown }): ChangeLine | null {
  const was = field(event.payload, 'from')
  const now = field(event.payload, 'to')
  const Work = KIND_ICON.organisation
  switch (event.type) {
    case 'created':
      return { mark: <NewIcon size={16} />, text: 'Added' }
    case 'field_changed': {
      const which = text(field(event.payload, 'field'))
      if (which === 'name') {
        const old = text(was)
        return old ? { mark: <EditIcon size={16} />, text: `Renamed from “${old}”` } : null
      }
      if (which === 'note') return { mark: <EditIcon size={16} />, text: 'Notes changed' }
      const words = which ? PLACE_WORDS[which] : undefined
      if (!words) return null
      const to = text(now)
      return { mark: <EditIcon size={16} />, text: to ? `${words} ${to}` : `${words} cleared` }
    }
    case 'role_added': {
      const title = text(field(event.payload, 'title'))
      return { mark: <Work size={16} />, text: title ? `Took a role: ${title}` : 'Took a role' }
    }
    case 'role_changed':
      return { mark: <Work size={16} />, text: 'A role changed' }
    case 'role_removed': {
      const title = text(field(event.payload, 'title'))
      return { mark: <Work size={16} />, text: title ? `Role removed: ${title}` : 'A role removed' }
    }
    default:
      return null
  }
}
