import type { ContactResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { contactsKey, listContacts } from '../api/contacts'
import { ContactDetail } from '../components/ContactDetail'
import { ContactList } from '../components/ContactList'
import { NewContactDialog } from '../components/NewContactDialog'
import { NewContactInput } from '../components/NewContactInput'
import { LIST_MEASURE } from '../rowLead'

/**
 * CONTACTS.
 *
 * One flat list, by name. No groups, no favourites, no letter index: this is one person's address
 * book, and at the size it will ever reach, sorting it by name and letting search do the rest is
 * what every contact app does before it starts adding structure nobody asked for.
 */
export function Contacts() {
  const contacts = useQuery({ queryKey: contactsKey(), queryFn: () => listContacts() })
  const [openId, setOpenId] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const [making, setMaking] = useState(false)

  // Looked up by id rather than held: the open person has to follow the list's refetches, or an
  // edit made in the pane would leave the pane showing what it said before.
  const open = contacts.data?.find((c) => c.id === openId) ?? null

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          Contacts
        </h1>
        {/* TWO WAYS IN, because there are two moments. The box takes a name when a name is all
            you have; the button opens the form for when you are writing somebody down properly
            and already know where they work and how to reach them. */}
        <button
          type="button"
          onClick={() => setMaking(true)}
          className="h-9 rounded-lg border border-border-strong px-3 text-sm font-semibold text-fg hover:bg-surface-hover"
        >
          New contact
        </button>
      </div>

      <div className={`mt-4 ${LIST_MEASURE}`}>
        <NewContactInput onCreated={(c: ContactResponse) => setOpenId(c.id)} />
      </div>

      {contacts.isPending && <p className="mt-6 text-fg-muted">Loading…</p>}
      {contacts.isError && (
        <p role="alert" className="mt-6 text-danger">
          {contacts.error instanceof Error
            ? contacts.error.message
            : "Couldn't load. Check that the server is running."}
        </p>
      )}
      {contacts.isSuccess && (
        <div className={`mt-3 ${LIST_MEASURE}`}>
          <ContactList
            contacts={contacts.data}
            emptyLine="No contacts yet"
            onOpen={(c) => setOpenId(c.id)}
          />
        </div>
      )}

      {making && (
        <NewContactDialog
          onClose={() => setMaking(false)}
          onMade={(made) => {
            setMaking(false)
            setOpenId(made.id)
          }}
        />
      )}
      {open && <ContactDetail contact={open} onClose={() => setOpenId(null)} />}
    </>
  )
}
