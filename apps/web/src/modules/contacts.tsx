import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { contactsKey, listContacts, searchContacts } from '../api/contacts'
import { ContactDetail, ContactFields } from '../components/ContactDetail'
import { ObjectPage } from '../components/ObjectPage'
import { ContactList } from '../components/ContactList'
import { NewContactInput } from '../components/NewContactInput'
import { Contacts } from '../routes/Contacts'
import type { SearchHit, WorkspaceModule } from './contract'

/**
 * THE CONTACTS MODULE -- the third, and the first one that contributes NOTHING new to the seam.
 *
 * That is the point of it being third: a seam a new module can be built against without changing
 * it is a seam that has stopped being a draft.
 *
 * It contributes a rail row, a chord, a search provider, a project block and where one of its
 * people lives. And nothing else:
 * - no WORKBENCH card, because the workbench answers what is in front of you and an address book
 *   is not
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

/**
 * NO BLOCK ON A PROJECT PAGE.
 *
 * This module's rows reach a project as edges, and the shell draws every kind of edge the same
 * way (framing §2). One of these is made on its own page and filed there, or dropped into the
 * capture box, never from a project page.
 */

/**
 * ONE PERSON'S OWN FIELDS, at the head of their page. The shell draws the page; what a person IS
 * is this module's to say (`relations.Head`).
 */
function ContactHead({ id }: { id: string }) {
  const contacts = useQuery({ queryKey: contactsKey(), queryFn: () => listContacts() })
  const person = contacts.data?.find((c) => c.id === id)
  if (!person) {
    return contacts.isSuccess ? (
      <p className="text-sm text-fg-muted">This person is not here any more.</p>
    ) : null
  }
  return <ContactFields contact={person} />
}

export const contactModule: WorkspaceModule = {
  id: ID,
  label: 'Contacts',
  destinations: [{ id: 'list', to: `/${ID}`, label: 'Contacts', zone: 'things', order: 30 }],
  routes: [
    { index: true, element: <Contacts /> },
    // The page is the SHELL's -- a person and a project are read the same way -- so the module
    // says only where it lives.
    { path: ':id', element: <ObjectPage type="contact" /> },
  ],
  search: { useHits: useContactHits },
  // `n` for name. One keyspace across modules, so this is checked against every other chord.
  chords: [
    { id: 'contacts', key: 'n', label: 'Go to Contacts', resolve: () => `/${ID}`, order: 17 },
  ],
  relations: [{ type: 'contact', kind: 'Person', to: (id) => `/${ID}/${id}`, Head: ContactHead }],
}
