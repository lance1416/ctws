import {
  idFrom,
  projectColors,
  projectId,
  type ProjectColor,
  type ProjectResponse,
} from '@ctws/contracts'
import { initialsOf, leastUsedColor } from '@ctws/core'
import { useMutation } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { problemText } from '../../platform/http/api'
import { keyLabel } from '../../platform/keyboard/keys'
import { BUTTON, KEY_ON_INK } from '../../platform/ui/buttonStyles'
import { DangerZone } from '../../platform/ui/DangerZone'
import { field, label } from '../../platform/ui/formStyles'
import { DoneIcon, KIND_ICON } from '../../platform/ui/icons'
import type { Crumbs } from '../layout/page'
import { createProject, projectKeys, updateProject, useEveryProject } from './api'
import { DeleteProject } from './DeleteProject'
import { squareClass } from './projectColor'
import { ProjectSquare } from './ProjectSquare'

const ProjectIcon = KIND_ICON.project

/**
 * What the form holds: the initials are the name's until they are typed over (FR-052), and a new
 * project's colour is the one the server would choose until one is picked (`null`).
 */
type Draft = { name: string; color: ProjectColor | null; initials: string; own: boolean }

const shownInitials = (d: Draft) => (d.own ? d.initials : initialsOf(d.name.trim() || ' ').trim())

export const useNewProjectCrumbs = (): Crumbs => [
  { label: 'Projects', to: '/projects' },
  { label: 'New project' },
]

/** A new project (FR-052): a colour nobody has yet, the initials from the name as it is typed. */
export function NewProject() {
  const navigate = useNavigate()
  const every = useEveryProject()
  const create = useMutation({
    mutationFn: createProject,
    meta: { changes: ['project'], awaits: [projectKeys.all], ownsError: true },
    onSuccess: (made) => navigate(`/projects/${made.id}`),
  })
  return (
    <ProjectForm
      title="New project"
      start={{ name: '', color: null, initials: '', own: false }}
      // Counted over every project, archived ones and the inbox too, as the server counts them.
      chosen={leastUsedColor(every.data?.map((p) => p.color) ?? [])}
      submit="Create project"
      busy={create.isPending}
      error={create.isError ? problemText(create.error) : null}
      cancelTo="/projects"
      onSubmit={(body) => create.mutate(body)}
    />
  )
}

/** The project the address names, live or archived. */
function useEditedProject(): { project: ProjectResponse | undefined; gone: boolean } {
  const { id } = useParams()
  const every = useEveryProject()
  const project = id ? every.data?.find((p) => p.id === idFrom(projectId, id)) : undefined
  return { project, gone: every.isSuccess && !project }
}

export function useEditProjectCrumbs(): Crumbs {
  const { project } = useEditedProject()
  return project
    ? [
        { label: 'Projects', to: '/projects' },
        { label: project.name, to: `/projects/${project.id}` },
        { label: 'Edit' },
      ]
    : []
}

/**
 * A project's name, colour and initials (FR-052), and delete at the foot. Changed here, they
 * change everywhere; renaming leaves the initials as they are.
 */
export function EditProject() {
  const navigate = useNavigate()
  const { project, gone } = useEditedProject()
  const save = useMutation({
    mutationFn: (body: Parameters<typeof updateProject>[1]) => updateProject(project!.id, body),
    meta: { changes: ['project'], awaits: [projectKeys.all], ownsError: true },
    onSuccess: (saved) => navigate(`/projects/${saved.id}`),
  })
  if (gone) return <p className="text-ui text-muted">This project is not here any more.</p>
  if (!project) return null
  return (
    <ProjectForm
      key={project.id}
      title="Edit project"
      start={{ name: project.name, color: project.color, initials: project.initials, own: true }}
      chosen={project.color}
      submit="Save"
      busy={save.isPending}
      error={save.isError ? problemText(save.error) : null}
      cancelTo={`/projects/${project.id}`}
      onSubmit={(body) => save.mutate(body)}
    >
      <DangerZone>
        <DeleteProject id={project.id} />
      </DangerZone>
    </ProjectForm>
  )
}

/**
 * The form both pages share, laid out as artboard 11 lays out a person's: the square as it will
 * look, the title, Cancel and the press that sends it (Ctrl Enter from any field), then the fields
 * in a block.
 */
function ProjectForm({
  title,
  start,
  chosen,
  submit,
  busy,
  error,
  cancelTo,
  onSubmit,
  children,
}: {
  title: string
  start: Draft
  /** The colour it has while none is picked. */
  chosen: ProjectColor
  submit: string
  busy: boolean
  error: string | null
  cancelTo: string
  onSubmit: (body: { name: string; color?: ProjectColor; initials: string }) => void
  children?: ReactNode
}) {
  const [draft, setDraft] = useState(start)
  const [unnamed, setUnnamed] = useState(false)
  const ids = useId()
  const initials = shownInitials(draft)
  const color = draft.color ?? chosen

  const send = () => {
    const name = draft.name.trim()
    if (!name) {
      setUnnamed(true)
      return
    }
    onSubmit({
      name,
      ...(draft.color ? { color: draft.color } : {}),
      initials: initials || initialsOf(name),
    })
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) send()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return
        e.preventDefault()
        if (!busy) e.currentTarget.requestSubmit()
      }}
      className="flex min-h-full flex-col gap-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <ProjectSquare
          project={{
            name: draft.name,
            color,
            initials: initials || '?',
            isInbox: false,
          }}
          size={34}
        />
        <h1
          tabIndex={-1}
          className="min-w-0 flex-1 text-title tracking-[-0.02em] focus:outline-none"
        >
          {title}
        </h1>
        <Link to={cancelTo} className={BUTTON.quiet}>
          Cancel
        </Link>
        <button type="submit" disabled={busy} className={BUTTON.primary}>
          <DoneIcon size={16} aria-hidden="true" />
          {submit}
          <kbd className={KEY_ON_INK}>{keyLabel('Ctrl Enter')}</kbd>
        </button>
      </div>
      {error && (
        <p role="alert" className="text-ui text-stop-t">
          {error}
        </p>
      )}

      <section
        aria-labelledby={`${ids}-head`}
        className="flex max-w-[34rem] flex-col rounded-card border border-line bg-panel"
      >
        <h2
          id={`${ids}-head`}
          className="flex h-10 items-center gap-2 border-b border-line px-3 text-ui font-medium text-ink"
        >
          <ProjectIcon size={16} aria-hidden="true" className="text-muted" />
          Project
        </h2>
        <div className="flex flex-col gap-4 p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-name`} className={label}>
              Name
            </label>
            <input
              id={`${ids}-name`}
              autoFocus
              value={draft.name}
              onChange={(e) => {
                setUnnamed(false)
                setDraft({ ...draft, name: e.target.value })
              }}
              aria-invalid={unnamed || undefined}
              aria-describedby={unnamed ? `${ids}-unnamed` : undefined}
              className={field}
            />
            {unnamed && (
              <p id={`${ids}-unnamed`} className="text-meta text-stop-t">
                Give the project a name.
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className={`${label} mb-1.5`}>Colour</legend>
            <div className="flex flex-wrap gap-2">
              {projectColors.map((c) => (
                <Swatch
                  key={c}
                  color={c}
                  name={`${ids}-color`}
                  checked={c === color}
                  onPick={() => setDraft({ ...draft, color: c })}
                />
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-initials`} className={label}>
              Initials
            </label>
            <div className="flex items-center gap-3">
              <input
                id={`${ids}-initials`}
                value={initials}
                maxLength={2}
                // Cleared, they are the name's again.
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    initials: e.target.value,
                    own: e.target.value.trim() !== '',
                  })
                }
                aria-describedby={`${ids}-initials-from`}
                className={`${field} w-16 font-medium uppercase`}
              />
              <span id={`${ids}-initials-from`} className="text-meta text-subtle">
                {draft.own ? 'One or two characters' : 'From the name'}
              </span>
            </div>
          </div>
        </div>
      </section>
      {children}
    </form>
  )
}

/** One of the eight colours (FR-004) as a radio, named in words so the swatch is not the only sign. */
function Swatch({
  color,
  name,
  checked,
  onPick,
}: {
  color: ProjectColor
  name: string
  checked: boolean
  onPick: () => void
}) {
  const word = color.charAt(0).toUpperCase() + color.slice(1)
  return (
    <label
      title={word}
      className={`relative grid size-7 cursor-pointer place-items-center rounded-control text-on-project ${squareClass(color)} has-[:checked]:outline-2 has-[:checked]:outline-offset-2 has-[:checked]:outline-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-task`}
    >
      <input
        type="radio"
        name={name}
        value={color}
        checked={checked}
        onChange={onPick}
        className="sr-only"
      />
      <span className="sr-only">{word}</span>
      {checked && <DoneIcon size={14} aria-hidden="true" />}
    </label>
  )
}
