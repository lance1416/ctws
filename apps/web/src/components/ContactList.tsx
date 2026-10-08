import type { ContactResponse } from '@ctws/contracts'
import { channelHref } from '../api/contacts'
import { useProjectRail } from '../projectColor'
import { sortByName } from '../contactOrder'
import { PanelEmpty } from './Panel'

/**
 * A LIST OF PEOPLE, with their addresses live.
 *
 * The addresses are LINKS, not text to copy: a contact list is opened in order to write to
 * someone, and making them select an address by hand is the whole cost the list existed to
 * remove. Changing anything about a person happens in the detail pane, which is where changing
 * anything about anything happens.
 */
export function ContactList({
  contacts,
  here,
  emptyLine,
  onOpen,
}: {
  contacts: readonly ContactResponse[]
  /** The project this list is already inside, if any -- it is then not repeated on a row. */
  here?: string | undefined
  emptyLine: string
  onOpen: (contact: ContactResponse) => void
}) {
  const rail = useProjectRail()

  if (contacts.length === 0) return <PanelEmpty>{emptyLine}</PanelEmpty>
  return (
    <ul className="flex flex-col">
      {sortByName(contacts).map((person) => {
        const elsewhere = person.projects.filter((p) => p.id !== here)
        return (
          <li key={person.id} className="rounded-lg px-2 py-1.5 hover:bg-surface-hover">
            {/* The app's row anatomy: who they are on the first line, how to reach them on the
                second. */}
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                onClick={() => onOpen(person)}
                className="truncate rounded text-left text-sm font-semibold text-fg hover:underline"
              >
                {person.name}
              </button>
              {person.org && <span className="truncate text-xs text-fg-subtle">{person.org}</span>}
              {elsewhere.map((p) => (
                <span key={p.id} className="flex items-baseline gap-1 text-xs text-fg-subtle">
                  <span
                    aria-hidden="true"
                    className={`relative top-0.5 h-3 w-[3px] shrink-0 rounded-full ${rail(p.id)}`}
                  />
                  {p.name}
                </span>
              ))}
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
        )
      })}
    </ul>
  )
}
