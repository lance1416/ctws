import { useEffect, useRef, useState } from 'react'

type TriageAction = { label: string; run: () => void }
export type TriageSection = {
  /** What this group of actions does to the task; null for a single unlabelled cluster. */
  heading: string | null
  actions: TriageAction[]
}

type Props = {
  /** The panel's accessible name. Unchanged from the inline group it replaces. */
  groupLabel: string
  /** The trigger's accessible name. Must not CONTAIN `groupLabel`, or role lookups collide. */
  triggerLabel: string
  sections: TriageSection[]
  /** Called after an action ran, so the page can put focus back on the row it belongs to. */
  onRan?: () => void
}

/**
 * The way out of an overdue or carried row, as ONE control.
 *
 * ONE TRIGGER, not seven inline text links (push to tomorrow, to next week, clear the deadline,
 * turn it into a plan for today, tomorrow or next week) on an overdue row and five more on a
 * carried one. Those are the app's capabilities tipped onto the row, which is what the redesign
 * plan names as making a screen look like a demo.
 *
 * Why a disclosure and not a revealed cluster or a native date picker:
 * - A cluster revealed on hover or focus would still be six controls wide once revealed, and on a
 *   screen where ten rows are overdue it would mean sixty live controls one mouse-move away. The
 *   row has to be CALM at rest; the triage is a deliberate act, not an ambient one.
 * - A date picker is the wrong shape for this job. Every one of these actions is a named decision
 *   ("push the deadline to next Monday", "this deadline is not a deadline any more, it is a plan")
 *   and two of them change two fields in one request. A calendar makes the user compute the date
 *   and cannot express "make this a plan instead" at all. The exact date is in the detail panel.
 *
 * Constraints it meets:
 * - The trigger occupies a FIXED slot that is reserved whether or not the row has triage, and the
 *   panel is absolutely positioned, so nothing on the row moves when it opens.
 * - It is keyboard-reachable (the trigger is in the tab order), Escape closes it and returns focus
 *   to the trigger, tabbing out of it closes it, and focus never lands on <body>.
 * - No browser modal: `window.confirm` and friends block this project's automation.
 */
export function TriageControl({ groupLabel, triggerLabel, sections, onRan }: Props) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const wrap = useRef<HTMLSpanElement>(null)

  // A pointer press anywhere else closes it. Capture phase, so a click that lands on another row
  // closes this panel AND does its own job in one press.
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
      // Escape lives on the WRAPPER, not on the panel: after the trigger opens the panel focus is
      // still on the trigger, which is outside it, so a handler on the panel alone would never see
      // the key. Here it closes the panel wherever focus sits inside this control.
      onKeyDown={(e) => {
        if (!open || e.key !== 'Escape') return
        e.preventDefault()
        // The page's own Escape handlers (the detail panel, the shortcut overlay) must not also
        // fire: this press belongs to the panel that is open.
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
          // Tabbing or clicking out of the panel closes it, so a forgotten panel cannot sit open
          // over the row below.
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
                    // The button that was clicked is about to unmount with the panel, and so,
                    // usually, is this whole control: every one of these actions removes the
                    // condition that put it on the row. So focus goes to the ROW, not back to the
                    // trigger. Letting it fall to <body> loses the user's place (WCAG 2.4.3).
                    if (onRan) onRan()
                    else queueMicrotask(() => trigger.current?.focus())
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
