import { resourceLook } from '@ctws/core'
import {
  api,
  idFrom,
  projectId as projectIdSchema,
  taskId as taskIdSchema,
  type ProjectId,
} from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useMatch } from 'react-router-dom'
import { call } from '../../platform/http/api'
import { DialogFooter } from '../../platform/ui/DialogFooter'
import { forgetDraft, keepDraft, keptDraft } from '../../platform/ui/drafts'
import { textbox } from '../../platform/ui/formStyles'
import { KIND_ICON } from '../../platform/ui/icons'
import { Modal } from '../../platform/ui/Modal'
import { useInspector } from '../layout/inspectorAddress'
import { ProjectPicker, ProjectSquare, useEveryProject } from '../projects'
import { addResource, pinOnProject, resourceKeys } from './api'
import { ResourceIcon } from './ResourceIcon'

const DRAFT = 'link:new'
type Draft = { url: string; name: string; project: ProjectId | null }

/**
 * N L, PIN A LINK (FR-029): the address, a name if wanted, and the service it was recognised as,
 * hung where you are. A task open in the inspector takes it in its Resources (Add); a project's
 * page, with nothing in the inspector, pins it in its head at the first free digit (Pin); anywhere
 * else it asks which project to pin it on. Esc closes and keeps what was typed.
 */
export function PinLink({
  onClose,
  pick = false,
}: {
  onClose: () => void
  /** Always asks for the project: the workbench's launcher, which pins on one whatever is open. */
  pick?: boolean
}) {
  const inspected = useInspector().open
  const onProject = useMatch('/projects/:id')?.params.id
  const projects = useEveryProject().data ?? []
  const [kept] = useState(() => keptDraft<Draft>(DRAFT))
  const [url, setUrl] = useState(kept?.url ?? '')
  const [name, setName] = useState(kept?.name ?? '')
  const [picked, setPicked] = useState<ProjectId | null>(kept?.project ?? null)

  const task = !pick && inspected?.type === 'task' ? idFrom(taskIdSchema, inspected.id) : null
  const here = !pick && !inspected && onProject ? idFrom(projectIdSchema, onProject) : null
  const project = here ?? picked
  const taskTitle = useQuery({
    queryKey: ['task', 'title', task],
    queryFn: ({ signal }) => call(api.tasks.get, { params: { id: task! } }, { signal }),
    enabled: task !== null,
    select: (t) => t.title,
  }).data

  const typed = url.trim()
  const recognised = /^https?:\/\/\S+$/i.test(typed) ? resourceLook(typed) : null
  useEffect(() =>
    keepDraft(DRAFT, typed !== '' || name.trim() !== '' ? { url, name, project: picked } : null),
  )

  const owner = task
    ? ({ type: 'task', id: task } as const)
    : project
      ? ({ type: 'project', id: project } as const)
      : null
  const save = useMutation({
    mutationFn: async () => {
      const resource = { url: typed, name: name.trim() || null }
      if (task) return addResource({ type: 'task', id: task }, resource)
      const made = await pinOnProject(project!, resource)
      if (!made) throw new Error('Nine are pinned on that project, one for each digit')
      return made
    },
    meta: {
      changes: [owner?.type ?? 'project'],
      awaits: owner ? [resourceKeys.of(owner), resourceKeys.pinned] : [],
      ownsError: true,
    },
    onSuccess: () => {
      forgetDraft(DRAFT)
      onClose()
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (recognised && owner && !save.isPending) save.mutate()
  }
  const verb = task ? 'Add' : 'Pin'
  const there = project ? projects.find((p) => p.id === project) : undefined

  return (
    <Modal title="Pin a link" onClose={onClose} picker unsaved={typed !== '' || name.trim() !== ''}>
      <form
        onSubmit={submit}
        noValidate
        aria-label="Pin a link"
        className="flex flex-col gap-2.5 p-3"
      >
        {/* Where it lands, said first: the task in the inspector, this project, or a choice. */}
        <p data-pin-where className="flex min-w-0 items-center gap-1.5 text-meta text-muted">
          {task ? (
            <>
              <span className="shrink-0">Adds to</span>{' '}
              <KIND_ICON.task size={14} aria-hidden="true" className="shrink-0 text-task" />
              <span className="truncate font-medium text-ink">{taskTitle ?? 'this task'}</span>
            </>
          ) : here ? (
            <>
              <span className="shrink-0">Pins on</span> {there && <ProjectSquare project={there} />}
              <span className="truncate font-medium text-ink">{there?.name ?? 'this project'}</span>
            </>
          ) : (
            <>
              <span className="shrink-0">Pins on</span>{' '}
              <ProjectPicker value={picked} onPick={setPicked} none="Choose a project" />
            </>
          )}
        </p>
        {/* The service it is recognised as, its icon at the head of the box (artboard 27). */}
        <div className="relative">
          {recognised && (
            <span
              data-recognised
              title={recognised.source || recognised.label}
              className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center"
            >
              <ResourceIcon url={typed} size={16} />
            </span>
          )}
          <input
            type="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            aria-label="Address"
            className={`w-full bg-panel ${textbox} ${recognised ? 'pl-8' : ''}`}
          />
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={recognised ? recognised.label : 'Name (optional)'}
          aria-label="Name (optional)"
          className={`w-full bg-panel ${textbox}`}
        />
        {save.isError && (
          <p role="alert" className="text-meta text-stop-t">
            {save.error.message.startsWith('Nine')
              ? save.error.message
              : `Couldn’t ${verb.toLocaleLowerCase()} it. What you typed is still here.`}
          </p>
        )}
        <DialogFooter
          submit={verb}
          busy={save.isPending}
          disabled={!recognised || !owner}
          onCancel={() => {
            forgetDraft(DRAFT)
            onClose()
          }}
        />
      </form>
    </Modal>
  )
}
