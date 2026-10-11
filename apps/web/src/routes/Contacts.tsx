import type { Circle, ContactResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { contactsKey, listContacts } from '../api/contacts'
import { ContactDetail } from '../components/ContactDetail'
import { ContactList } from '../components/ContactList'
import { NewContactDialog } from '../components/NewContactDialog'
import { NewContactInput } from '../components/NewContactInput'
import { LIST_MEASURE } from '../rowLead'
import { BUTTON } from '../components/buttonStyles'
import { CIRCLE_LABELS } from '../components/BirthdayRow'

/**
 * CONTACTS.
 *
 * One flat list, by name. No groups, no favourites, no letter index: this is one person's address
 * book, and at the size it will ever reach, sorting it by name and letting search do the rest is
 * what every contact app does before it starts adding structure nobody asked for.
 */
export function Contacts() {
  const contacts = useQuery({ queryKey: contactsKey(), queryFn: () => listContacts() })
  /**
   * 开着的是谁，写在 URL 里 —— 这一层就是 `/contacts/<id>` 本身。
   *
   * 一个人没有自己的页：任务也没有（`relations.to` 指的是 `/projects?task=<id>`）。URL 留着，
   * 反向链接和粘进来的链接才有地方可去；列表留在后面，筛选和滚动位置不会因为看一眼某个人就丢。
   * 状态只有一处（地址栏），所以后退、前进、刷新都不必另外伺候。
   */
  const { id: openId = null } = useParams()
  const navigate = useNavigate()
  const setOpenId = (next: string | null) => navigate(next ? `/contacts/${next}` : '/contacts')
  const heading = useRef<HTMLHeadingElement>(null)
  const [making, setMaking] = useState(false)
  const [circle, setCircle] = useState<Circle | null>(null)

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
        <button type="button" onClick={() => setMaking(true)} className={BUTTON.secondary}>
          New contact
        </button>
      </div>

      <div className={`mt-4 ${LIST_MEASURE}`}>
        <NewContactInput onCreated={(c: ContactResponse) => setOpenId(c.id)} />
      </div>

      {/* 链接指向的人已经不在了：说出来。静静地只剩一个列表，读起来像链接坏了。 */}
      {openId !== null && contacts.isSuccess && open === null && (
        <p role="alert" className="mt-4 text-sm text-fg-muted">
          This person is not here any more.
        </p>
      )}
      {contacts.isPending && <p className="mt-6 text-fg-muted">Loading…</p>}
      {contacts.isError && (
        <p role="alert" className="mt-6 text-danger">
          {contacts.error instanceof Error
            ? contacts.error.message
            : "Couldn't load. Check that the server is running."}
        </p>
      )}
      {/* ONE LIST, FILTERED -- never a second list. The circle is how an address book that also
          holds fifty relatives stays readable, and nothing is hidden by default: a row that has
          vanished is worse than a long list (birthdays spec §1). */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {([null, 'family', 'friend', 'work'] as const).map((key) => {
          const picked = circle === key
          return (
            <button
              key={key ?? 'all'}
              type="button"
              aria-pressed={picked}
              onClick={() => setCircle(key)}
              className={picked ? BUTTON.secondary : BUTTON.quiet}
            >
              {key === null ? 'Everyone' : CIRCLE_LABELS[key]}
            </button>
          )
        })}
      </div>

      {contacts.isSuccess && (
        <div className={`mt-3 ${LIST_MEASURE}`}>
          <ContactList
            contacts={contacts.data.filter((c) => circle === null || c.circle === circle)}
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
