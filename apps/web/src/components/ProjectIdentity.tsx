import { projectColors, type ProjectColor } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { updateProject } from '../api/projects'
import { refreshProjects } from '../api/taskCache'
import { railClass } from '../projectColor'
import { useComposing } from '../composition'
import { MENU_SURFACE } from './menuSurface'

/**
 * A PROJECT'S NAME AND COLOUR, EDITABLE WHERE THEY ARE SHOWN.
 *
 * The server has taken both since M2a and nothing in the interface could write either: the inbox
 * was stuck being called "Inbox" in an otherwise Chinese app, and a project's identity colour was
 * whichever slot it happened to be handed. This is the whole of the missing half -- a name you
 * can click, and the six slots behind the chip.
 *
 * The chip stays a chip: it is still never alone, the name is always beside it (WCAG 1.4.1), and
 * the menu's items carry the slot's number in words rather than relying on the swatch.
 */
export function ProjectIdentity({
  projectId,
  name,
  color,
}: {
  projectId: string
  name: string
  color: ProjectColor | null
}) {
  const qc = useQueryClient()
  const composing = useComposing()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) field.current?.select()
  }, [editing])

  const save = useMutation({
    mutationFn: (body: { name?: string; color?: ProjectColor }) => updateProject(projectId, body),
    onSuccess: () => refreshProjects(qc),
  })

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== name) save.mutate({ name: next })
    else setDraft(name)
  }

  return (
    // `flex-1`: the heading is a BUTTON inside the <h1> now, and a flex item sized from its
    // content collapses to nothing once `min-w-0` lets it, truncating the title to a few
    // characters at full width. An e2e cannot see it: truncation is CSS, and the name is whole.
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Project colour"
          data-project-chip={projectId}
          className={`h-7 w-[4px] shrink-0 rounded-full ${railClass(color)}`}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={8} className={MENU_SURFACE}>
            {projectColors.map((slot, i) => (
              <DropdownMenu.Item
                key={slot}
                onSelect={() => save.mutate({ color: slot })}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
              >
                <span
                  aria-hidden="true"
                  className={`h-4 w-[3px] shrink-0 rounded-full ${railClass(slot)}`}
                />
                Colour {i + 1}
                {slot === color && <span className="ml-auto pl-3 text-fg-subtle">Current</span>}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {editing ? (
        <input
          ref={field}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          {...composing.bind}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !composing.composingNow(e)) commit()
            else if (e.key === 'Escape') {
              e.stopPropagation()
              setDraft(name)
              setEditing(false)
            }
          }}
          aria-label="Project name"
          className="min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2 py-0.5 text-xl font-semibold text-fg"
        />
      ) : (
        // The TYPE lives on the <h1>, not on the button inside it: the heading is what the
        // typography spec measures, and a button that carried the pair would leave the h1
        // reading as body text to anything inspecting it. Preflight gives the button `font:
        // inherit`, so it wears the heading's pair without naming it.
        <h1
          id="project-heading"
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-xl font-semibold text-fg focus:outline-none"
        >
          <button
            type="button"
            onClick={() => {
              setDraft(name)
              setEditing(true)
            }}
            className="-mx-1 max-w-full truncate rounded-lg px-1 hover:bg-surface-hover"
          >
            {name}
          </button>
        </h1>
      )}
    </div>
  )
}
