import { useEffect, useRef, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BUTTON, ICON_BUTTON } from '../../platform/ui/buttonStyles'
import { CloseIcon, OpenFullIcon } from '../../platform/ui/icons'
import { useRegistry } from '../registry'
import { formatInspect, useInspector } from './inspectorAddress'

/**
 * THE INSPECTOR (FR-022): a narrow look at something linked from the page you are on, beside the
 * main area from 1280 up and over it below that, never pushing the sidebar. It has its own
 * address (`?inspect=`), so a reload brings it back. Not modal: focus moves to its title when it
 * opens, Esc closes it, and focus goes back to what opened it.
 *
 * The narrow page of each kind arrives with that kind's batch; until then the inspector names
 * the kind and offers the full page.
 */
export function Inspector() {
  const { open, close } = useInspector()
  const registry = useRegistry()
  const navigate = useNavigate()
  const title = useRef<HTMLHeadingElement>(null)
  const opened = open ? formatInspect(open) : null
  useEffect(() => {
    if (opened) title.current?.focus()
  }, [opened])
  if (!open) return null
  const relation = registry.relationFor(open.type)
  const openFull = () => navigate(relation.to(open.id))
  const onKeyDown = (e: KeyboardEvent) => {
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
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
        <span className="flex-1 truncate text-meta text-subtle">{relation.kind}</span>
        <button
          type="button"
          onClick={openFull}
          aria-label="Open full page"
          title="Open full page"
          className={ICON_BUTTON}
        >
          <OpenFullIcon size={16} aria-hidden="true" />
        </button>
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <h2 ref={title} tabIndex={-1} className="text-subject text-ink">
          {relation.kind}
        </h2>
        <button type="button" onClick={openFull} className={`self-start ${BUTTON.secondary}`}>
          Open full page
        </button>
      </div>
    </aside>
  )
}
