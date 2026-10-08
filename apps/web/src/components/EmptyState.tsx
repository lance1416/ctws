import type { ReactNode } from 'react'

/**
 * What a screen says when it has nothing on it: ONE LINE, and an action only where there is a
 * single obvious one.
 *
 * The second line used to be mandatory and explained what the screen was for -- 「排到今天的、已经
 * 逾期的、正在做的，都会落到这一页。」 That is a manual, not an interface. The one person using
 * this built the screens; a sentence teaching them what their own page is for reads as filler,
 * and filler is what makes software sound like it was generated rather than designed.
 *
 * Left-aligned like everything else here: a centred block announces itself as a different kind of
 * page, and it is not one.
 */
export function EmptyState({
  title,
  hint,
  action,
}: {
  /** One line, the state itself. Plain, present tense. */
  title: string
  /** A second line, only when it says something the first cannot. Usually there is none. */
  hint?: string
  /** The one action that fills it. */
  action?: ReactNode
}) {
  return (
    <div className="mt-8 max-w-[44ch]">
      <p className="text-fg">{title}</p>
      {hint && <p className="mt-1 text-sm text-fg-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** The one action an empty state offers, as a button. Quiet: it is an invitation, not a demand. */
export const EMPTY_ACTION =
  'inline-flex h-9 items-center rounded-md border border-border-strong px-3 text-sm text-fg hover:bg-surface-hover'
