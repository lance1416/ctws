import {
  idFrom,
  organisationId,
  personId,
  projectId as projectIdOf,
  type ObjectType,
  type ProjectId,
} from '@ctws/contracts'
import { useNavigate } from 'react-router-dom'
import { usePeople } from '../../people'
import { COMMUNICATION_ID } from '../logic/id'
import { LogMessage } from './LogMessage'
import type { Party } from './PartyPicker'

/**
 * `N X`, Log a message on a page's head, a block's `+` (FR-070): logged from a person or an
 * organisation, it is with them already, and with where the person works now; from a project, it
 * is filed there. Made from Communication itself, its page opens once logged (FR-026).
 */
export function NewMessage({
  projectId,
  about,
  onClose,
  opens,
}: {
  projectId: ProjectId | null
  about: { type: ObjectType; id: string; title: string } | null
  onClose: () => void
  opens: boolean
}) {
  const navigate = useNavigate()
  const people = usePeople()
  // Wait for the people, so someone's employer is there from the first draw.
  if (about?.type === 'person' && !people.data) return null
  const parties: Party[] = []
  if (about?.type === 'organisation')
    parties.push({ type: 'organisation', id: idFrom(organisationId, about.id), name: about.title })
  if (about?.type === 'person') {
    parties.push({ type: 'person', id: idFrom(personId, about.id), name: about.title })
    const person = people.data?.find((p) => p.id === about.id)
    for (const r of person?.roles.filter((r) => r.to === null) ?? [])
      parties.push({ type: 'organisation', id: r.organisationId, name: r.organisationName })
  }
  const filed = projectId ?? (about?.type === 'project' ? idFrom(projectIdOf, about.id) : null)
  return (
    <LogMessage
      what={{ kind: 'new', parties, projectId: filed }}
      onClose={onClose}
      onDone={(saved) => {
        onClose()
        if (opens) navigate(`/${COMMUNICATION_ID}/${saved.id}`)
      }}
    />
  )
}
