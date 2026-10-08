import { useEffect, useRef, useState } from 'react'

export type TriageAction = { label: string; run: () => void }
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
 * It replaces seven inline underlined text links (推迟到明天 推迟到下周 清除截止 转为排期： 今天
 * 明天 下周) on an overdue row and five more on a carried one. Those were not designed
 * affordances -- they were the app's capabilities tipped onto the row, which is the single thing
 * the redesign plan names as making this screen look like a demo.
 *
 * Why a disclosure and not a revealed cluster or a native date picker:
 * - A cluster revealed on hover or focus would still be six controls wide once revealed, and on a
 *   screen where ten rows are overdue it would mean sixty live controls one mouse-move away. The
 *   row has to be CALM at rest; the triage is a deliberate act, not an ambient one.
 * - A date picker is the wrong shape for this job. Every one of these actions is a named decision
 *   ("push the deadline to next Monday", "this deadline is not a deadline any more, it is a plan")
 *   and two of them change two fields in one request. A calendar makes the user compute the date
 *   and cannot express 转为排期 at all. The exact-date route already exists in the detail panel.
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
        className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg aria-expanded:bg-surface aria-expanded:text-fg"
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
          className="absolute top-full right-0 z-20 mt-1 flex w-max max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-md border border-border-strong bg-surface-raised p-2 text-sm"
        >
          {sections.map((section) => (
            <div
              key={section.heading ?? ''}
              className="flex flex-wrap items-center gap-1 whitespace-nowrap"
            >
              {section.heading && (
                <span className="pr-1 text-xs text-fg-muted">{section.heading}</span>
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
                  className="rounded-md border border-border-subtle px-2 py-1 text-fg hover:border-border-strong hover:bg-surface"
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
