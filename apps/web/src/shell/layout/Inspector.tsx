import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { BUTTON, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import {
  BackIcon,
  CloseIcon,
  EditIcon,
  KIND_ICON,
  OpenFullIcon,
  type IconComponent,
} from '../../platform/ui/icons'
import { KIND_TEXT } from '../../platform/ui/kinds'
import { InspectorContext, type ListAct } from '../inspector/narrow'
import { LINKED_LIST, LinkedList } from '../inspector/LinkedList'
import { useRegistry, type RegisteredRelation, type Registry } from '../registry'
import { formatInspect, useInspector, type Inspected } from './inspectorAddress'

/** One thing gone back past: what it was, its name, and where its page was scrolled to. */
type Behind = {
  thing: Inspected
  title: string
  scrollTop: number
  /** The list the next was opened from (artboard 32), for "3 of 7" and ↑ ↓ along it. */
  among?: readonly Inspected[]
  /** That list's action for a row, which the opened page offers too (U-29). */
  act?: ListAct
}

/**
 * THE INSPECTOR (FR-022, artboards 8, 32, 33): a narrow look at something linked from the page
 * you are on, beside the main area from 1280 up and over it below that, never pushing the
 * sidebar. It has its own address (`?inspect=`), so a reload brings it back. Not modal: focus
 * moves to it when it opens, Esc closes it, and focus goes back to what opened it.
 *
 * It shows the thing's narrow page, its module's. A thing clicked in it takes its place, and
 * "‹" or Alt ← goes back; the address keeps only the one shown, so a reload keeps no way back.
 */
export function Inspector() {
  const { open, swap, close } = useInspector()
  const registry = useRegistry()
  const navigate = useNavigate()
  const body = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const [behind, setBehind] = useState<Behind[]>([])
  const [title, setTitle] = useState('')
  // The thing shown, as the address says; a change not made here starts afresh.
  const shown = open ? formatInspect(open) : null
  const ours = useRef<string | null>(null)
  useEffect(() => {
    if (shown === ours.current) return
    ours.current = shown
    setBehind([])
    if (shown) head.current?.focus()
  }, [shown])

  const last = behind.at(-1)
  const back = () => {
    if (!last) return
    setBehind((b) => b.slice(0, -1))
    ours.current = formatInspect(last.thing)
    swap(last.thing)
    head.current?.focus()
    requestAnimationFrame(() => body.current?.scrollTo({ top: last.scrollTop }))
  }
  const context = {
    go: (thing: Inspected, among?: readonly Inspected[], act?: ListAct) => {
      if (!open) return
      setBehind((b) => [
        ...b,
        {
          thing: open,
          title,
          scrollTop: body.current?.scrollTop ?? 0,
          ...(among ? { among } : {}),
          ...(act ? { act } : {}),
        },
      ])
      ours.current = formatInspect(thing)
      setTitle('')
      swap(thing)
      body.current?.scrollTo({ top: 0 })
      // What was clicked is gone with the page it was on; focus stays in the inspector, where
      // Esc and Alt ← still answer.
      head.current?.focus()
    },
    name: setTitle,
    back,
    // Opened from a list: its action for this row, offered on the page too (U-29).
    act: open && last?.act ? last.act(open, back) : undefined,
  }

  if (!open) return null
  const view = viewOf(registry, open)
  const { relation, Narrow, Icon } = view
  // Opened from a list: where it is in it, and the ones either side (artboard 32).
  const place = last?.among ? last.among.findIndex((t) => formatInspect(t) === shown) : -1
  const along = (step: number) => {
    const next = last?.among?.[place + step]
    if (place < 0 || !next) return
    ours.current = formatInspect(next)
    swap(next)
    body.current?.scrollTo({ top: 0 })
  }
  const where =
    last?.among && place >= 0 ? (
      <span className="shrink-0 text-subtle tabular-nums">
        {place + 1} of {last.among.length}
      </span>
    ) : null
  const openFull = () => {
    close()
    if (relation) navigate(relation.to(open.id))
  }
  const edit = relation?.edit
  const onKeyDown = (e: KeyboardEvent) => {
    const typing =
      e.target instanceof HTMLElement &&
      (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !typing && place >= 0) {
      e.preventDefault()
      along(e.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (e.key === 'ArrowLeft' && e.altKey && last) {
      e.preventDefault()
      back()
      return
    }
    if (e.key !== 'Escape' || e.defaultPrevented) return
    e.preventDefault()
    close()
  }
  return (
    <aside
      aria-label="Inspector"
      onKeyDown={onKeyDown}
      className="flex w-inspector shrink-0 flex-col bg-float shadow-float max-xl:absolute max-xl:inset-y-0 max-xl:right-0 max-lg:inset-x-0 max-lg:w-auto"
    >
      {view.ownHead ? (
        // A narrow page with a head of its own keeps only the way back here.
        <div
          ref={head}
          tabIndex={-1}
          className="flex shrink-0 items-center px-3 pt-2 focus:outline-none"
        >
          {last && (
            <button
              type="button"
              onClick={back}
              title="Back  Alt ←"
              className="flex min-w-0 items-center gap-1.5 rounded-control px-1 py-1 text-meta text-muted hover:text-ink"
            >
              <BackIcon size={14} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{last.title || last.thing.type}</span>
              {where}
            </button>
          )}
        </div>
      ) : (
        <div
          ref={head}
          tabIndex={-1}
          className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-2 pl-3 focus:outline-none"
        >
          {last ? (
            <button
              type="button"
              onClick={back}
              title="Back  Alt ←"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-control px-1 py-1 text-meta text-muted hover:text-ink"
            >
              <BackIcon size={14} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{last.title || last.thing.type}</span>
              {where}
            </button>
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2 px-1 text-meta text-muted">
              {Icon && (
                <Icon
                  size={14}
                  aria-hidden="true"
                  className={KIND_TEXT[open.type as keyof typeof KIND_TEXT] ?? ''}
                />
              )}
              <span className="truncate">{view.label}</span>
            </span>
          )}
          {/* A list is the rest of a block on the page under it: there is no page of its own. */}
          {relation && (
            <button
              type="button"
              onClick={openFull}
              aria-label="Open full page"
              title="Open full page"
              className={ICON_BUTTON}
            >
              <OpenFullIcon size={16} aria-hidden="true" />
            </button>
          )}
          {edit && (
            <button
              type="button"
              onClick={() => {
                close()
                navigate(edit(open.id, open.at))
              }}
              aria-label="Edit"
              title="Edit"
              className={ICON_BUTTON}
            >
              <EditIcon size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            title="Close  Esc"
            className={ICON_BUTTON}
          >
            <CloseIcon size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <div ref={body} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {Narrow || view.list ? (
          <InspectorContext.Provider value={context}>
            {Narrow ? (
              <Narrow key={shown} id={open.id} at={open.at} />
            ) : (
              <div key={shown} className="contents">
                {view.list}
              </div>
            )}
          </InspectorContext.Provider>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <h2 className="text-subject text-ink">{relation?.kind ?? view.label}</h2>
            <button type="button" onClick={openFull} className={`self-start ${BUTTON.secondary}`}>
              Open full page
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

/**
 * What the inspector shows for an address: a thing's narrow page, by its kind's module; or a full
 * list (`list:<name>.<arg>`), the linked things of one kind by the shell, the rest by a module.
 */
function viewOf(
  registry: Registry,
  open: Inspected,
): {
  relation: RegisteredRelation | null
  label: string
  Icon: IconComponent | undefined
  Narrow: ComponentType<{ id: string; at?: string | undefined }> | undefined
  list: ReactNode
  /** Its page draws its own head; the inspector keeps only the way back. */
  ownHead: boolean
} {
  if (open.type !== 'list') {
    const relation = registry.relationFor(open.type)
    return {
      relation,
      label: relation.plural,
      Icon: KIND_ICON[open.type as keyof typeof KIND_ICON],
      Narrow: relation.Narrow,
      list: null,
      ownHead: relation.ownHead === true,
    }
  }
  const dot = open.id.indexOf('.')
  const name = dot < 0 ? open.id : open.id.slice(0, dot)
  const arg = dot < 0 ? '' : open.id.slice(dot + 1)
  // A list's head is its block's: icon, name, count, the block's action, and close (artboard 32).
  const none = { relation: null, Narrow: undefined, ownHead: true }
  if (name === LINKED_LIST)
    return { ...none, label: 'Linked', Icon: undefined, list: <LinkedList arg={arg} /> }
  const list = registry.listFor(name)
  if (!list) return { ...none, label: 'Not here any more', Icon: undefined, list: null }
  return { ...none, label: list.label, Icon: list.icon, list: <list.Body arg={arg} /> }
}
