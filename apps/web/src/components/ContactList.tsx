import type { ContactResponse } from '@ctws/contracts'
import { useState } from 'react'
import { channelHref } from '../api/contacts'
import { useProjectRail } from '../projectColor'
import { ContactDialog } from './ContactDialog'
import { PanelEmpty } from './Panel'
import { sortByName } from '../contactOrder'

/**
 * A LIST OF PEOPLE, with their addresses live.
 *
 * The addresses are LINKS, not text to copy: a contact list is opened in order to write to
 * someone, and making them select an address by hand is the whole cost the list existed to
 * remove. `mailto:` and `tel:` are what the platform already has for this.
 */
export function ContactList({
  contacts,
  here,
  emptyLine,
}: {
  contacts: readonly ContactResponse[]
  /** The project this list is already inside, if any -- its name is then not repeated. */
  here?: string | undefined
  emptyLine: string
}) {
  const [editing, setEditing] = useState<ContactResponse | null>(null)
  const rail = useProjectRail()

  if (contacts.length === 0) return <PanelEmpty>{emptyLine}</PanelEmpty>
  return (
    <>
      <ul className="flex flex-col">
        {sortByName(contacts).map((person) => (
          <li key={person.id} className="rounded-lg px-2 py-1.5 hover:bg-surface-hover">
            {/* The app's row anatomy: who they are on the first line, how to reach them on the
                second. A contact row that put the name and four addresses on one wrapping line
                had every name at a different x, which is the thing the row spec exists to stop. */}
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              {person.projectId && person.projectId !== here && (
                <span
                  aria-hidden="true"
                  className={`relative top-0.5 h-3.5 w-[3px] shrink-0 rounded-full ${rail(person.projectId)}`}
                />
              )}
              <button
                type="button"
                onClick={() => setEditing(person)}
                className="truncate rounded text-left text-sm font-semibold text-fg hover:underline"
              >
                {person.name}
              </button>
              {person.org && <span className="truncate text-xs text-fg-subtle">{person.org}</span>}
              {person.projectId && person.projectId !== here && (
                <span className="truncate text-xs text-fg-subtle">{person.projectName}</span>
              )}
            </div>
            {person.channels.length > 0 && (
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                {person.channels.map((c, i) => {
                  const href = channelHref(c.kind, c.value)
                  return (
                    <span key={i} className="flex min-w-0 items-baseline gap-1">
                      {href ? (
                        <a href={href} className="truncate text-sm text-accent hover:underline">
                          {c.value}
                        </a>
                      ) : (
                        <span className="truncate text-sm text-fg">{c.value}</span>
                      )}
                      {c.label && <span className="text-xs text-fg-subtle">{c.label}</span>}
                    </span>
                  )
                })}
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing && <ContactDialog contact={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
