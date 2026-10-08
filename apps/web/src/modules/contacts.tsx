import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { contactsKey, listContacts, searchContacts } from '../api/contacts'
import { ContactDetail } from '../components/ContactDetail'
import { ContactList } from '../components/ContactList'
import { NewContactInput } from '../components/NewContactInput'
import { Contacts } from '../routes/Contacts'
import type { SearchHit, WorkspaceModule } from './contract'

/**
 * THE CONTACTS MODULE -- the third, and the first one that contributes NOTHING new to the seam.
 *
 * That is the point of it being third. The reading module found a real gap (capture had no way to
 * route a line) and the calendar needed a contribution point of its own; this one wanted neither.
 * A seam that a new module can be built against without changing it is a seam that has stopped
 * being a draft.
 *
 * It contributes a rail row, a chord, a search provider and a project block, and nothing else:
 * - no WORKBENCH card, because the workbench answers 「现在手头有什么」 and an address book is not
 *   something in front of you. A card listing people would be decoration on the one page that is
 *   supposed to be only what is live.
 * - no CALENDAR entries. Birthdays are a vCard property and would put something on the grid, and
 *   that is exactly the kind of feature that gets added because a slot exists rather than because
 *   anyone wants it.
 * - no CAPTURE rule. A pasted email address is far likelier to be a note about someone than a
 *   person to file, and a wrong guess here would be silently filing things in the wrong module.
 */
const ID = 'contacts'

/** This module's half of federated search: names, organisations and addresses. */
function useContactHits(query: string) {
  const results = useQuery({
    queryKey: ['contact-search', query],
    queryFn: () => searchContacts(query),
    enabled: query.length > 0,
  })
  const hits: SearchHit[] = (results.data ?? []).map((person) => ({
    id: person.id,
    to: `/${ID}`,
    title: person.name,
    // What identifies a person at a glance is where they are from and how to reach them.
    meta: [person.org, ...person.projects.map((p) => p.name), person.channels[0]?.value]
      .filter(Boolean)
      .join(' · '),
    mark: null,
  }))
  return { hits, isError: results.isError, isSuccess: results.isSuccess }
}

/** The people on a line of work: a recruiter is on 找工作 exactly as a task is. */
function ContactsProjectView({ projectId }: { projectId: string }) {
  const contacts = useQuery({
    queryKey: contactsKey({ projectId }),
    queryFn: () => listContacts({ projectId }),
  })
  const [openId, setOpenId] = useState<string | null>(null)
  const open = contacts.data?.find((c) => c.id === openId) ?? null

  return (
    <>
      <div className="mb-1 max-w-[52ch]">
        <NewContactInput projectId={projectId} onCreated={(c) => setOpenId(c.id)} />
      </div>
      <ContactList
        contacts={contacts.data ?? []}
        here={projectId}
        emptyLine="还没有联系人"
        onOpen={(c) => setOpenId(c.id)}
      />
      {open && <ContactDetail contact={open} onClose={() => setOpenId(null)} />}
    </>
  )
}

export const contactModule: WorkspaceModule = {
  id: ID,
  label: '联系人',
  destinations: [{ id: 'list', to: `/${ID}`, label: '联系人', zone: 'kept' }],
  routes: [{ index: true, element: <Contacts /> }],
  search: { useHits: useContactHits },
  // `n` for 人. One keyspace across modules, so this is checked against every other chord.
  chords: [{ id: 'contacts', key: 'n', label: '去「联系人」', resolve: () => `/${ID}`, order: 17 }],
  ProjectView: ContactsProjectView,
}
