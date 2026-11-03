import { type RefObject, useEffect, useRef, useState } from 'react'
import { ICON_BUTTON } from '../ui/buttonStyles'
import { BarExpandIcon, TreeIcon } from '../ui/icons'
import type { EditorHandle } from './MarkdownEditor'
import { type Heading, sectionInSight } from './outline'

/** Under this, the main area is too narrow to keep the outline beside the text. */
const NARROW_PX = 900

/** What the outline panel is doing, and the switch every way of hiding or showing it presses. */
export type Outline = {
  /** Put on the element the panel's room is measured on: the note's whole page. */
  frame: (el: HTMLElement | null) => void
  narrow: boolean
  open: boolean
  toggle: () => void
  close: () => void
}

/**
 * The outline's panel shown or hidden. Wide, it is the account's
 * choice, the same on every note and in full screen. Narrow it starts hidden whatever the account
 * says, and shown it floats over the text until it is put away.
 */
export function useOutline(shown: boolean, setShown: (on: boolean) => void): Outline {
  const [frame, setFrame] = useState<HTMLElement | null>(null)
  const [narrow, setNarrow] = useState(false)
  const [floated, setFloated] = useState(false)
  useEffect(() => {
    if (!frame) return
    const measure = () => setNarrow(frame.clientWidth < NARROW_PX)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(frame)
    return () => watch.disconnect()
  }, [frame])
  return {
    frame: setFrame,
    narrow,
    open: narrow ? floated : shown,
    toggle: () => (narrow ? setFloated((on) => !on) : setShown(!shown)),
    close: () => setFloated(false),
  }
}

/**
 * The outline's section in sight, as the page scrolls and as the text changes under it: every
 * scroll on the page is heard, the one that moves the note among them.
 */
export function useSectionInSight(
  editor: RefObject<EditorHandle | null>,
  headings: readonly Heading[],
): Heading | null {
  const [top, setTop] = useState(0)
  useEffect(() => {
    let frame = 0
    const look = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setTop(editor.current?.inSight() ?? 0))
    }
    look()
    document.addEventListener('scroll', look, true)
    window.addEventListener('resize', look)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('scroll', look, true)
      window.removeEventListener('resize', look)
    }
  }, [editor, headings])
  return sectionInSight(headings, top)
}

/** The title row's switch for the outline, pressed while it shows. */
export function OutlineButton({ outline, keys }: { outline: Outline; keys: string }) {
  const says = outline.open ? 'Hide the outline' : 'Show the outline'
  return (
    <button
      type="button"
      aria-pressed={outline.open}
      aria-label="Outline"
      title={`${says} (${keys})`}
      data-outline-switch
      onClick={outline.toggle}
      className={`${ICON_BUTTON} aria-pressed:bg-select aria-pressed:text-ink`}
    >
      <TreeIcon size={16} aria-hidden="true" />
    </button>
  )
}

/**
 * A note's headings in a panel down the right of the page, the section in sight marked; a press
 * jumps there.
 */
export function OutlineNav({
  outline,
  headings,
  current,
  onJump,
}: {
  outline: Outline
  headings: readonly Heading[]
  current: Heading | null
  onJump: (heading: Heading) => void
}) {
  const panel = useRef<HTMLElement>(null)
  const floating = outline.narrow && outline.open
  const { close } = outline
  // Floating, it goes back on Esc and on a press anywhere off it but its own switch.
  useEffect(() => {
    if (!floating) return
    const off = (e: PointerEvent) => {
      const at = e.target instanceof Element ? e.target : null
      if (at && !panel.current?.contains(at) && !at.closest('[data-outline-switch]')) close()
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', off)
      document.removeEventListener('keydown', esc)
    }
  }, [floating, close])
  if (headings.length === 0 || !outline.open) return null
  return (
    <aside
      ref={panel}
      className={`w-[260px] shrink-0 border-l border-line max-lg:hidden ${
        floating
          ? 'absolute inset-y-0 right-0 z-20 bg-float shadow-float'
          : 'self-stretch bg-ground'
      }`}
    >
      <div className="sticky top-0 max-h-dvh overflow-y-auto px-3 py-4">
        <div className="flex items-center justify-between pb-2 pl-2">
          <h2 className="text-meta text-muted">Outline</h2>
          <button
            type="button"
            aria-label="Hide the outline"
            title="Hide the outline"
            onClick={outline.toggle}
            className={ICON_BUTTON}
          >
            <BarExpandIcon size={16} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Outline">
          <ul className="flex flex-col gap-px">
            {headings.map((h) => {
              const here = h === current
              return (
                <li key={h.offset}>
                  <button
                    type="button"
                    aria-current={here ? 'location' : undefined}
                    onClick={() => onJump(h)}
                    className={`w-full rounded-control px-2 py-1 text-left text-ui hover:bg-hover ${
                      h.depth === 2 ? 'pl-5' : ''
                    } ${here ? 'bg-select text-ink' : 'text-muted'}`}
                  >
                    {/* Two lines of a long heading before it is cut. */}
                    <span className="line-clamp-2">{h.words}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </aside>
  )
}
