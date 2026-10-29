import { MONTHS } from '../../../platform/time/dates'
import { EditIcon, KIND_ICON, NewIcon } from '../../../platform/ui/icons'
import type { ChangeLine } from '../../../shell/contract'

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
/** One field of a logged payload, whatever shape the payload has. */
const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[key] : null

/** "Oct 2026", from a role's "2026-10". */
const month = (v: unknown): string | null => {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})/.exec(v) : null
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null
}

/** A role's span: "Mar 2021 – now". */
const span = (role: unknown): string =>
  `${month(field(role, 'from')) ?? '…'} – ${month(field(role, 'to')) ?? 'now'}`

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
  // A role is its title at its organisation, as far as the log knows them (FR-044, BUG-083).
  const org = text(field(event.payload, 'organisationName'))
  const role = (title: string | null) =>
    title && org ? `${title} at ${org}` : (title ?? (org ? `a role at ${org}` : null))
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
      const said = role(text(field(event.payload, 'title')))
      return { mark: <Work size={16} />, text: said ? `Took a role: ${said}` : 'Took a role' }
    }
    case 'role_changed': {
      const [a, b] = [text(field(was, 'title')), text(field(now, 'title'))]
      const which = role(b ?? a)
      const ended = month(field(now, 'to'))
      let said: string | null
      if (a !== b) said = `Role changed: ${role(a) ?? 'no title'} → ${role(b) ?? 'no title'}`
      else if (ended && !field(was, 'to') && field(was, 'from') === field(now, 'from'))
        said = which && `${which}: ended ${ended}`
      else said = which && `${which}: ${span(was)} → ${span(now)}`
      return { mark: <Work size={16} />, text: said ?? 'A role changed' }
    }
    case 'role_removed': {
      const said = role(text(field(event.payload, 'title')))
      return { mark: <Work size={16} />, text: said ? `Role removed: ${said}` : 'A role removed' }
    }
    default:
      return null
  }
}
