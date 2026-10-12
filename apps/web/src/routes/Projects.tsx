import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { refreshProjects } from '../api/taskCache'
import { createProject, listProjects } from '../api/projects'
import { railClass } from '../projectColor'
import { useComposing } from '../composition'
import { textbox } from '../components/formStyles'
import { useCrumbs } from '../components/Location'

export function Projects() {
  useCrumbs([{ label: 'Projects' }])
  const qc = useQueryClient()
  const composing = useComposing()
  const [name, setName] = useState('')
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })

  const create = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      setName('')
      return refreshProjects(qc)
    },
  })
  const heading = useRef<HTMLHeadingElement>(null)

  const submit = () => {
    const n = name.trim()
    if (n && !create.isPending) create.mutate({ name: n })
  }

  return (
    <>
      <h1 ref={heading} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
        Projects
      </h1>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        {...composing.bind}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !composing.composingNow(e)) submit()
        }}
        placeholder="New project"
        aria-label="New project"
        className={`mt-5 w-full max-w-[40ch] bg-sheet ${textbox}`}
      />
      {projects.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          Couldn't load projects
        </p>
      )}
      {create.isError && (
        <p role="alert" className="mt-4 text-sm text-danger">
          That didn't work. Try again.
        </p>
      )}
      {/* Rendered in the order the server returns: it puts the inbox first. Sorting here too
          would give two sorts that drift apart. */}
      {/* A list measure of its own, like every other list in the app (see RowParts): at 64ch the
          count sat ~450px from the short project name it belonged to -- the stranded right-hand
          column stages 1 and 2 fixed on Today and Done and never came back for here. */}
      <ul className="mt-5 flex max-w-[30rem] flex-col">
        {projects.data?.map((p) => (
          <li
            key={p.id}
            role="listitem"
            // A grid, not justify-between: a floating count puts the inbox row's number in a
            // different place from every other row's, and a column of numbers that does not line
            // up is worse than none.
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3"
          >
            <Link
              to={`/projects/${p.id}`}
              className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover"
            >
              {/* The identity rail, same meaning and same width as in the left column and (from
                  stage 2) on every task row. Never alone: the name is right beside it. */}
              <span
                aria-hidden="true"
                className={`h-4 w-[3px] shrink-0 rounded-full ${railClass(p.color)}`}
              />
              <span className="truncate">{p.name}</span>
            </Link>
            {/* HOW MUCH IS WAITING HERE. The server's own count of open tasks, never
                counted on this side.
                OUTSIDE the link on purpose: inside, it would become part of the link's
                accessible name, and "P" would no longer be the name of the link to P.
                Zero is drawn as NOTHING, the way the left rail draws it: a column whose job is
                "how much is waiting here" is silent when nothing is, or the emptiest row is the
                loudest thing on the page. */}
            <span data-count className="justify-self-end text-xs text-ink-muted">
              {p.openTasks > 0 ? `${p.openTasks} open` : ''}
            </span>
            {/* NO DELETE IN THE ROW. It lives at the foot of the project's own page, where every
                other destructive action in this app lives -- a list is a place you aim at names,
                and a control that destroys a project should not be one of the things under your
                pointer while you do. */}
          </li>
        ))}
      </ul>
    </>
  )
}
