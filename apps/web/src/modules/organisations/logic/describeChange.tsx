import { EditIcon, InStageIcon, NewIcon } from '../../../platform/ui/icons'
import { StageLabel } from '../../../platform/ui/StageLabel'
import type { ChangeLine } from '../../../shell/contract'
import { ProjectById } from '../components/Standing'

const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
/** One field of a logged payload, whatever shape the payload has. */
const field = (payload: unknown, key: string): unknown =>
  typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>)[key] : null

/** What a field is called on the line. */
const FIELD_WORDS: Record<string, string> = {
  type: 'Type',
  website: 'Website',
  city: 'City',
}

/**
 * An organisation's changes on its timeline (FR-065): "Added", "Renamed from …", "City set to
 * London", and the stage a node related to it moved to, "Stage Contacted → Shortlisted in Find a
 * lawyer". A change of the city's key alone says nothing: the city's line already did.
 */
export function describeOrganisationChange(event: {
  type: string
  payload: unknown
}): ChangeLine | null {
  const was = field(event.payload, 'from')
  const now = field(event.payload, 'to')
  switch (event.type) {
    case 'created':
      return { mark: <NewIcon size={16} />, text: 'Added' }
    case 'merged': {
      const gone = text(field(was, 'name'))
      return gone ? { mark: <NewIcon size={16} />, text: `“${gone}” merged into it` } : null
    }
    case 'stage_changed': {
      const stage = text(now)
      const before = text(was)
      const project = text(field(event.payload, 'projectName'))
      if (!project) return null
      // The stage as its label, the project by its square (G-02); said whole for a reader.
      return {
        mark: <InStageIcon size={16} />,
        text: (
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {stage && before ? (
              // From what to what (FR-044, BUG-083).
              <>
                Stage <StageLabel name={before} quiet={false} /> →{' '}
                <StageLabel name={stage} quiet={false} />
              </>
            ) : stage ? (
              <>
                Stage set to <StageLabel name={stage} quiet={false} />
              </>
            ) : (
              'Stage cleared'
            )}{' '}
            in <ProjectById id={text(field(event.payload, 'projectId'))} name={project} />
          </span>
        ),
      }
    }
    case 'field_changed': {
      const which = text(field(event.payload, 'field'))
      if (which === 'name') {
        const old = text(was)
        return old ? { mark: <EditIcon size={16} />, text: `Renamed from “${old}”` } : null
      }
      if (which === 'note') return { mark: <EditIcon size={16} />, text: 'Notes changed' }
      const words = which ? FIELD_WORDS[which] : undefined
      if (!words) return null
      const to = text(now)
      return {
        mark: <EditIcon size={16} />,
        text: to ? `${words} set to ${to}` : `${words} cleared`,
      }
    }
    default:
      return null
  }
}
