import type { ContactResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { contactsKey, listContacts } from '../api/contacts'
import { ContactDetail } from '../components/ContactDetail'
import { ContactList } from '../components/ContactList'
import { NewContactInput } from '../components/NewContactInput'
import { LIST_MEASURE } from '../rowLead'

/**
 * 联系人.
 *
 * One flat list, by name. No groups, no favourites, no letter index: this is one person's address
 * book, and at the size it will ever reach, sorting it by name and letting search do the rest is
 * what every contact app does before it starts adding structure nobody asked for.
 */
export function Contacts() {
  const contacts = useQuery({ queryKey: contactsKey(), queryFn: () => listContacts() })
  const [openId, setOpenId] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  // Looked up by id rather than held: the open person has to follow the list's refetches, or an
  // edit made in the pane would leave the pane showing what it said before.
  const open = contacts.data?.find((c) => c.id === openId) ?? null

  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
        联系人
      </h1>

      <div className={`mt-4 ${LIST_MEASURE}`}>
        <NewContactInput onCreated={(c: ContactResponse) => setOpenId(c.id)} />
      </div>

      {contacts.isPending && <p className="mt-6 text-fg-muted">加载中…</p>}
      {contacts.isError && (
        <p role="alert" className="mt-6 text-danger">
          {contacts.error instanceof Error
            ? contacts.error.message
            : '加载失败，检查服务是否在运行'}
        </p>
      )}
      {contacts.isSuccess && (
        <div className={`mt-3 ${LIST_MEASURE}`}>
          <ContactList
            contacts={contacts.data}
            emptyLine="还没有联系人"
            onOpen={(c) => setOpenId(c.id)}
          />
        </div>
      )}

      {open && <ContactDetail contact={open} onClose={() => setOpenId(null)} />}
    </>
  )
}
