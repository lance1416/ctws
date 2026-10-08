import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { contactsKey, listContacts } from '../api/contacts'
import { ContactDialog } from '../components/ContactDialog'
import { ContactList } from '../components/ContactList'
import { LIST_MEASURE } from '../rowLead'

/**
 * 联系人.
 *
 * One flat list, by name. No groups, no favourites, no letter index: this is one person's address
 * book, and at the size it will ever reach, sorting it alphabetically and letting search do the
 * rest is what every contact app does before it starts adding structure nobody asked for.
 */
export function Contacts() {
  const contacts = useQuery({ queryKey: contactsKey(), queryFn: () => listContacts() })
  const [adding, setAdding] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          联系人
        </h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="h-8 rounded-lg border border-border-strong px-2.5 text-sm text-fg hover:bg-surface-hover"
        >
          新建
        </button>
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
        <div className={`mt-4 ${LIST_MEASURE}`}>
          <ContactList contacts={contacts.data} emptyLine="还没有联系人" />
        </div>
      )}

      {adding && <ContactDialog contact={null} onClose={() => setAdding(false)} />}
    </>
  )
}
