import type { ProjectId } from '@ctws/contracts'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { BUTTON, KEY, KEY_ON_INK, LINK } from '../../platform/ui/buttonStyles'
import { ExpandIcon, KIND_ICON, NewIcon, PLACE_ICON } from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import { MENU_ITEM, MENU_SURFACE } from '../../platform/ui/menuSurface'
import type { CaptureTarget } from '../contract'
import { KIND_TEXT, KIND_TINT } from '../../platform/ui/kinds'
import { useProjects } from '../projects/api'
import { ProjectSquare } from '../projects/ProjectSquare'
import { useRegistry } from '../registry'
import { useAccountToday } from '../auth/useMe'
import { DayField } from '../dates'

type Kind = 'task' | 'reading'

/**
 * THE CAPTURE BOX (FR-025, artboard 27): on every page, under the top bar, opened with C or the
 * button. The kind is picked from the line (a link becomes reading, a sentence a task) until it
 * is switched by hand; the line lands in the inbox or the to-read list unless a project is
 * picked, on a day if one is. Enter adds and keeps the box open and empty for the next one; Esc
 * closes it and keeps what was typed.
 */
export function Capture() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [switched, setSwitched] = useState<Kind | null>(null)
  const [projectId, setProjectId] = useState<ProjectId | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  // Where the last line landed, and the page it was said on: another page has moved on.
  const [said, setLanded] = useState<{ name: string; to: string; on: string } | null>(null)
  const { pathname } = useLocation()
  const landed = said?.on === pathname ? said : null
  const box = useRef<HTMLTextAreaElement>(null)
  const projects = useProjects()
  const today = useAccountToday()

  // One hook per module that captures; the registry's list is fixed, so the hook order is too.
  const registry = useRegistry()
  const modules = registry.captures.map(({ moduleId, capture }) => ({
    moduleId,
    kind: capture.kind,
    accepts: capture.accepts,
    ...capture.useTarget(),
  }))
  const line = text.trim()
  const guessed: Kind = modules.find((m) => m.accepts?.(line))?.kind ?? 'task'
  const kind = switched ?? guessed
  const module = modules.find((m) => m.kind === kind)
  const target: CaptureTarget | null = module?.target ?? null
  const fallback = modules.find((m) => m.moduleId === registry.captureModuleId)
  const trouble = fallback?.missing ?? fallback?.unavailable ?? null

  useDocumentKeys(registry.anywhere, {
    capture: () => {
      setOpen(true)
      box.current?.focus()
    },
  })
  useEffect(() => {
    if (open) box.current?.focus()
  }, [open])

  const add = useMutation({
    mutationFn: async () => {
      await target!.submit(line, { projectId, date })
      const project = projectId ? projects.data?.find((p) => p.id === projectId) : undefined
      return project ? { name: project.name, to: `/projects/${project.id}` } : target!
    },
    // `submit` refreshes the lists that now hold the line itself.
    meta: { refresh: false, ownsError: true },
    onSuccess: ({ name, to }) => {
      setLanded({ name, to, on: pathname })
      setText('')
      setSwitched(null)
      setDate(null)
      box.current?.focus()
    },
  })
  const canAdd = line.length > 0 && target !== null && !add.isPending

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canAdd) add.mutate()
    }
  }

  const KindIcon = KIND_ICON[kind]
  const why =
    kind === 'reading'
      ? switched
        ? 'Saved as reading.'
        : 'A link becomes reading. Switch to Task to keep it as a to-do instead.'
      : switched
        ? 'Kept as a task.'
        : 'A sentence becomes a task.'
  const landing = projectId ? (projects.data?.find((p) => p.id === projectId) ?? null) : null
  const inbox = projects.data?.find((p) => p.isInbox)

  return (
    <div className="relative w-60 shrink">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex h-7.5 w-full items-center gap-2 rounded-control border bg-panel px-2.5 text-ui hover:bg-hover ${
          open ? 'border-task text-ink' : 'border-line-strong text-subtle'
        }`}
      >
        <NewIcon size={16} aria-hidden="true" className={open ? 'text-task' : ''} />
        <span className="flex-1 text-left">Capture</span>
        <kbd className={KEY}>{open ? 'Esc' : 'C'}</kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Capture"
          className={`absolute top-full left-0 ${LAYER.menu} mt-2 flex w-105 flex-col rounded-block bg-float pt-3 shadow-float max-sm:fixed max-sm:inset-x-4 max-sm:w-auto`}
        >
          <textarea
            ref={box}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            aria-label="Capture"
            placeholder="A thought, or a link"
            disabled={!fallback?.target}
            className="mx-3 min-h-16 resize-none rounded-card border border-line-strong bg-panel px-3 py-2.5 text-prose text-ink placeholder:text-subtle disabled:opacity-50"
          />
          <div
            role="radiogroup"
            aria-label="Kind"
            className="mx-3 mt-2.5 grid grid-cols-3 rounded-card bg-hover p-0.5"
          >
            <Segment on={kind === 'task'} onClick={() => setSwitched('task')} icon={KIND_ICON.task}>
              Task
            </Segment>
            <Segment
              on={kind === 'reading'}
              onClick={() => setSwitched('reading')}
              icon={KIND_ICON.reading}
            >
              Reading
            </Segment>
            <Segment on={false} disabled icon={KIND_ICON.meeting}>
              Event
              <span className="inline-flex h-5 items-center rounded-key bg-warn-bg px-1.5 text-meta font-medium text-warn-t">
                Later
              </span>
            </Segment>
          </div>
          <p className="mx-3 mt-1.5 flex items-center gap-1.5 text-meta text-subtle">
            <KindIcon size={12} aria-hidden="true" />
            {why}
          </p>
          <div className="mt-2.5 flex items-center gap-2 border-t border-line px-3 py-2.5">
            <span className="text-meta whitespace-nowrap text-subtle">Lands in</span>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label="Lands in"
                className={`inline-flex h-6 items-center gap-1.5 rounded-control px-2 text-meta font-medium ${KIND_TINT[landing ? 'project' : kind]} ${KIND_TEXT[landing ? 'project' : kind]}`}
              >
                {landing ? (
                  <>
                    <ProjectSquare project={landing} className="-ml-0.5 size-4 text-[9px]" />
                    {landing.name}
                  </>
                ) : (
                  <>
                    <KindIcon size={12} aria-hidden="true" />
                    {target?.name ?? (kind === 'task' ? 'Inbox' : 'To read')}
                  </>
                )}
                <ExpandIcon size={12} aria-hidden="true" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="start" sideOffset={6} className={MENU_SURFACE}>
                  <DropdownMenu.Item onSelect={() => setProjectId(null)} className={MENU_ITEM}>
                    <KindIcon size={14} aria-hidden="true" className={KIND_TEXT[kind]} />
                    {kind === 'task' ? (inbox?.name ?? 'Inbox') : 'To read'}
                  </DropdownMenu.Item>
                  {projects.data
                    ?.filter((p) => !p.isInbox)
                    .map((p) => (
                      <DropdownMenu.Item
                        key={p.id}
                        onSelect={() => setProjectId(p.id)}
                        className={MENU_ITEM}
                      >
                        <ProjectSquare project={p} />
                        <span className="truncate">{p.name}</span>
                      </DropdownMenu.Item>
                    ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {picking || date ? (
              <DayField
                label="Day"
                value={date}
                onChange={(next) => {
                  setDate(next)
                  if (next === null) setPicking(false)
                }}
                today={today}
                className="w-40"
              />
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="inline-flex h-6 items-center gap-1.5 rounded-control bg-hover px-2 text-meta font-medium text-muted"
              >
                <PLACE_ICON.calendar size={12} aria-hidden="true" />
                No date
              </button>
            )}
            <span aria-hidden="true" className="flex-1" />
            <button
              type="button"
              onClick={() => add.mutate()}
              disabled={!canAdd}
              className={`${BUTTON.primary} h-7.5`}
            >
              Add
              <kbd className={KEY_ON_INK}>Enter</kbd>
            </button>
          </div>
          {(trouble || landed || add.isError) && (
            <div className="border-t border-line px-3 py-2 text-meta">
              {trouble && (
                <p role="alert" className="text-stop-t">
                  {trouble}
                </p>
              )}
              {add.isError && (
                <p role="alert" className="text-stop-t">
                  Couldn't save. Press Enter to try again.
                </p>
              )}
              {landed && !add.isError && (
                <p role="status" className="truncate text-muted">
                  Added to{' '}
                  <Link to={landed.to} className={LINK}>
                    {landed.name}
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Segment({
  on,
  disabled = false,
  onClick,
  icon: Icon,
  children,
}: {
  on: boolean
  disabled?: boolean
  onClick?: () => void
  icon: (typeof KIND_ICON)[keyof typeof KIND_ICON]
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-control text-meta font-medium ${
        on ? 'bg-panel text-ink ring-1 ring-line' : 'text-muted'
      } disabled:opacity-60`}
    >
      <Icon size={14} aria-hidden="true" />
      {children}
    </button>
  )
}
