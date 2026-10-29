import type { ProjectId } from '@ctws/contracts'
import { radioKeys } from '../../platform/ui/choiceKeys'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDocumentKeys } from '../../platform/keyboard/keyTable'
import { BUTTON, KEY, KEY_ON_INK, LINK } from '../../platform/ui/buttonStyles'
import { useOnline } from '../../platform/http/online'
import {
  AlertIcon,
  ExpandIcon,
  InboxIcon,
  KIND_ICON,
  LinkIcon,
  NewIcon,
  PLACE_ICON,
} from '../../platform/ui/icons'
import { LAYER } from '../../platform/ui/layers'
import { MENU_ITEM, MENU_SURFACE } from '../../platform/ui/menuSurface'
import type { CaptureTarget } from '../contract'
import { KIND_TEXT } from '../../platform/ui/kinds'
import { useProjects } from '../projects/api'
import { ProjectSquare } from '../projects/ProjectSquare'
import { useRegistry } from '../registry'
import { useAccountToday } from '../auth/useMe'
import { DayField } from '../dates'

type Kind = 'task' | 'reading'

/** The event a page's own Add sends to open the box on one kind: "Add reading" (FR-072). */
const OPEN = 'ctws:capture'

/** Opens the capture box with this kind chosen, from a page's own button. */
export function openCapture(kind: Kind): void {
  window.dispatchEvent(new CustomEvent<Kind>(OPEN, { detail: kind }))
}

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
  // A day the field could not read, said in the box's status line so the row does not grow.
  const [refusal, setRefusal] = useState<string | null>(null)
  const online = useOnline()
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
  // And again once the box can take it: opened before the inbox is read, it is still disabled.
  const ready = Boolean(fallback?.target)
  useEffect(() => {
    if (open) box.current?.focus()
  }, [open, ready])
  useEffect(() => {
    const onOpen = (e: Event) => {
      setSwitched((e as CustomEvent<Kind>).detail)
      setOpen(true)
      box.current?.focus()
    }
    window.addEventListener(OPEN, onOpen)
    return () => window.removeEventListener(OPEN, onOpen)
  }, [])

  const add = useMutation({
    mutationFn: async (sent: string) => {
      await target!.submit(sent, { projectId, date })
      const project = projectId ? projects.data?.find((p) => p.id === projectId) : undefined
      return {
        sent,
        ...(project ? { name: project.name, to: `/projects/${project.id}` } : target!),
      }
    },
    // `submit` refreshes the lists that now hold the line itself.
    meta: { refresh: false, ownsError: true },
    onSuccess: ({ sent, name, to }) => {
      setLanded({ name, to, on: pathname })
      // Emptied only if it still holds what was sent: what was typed since is the next line.
      setText((now) => (now.trim() === sent ? '' : now))
      setSwitched(null)
      setDate(null)
      box.current?.focus()
    },
  })
  // Offline, nothing can be saved, so Add waits with the line kept (FR-033).
  const canAdd = line.length > 0 && target !== null && !add.isPending && online

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canAdd) add.mutate(line)
    }
  }

  const KindIcon = KIND_ICON[kind]
  // A link guessed into reading says so with the link's own icon (artboard 27).
  const WhyIcon = kind === 'reading' && !switched ? LinkIcon : KindIcon
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
            onChange={(e) => {
              setText(e.target.value)
              // What was said about the last line goes once the next one starts.
              setLanded(null)
            }}
            onKeyDown={onKeyDown}
            rows={2}
            aria-label="Capture"
            placeholder="A thought, or a link"
            disabled={!fallback?.target}
            className="mx-3 min-h-16 resize-none rounded-card border border-line-strong bg-panel px-3 py-2.5 text-prose text-ink placeholder:text-subtle disabled:opacity-50"
          />
          <div
            role="radiogroup"
            onKeyDown={radioKeys}
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
            <WhyIcon size={12} aria-hidden="true" />
            {why}
          </p>
          <div className="mt-2.5 flex items-center gap-2 border-t border-line px-3 py-2.5">
            <span className="text-meta whitespace-nowrap text-subtle">Lands in</span>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger
                aria-label="Lands in"
                // A task lands in a project, grey; only reading's shelf wears its kind (artboard 27).
                className={`inline-flex h-6 max-w-36 min-w-0 shrink-0 items-center gap-1.5 rounded-control px-2 text-meta font-medium ${
                  kind === 'reading' && !landing
                    ? 'bg-reading-bg text-reading-t'
                    : 'bg-project-bg text-project-t'
                }`}
              >
                {landing ? (
                  <>
                    <ProjectSquare project={landing} className="-ml-0.5 size-4 text-[9px]" />
                    <span className="truncate">{landing.name}</span>
                  </>
                ) : (
                  <>
                    {kind === 'task' ? (
                      <InboxIcon size={12} aria-hidden="true" className="shrink-0" />
                    ) : (
                      <KindIcon size={12} aria-hidden="true" className="shrink-0" />
                    )}
                    <span className="truncate">
                      {target?.name ?? (kind === 'task' ? 'Inbox' : 'To read')}
                    </span>
                  </>
                )}
                <ExpandIcon size={12} aria-hidden="true" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="start" sideOffset={6} className={MENU_SURFACE}>
                  <DropdownMenu.Item onSelect={() => setProjectId(null)} className={MENU_ITEM}>
                    {kind === 'task' ? (
                      <InboxIcon size={14} aria-hidden="true" className="text-project" />
                    ) : (
                      <KindIcon size={14} aria-hidden="true" className={KIND_TEXT[kind]} />
                    )}
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
                onRefusal={setRefusal}
                // Room for "Oct 29" and its two buttons; it gives way before the chip or Add do.
                className="w-28 min-w-24 shrink"
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
              onClick={() => add.mutate(line)}
              disabled={!canAdd}
              className={`${BUTTON.primary} h-7.5 shrink-0`}
            >
              Add
              <kbd className={KEY_ON_INK}>Enter</kbd>
            </button>
          </div>
          {(trouble || landed || add.isError || refusal || !online) && (
            <div className="flex flex-col gap-1 border-t border-line px-3 py-2 text-meta">
              {refusal && (
                <p role="alert" className="flex items-start gap-1 text-stop-t">
                  <AlertIcon size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
                  {refusal}
                </p>
              )}
              {!online && (
                <p role="status" className="text-muted">
                  You’re offline. This stays here until you can save.
                </p>
              )}
              {fallback?.missing && (
                <p role="alert" className="text-stop-t">
                  {fallback.missing}
                </p>
              )}
              {/* `status`, not `alert`: the projects page already alerts on the same failure. */}
              {fallback?.unavailable && (
                <p role="status" className="text-stop-t">
                  {fallback.unavailable}
                </p>
              )}
              {add.isError && (
                <p role="alert" className="flex items-center gap-2 text-stop-t">
                  Couldn’t save. What you typed is still here.
                  <button
                    type="button"
                    onClick={() => add.mutate(line)}
                    disabled={!canAdd}
                    className={LINK}
                  >
                    Try again
                  </button>
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
      tabIndex={on ? 0 : -1}
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
