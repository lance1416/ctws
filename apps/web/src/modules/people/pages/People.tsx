import { useQuery } from '@tanstack/react-query'
import { DeletedNotice, useOpenFromUrl } from '../../../shell/detail'
import { useSubjectOf } from '../../../shell/layout'
import { peopleQuery } from '../api'
import { PersonDetail } from '../components/PersonDetail'
import { PeopleOverview } from './PeopleOverview'

/**
 * The People module's main area: the overview, and the person the address names in a pane over
 * it, until a person has a page of their own (FR-061).
 */
export function People() {
  const people = useQuery(peopleQuery())
  const { openId, open, gone, close } = useOpenFromUrl({
    list: people,
    idOf: (c) => c.id,
    type: 'person',
    base: '/people',
  })
  useSubjectOf(open ? { type: 'person', id: open.id, title: open.name } : null)
  // An old address to someone deleted: the main area is what happened to them (artboard 23).
  if (gone && openId) return <DeletedNotice type="person" id={openId} />
  return (
    <>
      <PeopleOverview />
      {/* Keyed, so another person's pane starts clean: no edit or unsaved note carries over. */}
      {open && <PersonDetail key={open.id} person={open} onClose={close} />}
    </>
  )
}
