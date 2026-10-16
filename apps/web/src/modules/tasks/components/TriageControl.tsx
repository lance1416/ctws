import { useEffect, useRef, useState } from 'react'

type TriageAction = { label: string; run: () => void }
export type TriageSection = {
  /** What this group of actions does to the task; null for a single unlabelled cluster. */
  heading: string | null
  actions: TriageAction[]
}

type Props = {
  /** The panel's accessible name. */
  groupLabel: string
  /** The trigger's accessible name. Must not contain `groupLabel`, or role lookups collide. */
  triggerLabel: string
  sections: TriageSection[]
  /** Called after an action ran, so the page can put focus back on the row it belongs to. */
  onRan: () => void
}

/**
 * The way out of an overdue or carried row: one disclosure of named decisions. The trigger keeps a
 * fixed slot and the panel sits over the row, so nothing moves when it opens.
 */
export function TriageControl({ groupLabel, triggerLabel, sections, onRan }: Props) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const wrap = useRef<HTMLSpanElement>(null)

  // A press anywhere else closes it. Capture phase, so a click on another row closes this panel
  // and still does its own job.
  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  return (
    <span
      ref={wrap}
      // Escape lives on the wrapper: after opening, focus is still on the trigger, outside the
      // panel, so a handler on the panel alone would never see the key.
      onKeyDown={(e) => {
        if (!open || e.key !== 'Escape') return
        e.preventDefault()
        // The page's own Escape handlers must not also fire.
        e.stopPropagation()
        setOpen(false)
        trigger.current?.focus()
      }}
      className="relative flex"
    >
      <button
        ref={trigger}
        type="button"
        data-triage-trigger
        aria-label={triggerLabel}
        aria-expanded={open}
        // The row body opens the detail panel on click; this control is not that.
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-hover hover:text-ink aria-expanded:bg-hover aria-expanded:text-ink"
      >
        <svg
          viewBox="0 0 16 16"
          width="16"
          height="16"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="1.75" />
          <path d="M2.25 6.5h11.5M5.5 1.75v2.5M10.5 1.75v2.5" />
        </svg>
      </button>
      {open && (
        <div
          role="group"
          aria-label={groupLabel}
          onClick={(e) => e.stopPropagation()}
          // Tabbing or clicking out of the panel closes it.
          onBlur={(e) => {
            if (!wrap.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
          }}
          // `w-max` so the clusters stay on one line where there is room, capped to the viewport
          // so a narrow phone wraps them instead of growing a horizontal scrollbar.
          className="absolute top-full right-0 z-20 mt-1 flex w-max max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-[10px] bg-float p-2 text-sm shadow-float"
        >
          {sections.map((section) => (
            <div
              key={section.heading ?? ''}
              className="flex flex-wrap items-center gap-1 whitespace-nowrap"
            >
              {section.heading && (
                <span className="pr-1 text-xs text-ink-muted">{section.heading}</span>
              )}
              {section.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    action.run()
                    setOpen(false)
                    // The action usually removes this whole control with the condition that put
                    // it on the row, so focus goes to the row rather than the trigger.
                    onRan()
                  }}
                  className="rounded-md border border-rule px-2 py-1 text-ink hover:border-rule-strong hover:bg-hover"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </span>
  )
}
