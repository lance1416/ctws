import type { PersonResponse } from '@ctws/contracts'
import { channelHref } from '../api/people'
import { byKind, channelLabel } from '../channels'
import { useProjectRail } from '../projectColor'
import { sortByName } from '../peopleOrder'
import { usePhone } from '../usePhone'
import { PanelEmpty } from './Panel'

/**
 * A LIST OF PEOPLE, with their addresses live.
 *
 * The addresses are LINKS, not text to copy: a person list is opened in order to write to
 * someone, and making them select an address by hand is the whole cost the list existed to
 * remove. Everything else on the row opens the person, because a card whose only target is its
 * title makes you aim at four characters. Changing anything about them happens in the pane,
 * which is where changing anything about anything happens.
 */
export function PeopleList({
  people,
  here,
  emptyLine,
  onOpen,
}: {
  people: readonly PersonResponse[]
  /** The project this list is already inside, if any -- it is then not repeated on a row. */
  here?: string | undefined
  emptyLine: string
  onOpen: (person: PersonResponse) => void
}) {
  const rail = useProjectRail()
  const phone = usePhone()

  if (people.length === 0) return <PanelEmpty>{emptyLine}</PanelEmpty>
  return (
    <ul className="flex flex-col">
      {sortByName(people).map((person) => {
        const elsewhere = person.projects.filter((p) => p.id !== here)
        return (
          /* THE WHOLE ROW OPENS THE PERSON -- a card whose only target is its title makes you
             aim at four characters. The click is on the row; the NAME is
             still a real button, which is what the keyboard reaches and what a screen reader
             announces. A row that were itself a button could not contain the address links. */
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={person.id}
            onClick={() => onOpen(person)}
            className="group cursor-pointer rounded-lg px-2 py-1.5 hover:bg-surface-hover"
          >
            {/* The app's row anatomy: who they are on the first line, how to reach them on the
                second. */}
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                // 行本身也开这个人：不拦住冒泡的话，点名字会开两次 —— 以前两次写的是同一个
                // 局部状态，看不出来；现在开一次就是一次导航，历史里会多出一条一模一样的记录。
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(person)
                }}
                data-person-name
                className="truncate rounded text-left text-sm font-semibold text-fg group-hover:underline"
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
                {/* 归堆、按类型写：和那一层里是同一套规则，一个人不该在两处看见两种写法。 */}
                {byKind(person.channels).map((c, i) => (
                  <span key={i} className="flex min-w-0 items-baseline gap-1">
                    <a
                      href={channelHref(c.kind, c.value)!}
                      // The address is its own target: writing to someone is not opening them.
                      onClick={(e) => e.stopPropagation()}
                      className={`truncate text-sm text-accent hover:underline ${
                        c.kind === 'phone' ? 'tabular-nums' : ''
                      }`}
                    >
                      {channelLabel(c.kind, c.value, phone?.displayPhone)}
                    </a>
                    {c.label && <span className="text-xs text-fg-subtle">{c.label}</span>}
                  </span>
                ))}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
