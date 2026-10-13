import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { createProject, listProjects } from '../api/projects'
import { refreshProjects } from '../api/taskCache'
import { kinds, pinnedPages } from '../modules/registry'
import { railClass } from '../projectColor'
import { useComposing } from '../composition'

/**
 * The left column: where you can go, and how much is waiting there.
 *
 * A column rather than nav links in the top bar, and not for symmetry with other apps: a
 * destination with a NUMBER beside it answers "what is pressing" before you click anything, and
 * a top bar has no room for numbers. The project list carries its open-task count and its
 * identity chip.
 *
 * The pinned pages are not written in here: the registry's `PINNED` names them, and a module only
 * offers its pages. Kinds of thing never get a row of their own -- they are behind Things -- so the
 * rail does not grow with the software. The project list is the shell's own and the only part that
 * grows: the user's life is organised by line of work, and that list is theirs.
 *
 * Deliberately NOT a <ul>/<li>: the pages below render their own lists, and a second set of
 * listitems in the chrome would make "how many rows does this page have" unanswerable, for the
 * reader and for the tests alike.
 */
export function SideRail() {
  // Shares its cache entry with the pages that own it, so the rail costs one extra request per
  // session, not one per navigation.
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const qc = useQueryClient()
  const navigate = useNavigate()
  const composing = useComposing()
  const { pathname } = useLocation()
  const pinned = pinnedPages()
  const within = (to: string) => pathname === to || pathname.startsWith(`${to}/`)
  const inThings =
    within('/things') ||
    kinds().some((k) => k.moduleId !== '' && !pinned.some((p) => p.to === k.to) && within(k.to))
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (naming) field.current?.focus()
  }, [naming])

  /**
   * MAKING A PROJECT, WHERE THE PROJECTS ARE. There was no way to do this outside the /projects
   * page, which meant the one structural thing a workbench is made of could only be made from a
   * page you had to go and find. A `+` beside the group's name, opening a field in place, is
   * what Notion and Linear both put here, and it is the only shape that does not take you
   * somewhere else to do it.
   */
  const create = useMutation({
    mutationFn: createProject,
    onSuccess: async (made) => {
      setName('')
      setNaming(false)
      await refreshProjects(qc)
      // Straight into it: naming a line of work is the start of putting something in it.
      navigate(`/projects/${made.id}`)
    },
  })
  const submit = () => {
    const t = name.trim()
    if (t && !create.isPending) create.mutate({ name: t })
  }

  return (
    // Chrome, not work: the rail and the header share ONE surface (`chrome`), and the page is the
    // `sheet`. That is the figure/ground device -- a frame round the paper, one step off it in
    // both schemes.
    // Wide screens only: below 1024 the bottom bar is the navigation (BottomBar).
    // STICKY under the header, so a long page scrolls past it rather than taking it away and
    // leaving white beside the sheet: the frame stays a frame.
    <div className="hidden flex-col border-rule bg-chrome lg:sticky lg:top-[calc(3.25rem+1px)] lg:flex lg:h-[calc(100vh-3.25rem-1px)] lg:overflow-y-auto lg:border-r lg:py-4 lg:pr-3 lg:pl-4">
      <nav aria-label="Main navigation" className="flex flex-col">
        {/* THREE TIERS, each with a rule for what may enter it.

          The pinned pages cut across every kind and are organised by time and routine; the shell
          picks them (`PINNED`) and there are never more than five. Every kind of thing sits behind
          the single Things row, so a new kind adds a row THERE and nothing here. Only the project
          list grows, and it is the person's own. */}
        {pinned.map(({ key, to, label, end, Count }) => (
          <NavLink
            key={key}
            to={to}
            end={end ?? false}
            className={({ isActive }) =>
              `flex min-h-9 shrink-0 items-center gap-2 rounded-md px-2.5 py-1 whitespace-nowrap ${
                isActive ? 'bg-select font-semibold text-ink' : 'text-ink-muted hover:text-ink'
              }`
            }
          >
            <span>{label}</span>
            {Count && <Count />}
          </NavLink>
        ))}
        <span aria-hidden="true" className="h-3 shrink-0" />
        {/* Things is current on its own page and on every kind's page that is not pinned: a kind
            has no row of its own, so this is the row that says which tier you are in. */}
        <Link
          to="/things"
          aria-current={inThings ? 'page' : undefined}
          className={`flex min-h-9 shrink-0 items-center gap-2 rounded-md px-2.5 py-1 whitespace-nowrap ${
            inThings ? 'bg-select font-semibold text-ink' : 'text-ink-muted hover:text-ink'
          }`}
        >
          Things
        </Link>

        {/* The group label is the link to the full project page; the `+` beside it is the only
          other thing in this row, so there is still no label that merely looks clickable. */}
        <div className="mt-0 flex shrink-0 items-center gap-1 lg:mt-6">
          <NavLink
            to="/projects"
            className={({ isActive }) =>
              `rounded-md px-2.5 py-1 font-semibold whitespace-nowrap lg:text-xs ${
                isActive ? 'text-ink' : 'text-ink-muted hover:text-ink'
              }`
            }
          >
            Projects
          </NavLink>
          <button
            type="button"
            onClick={() => setNaming(true)}
            aria-label="New project"
            className="flex h-6 w-6 items-center justify-center rounded-md text-ink-subtle hover:bg-hover hover:text-ink"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5">
              <path
                d="M8 3.5v9M3.5 8h9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {naming && (
          <input
            ref={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            {...composing.bind}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !composing.composingNow(e)) submit()
              else if (e.key === 'Escape') {
                e.stopPropagation()
                setName('')
                setNaming(false)
              }
            }}
            onBlur={() => {
              if (!name.trim()) setNaming(false)
            }}
            aria-label="New project"
            aria-invalid={create.isError ? true : undefined}
            className={`mx-2.5 block h-8 rounded-md border bg-sheet px-2 text-sm text-ink ${
              create.isError ? 'border-danger' : 'border-rule-strong'
            }`}
          />
        )}

        {/* The person's own lines of work: the only part of the rail that grows. */}
        <div className="flex flex-col">
          {projects.data?.map((p) => (
            <NavLink
              key={p.id}
              to={`/projects/${p.id}`}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-2.5 rounded-md py-1 pr-2 pl-2.5 ${
                  // The current page wears the select layer, with its name in ink: the same
                  // mark of "you are here" as every other selected thing in the app.
                  isActive ? 'bg-select text-ink' : 'text-ink-muted hover:text-ink'
                }`
              }
            >
              <span
                aria-hidden="true"
                className={`h-4 w-[3px] shrink-0 rounded-full ${railClass(p.color)}`}
              />
              <span className="truncate">{p.name}</span>
              {p.openTasks > 0 && (
                <span data-count className="ml-auto pl-1 text-sm text-ink-subtle tabular-nums">
                  {p.openTasks}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
