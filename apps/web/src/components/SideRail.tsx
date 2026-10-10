import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { createProject, listProjects } from '../api/projects'
import { refreshProjects } from '../api/taskCache'
import { railGroups, ZONE_LABEL } from '../modules/registry'
import { QuickCapture } from './QuickCapture'
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
 * The destinations are not written in here: each MODULE contributes its own, and the rail
 * renders whatever is registered (module-boundary contract §3). The project list below them is
 * the shell's own -- the user's life is organised by line of work, and a note about CTWS belongs
 * to CTWS as much as a task does.
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
    // Chrome, not work: the rail, the top bar and the detail pane share ONE surface (`sunken`),
    // and the centre column keeps `surface`. That is the whole figure/ground device -- no cards,
    // no shadows, no hairline round everything, just two planes. It reads in both schemes
    // because `sunken` is darker than `surface` in each.
    <div className="flex flex-col border-border-subtle bg-surface-sunken max-lg:border-b lg:h-[calc(100vh-3.25rem)] lg:overflow-y-auto lg:border-r lg:py-4 lg:pr-3 lg:pl-4">
      {/* CAPTURE LIVES HERE, not in the top bar. It is one of the two things this column is for
          -- where you go, and what you make -- and in the bar it was a single module's action
          taking up half the shell's chrome. `/` still reaches it from anywhere. */}
      <div className="max-lg:px-4 max-lg:pt-2 lg:mb-3">
        <QuickCapture />
      </div>
      <nav
        aria-label="Main navigation"
        className="flex flex-col gap-1 max-lg:flex-row max-lg:items-center max-lg:overflow-x-auto max-lg:px-4 max-lg:py-2 lg:gap-0"
      >
        {/* THREE GROUPS AND THE PROJECTS, by what you are trying to do rather than by which
          module owns a row: what is in front of me now, the kinds of thing I keep, and the ways
          of looking across them. The first needs no name -- it is the top of the rail and the two
          rows in it say what they are -- so it gets the hairline alone.

          One hook per registered count, over a frozen module list: see MODULES on why the list
          must not change at runtime. */}
        {railGroups().map((group, at) => (
          <Fragment key={group.zone}>
            {at > 0 && <span aria-hidden="true" className="my-1.5 h-px bg-border-subtle lg:mx-2" />}
            {ZONE_LABEL[group.zone] && (
              <span className="hidden shrink-0 px-2.5 py-1 text-xs font-semibold text-fg-subtle lg:block">
                {ZONE_LABEL[group.zone]}
              </span>
            )}
            {group.rows.map(({ moduleId, id, to, label, end, Count }) => (
              <NavLink
                key={`${moduleId}:${id}`}
                to={to}
                end={end ?? false}
                className={({ isActive }) =>
                  `flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 py-1 whitespace-nowrap ${
                    isActive
                      ? 'bg-surface-panel font-semibold text-fg'
                      : 'text-fg-muted hover:text-fg'
                  }`
                }
              >
                <span>{label}</span>
                {Count && <Count />}
              </NavLink>
            ))}
          </Fragment>
        ))}

        {/* The group label is the link to the full project page; the `+` beside it is the only
          other thing in this row, so there is still no label that merely looks clickable. */}
        <div className="mt-0 flex shrink-0 items-center gap-1 lg:mt-6">
          <NavLink
            to="/projects"
            className={({ isActive }) =>
              `rounded-lg px-2.5 py-1 font-semibold whitespace-nowrap lg:text-xs ${
                isActive ? 'text-fg' : 'text-fg-muted hover:text-fg'
              }`
            }
          >
            Projects
          </NavLink>
          <button
            type="button"
            onClick={() => setNaming(true)}
            aria-label="New project"
            className="hidden h-6 w-6 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-hover hover:text-fg lg:flex"
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
            className={`mx-2.5 hidden h-8 rounded-md border bg-surface px-2 text-sm text-fg lg:block ${
              create.isError ? 'border-danger' : 'border-border-strong'
            }`}
          />
        )}

        {/* The project list belongs to wide screens: below 1024 the rail is a single row of
          destinations and the projects are one tap away on their own page, which is also where
          they can be created and deleted. */}
        <div className="hidden flex-col lg:flex">
          {projects.data?.map((p) => (
            <NavLink
              key={p.id}
              to={`/projects/${p.id}`}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-2.5 rounded-lg py-1 pr-2 pl-2.5 ${
                  // The current page wears the WORK surface, so the rail says "you are over
                  // there" with the same two planes the layout already uses.
                  isActive ? 'bg-surface-panel text-fg' : 'text-fg-muted hover:text-fg'
                }`
              }
            >
              <span
                aria-hidden="true"
                className={`h-4 w-[3px] shrink-0 rounded-full ${railClass(p.color)}`}
              />
              <span className="truncate">{p.name}</span>
              {p.openTasks > 0 && (
                <span data-count className="ml-auto pl-1 text-sm text-fg-subtle tabular-nums">
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
