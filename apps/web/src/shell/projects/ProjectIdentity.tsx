import { projectColors, type ProjectColor, type ProjectId } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { projectKeys, updateProject } from './api'
import { problemText } from '../../platform/http/api'
import { railClass } from './projectColor'
import { useInlineEdit } from '../../platform/ui/useInlineEdit'
import { MENU_ITEM, MENU_SURFACE } from '../../platform/ui/menuSurface'

/**
 * A project's name and colour, editable where they are shown. The menu names each slot in words,
 * so the swatch is never the only signal.
 */
export function ProjectIdentity({
  projectId,
  name,
  color,
}: {
  projectId: ProjectId
  name: string
  color: ProjectColor
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) field.current?.select()
  }, [editing])

  const save = useMutation({
    mutationFn: (body: { name?: string; color?: ProjectColor }) => updateProject(projectId, body),
    meta: { changes: ['project'], awaits: [projectKeys.all], ownsError: true },
  })

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== name) save.mutate({ name: next })
    else setDraft(name)
  }
  const nameKeys = useInlineEdit({
    onCommit: commit,
    onCancel: () => {
      setDraft(name)
      setEditing(false)
    },
  })

  return (
    // `flex-1`: sized from its content, the heading would collapse under `min-w-0` and truncate
    // the name to a few characters even at full width.
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="Project colour"
          data-project-chip={projectId}
          className={`h-9 w-[4px] shrink-0 rounded-full ${railClass(color)}`}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={8} className={MENU_SURFACE}>
            {projectColors.map((slot, i) => (
              <DropdownMenu.Item
                key={slot}
                onSelect={() => save.mutate({ color: slot })}
                className={MENU_ITEM}
              >
                <span
                  aria-hidden="true"
                  className={`h-4 w-[3px] shrink-0 rounded-full ${railClass(slot)}`}
                />
                Colour {i + 1}
                {slot === color && <span className="ml-auto pl-3 text-subtle">Current</span>}
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
          {...nameKeys}
          aria-label="Project name"
          className="min-w-0 flex-1 rounded-control border border-line-strong bg-panel px-2 py-0.5 text-title text-ink"
        />
      ) : (
        // The type size sits on the <h1>, not the button; Preflight's `font: inherit` passes it on.
        <h1
          id="project-heading"
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-title text-ink focus:outline-none"
        >
          <button
            type="button"
            onClick={() => {
              setDraft(name)
              setEditing(true)
            }}
            className="-mx-1 max-w-full truncate rounded-control px-1 hover:bg-hover"
          >
            {name}
          </button>
        </h1>
      )}
      {save.isError && (
        <p role="alert" className="shrink-0 text-ui text-stop-t">
          {problemText(save.error)}
        </p>
      )}
    </div>
  )
}
