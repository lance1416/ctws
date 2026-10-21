/** A link in running text, told apart by its underline, never by a hue. */
export const LINK =
  'text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink'

/** What every standalone button shares (tokens.md): 32 high, 12 each side, 6 radius, UI 500. */
const BASE = 'inline-flex h-8 items-center gap-2 rounded-control px-3 text-ui font-medium'

/**
 * The tone says what an action is (artboard 3 "Controls"): `primary` the one thing a screen is
 * for, in ink; `secondary` a grey frame; `quiet` no frame; `destructive` a red frame and red
 * words, for a danger zone's confirming press only.
 */
export const BUTTON = {
  primary: `${BASE} bg-ink text-on-ink hover:opacity-90 disabled:opacity-50`,
  secondary: `${BASE} border border-line-strong text-ink hover:bg-hover disabled:opacity-50`,
  quiet: `${BASE} text-ink hover:bg-hover disabled:opacity-50`,
  destructive: `${BASE} border border-stop text-stop-t hover:bg-stop-bg disabled:opacity-50`,
  /** A small action inside a row or a block head: no frame, muted until hovered. */
  inline: 'rounded-control px-2 py-1 text-ui text-muted hover:bg-hover hover:text-ink',
  /** An offer to add something, not a command. */
  link: `rounded-control px-2 py-1 text-ui ${LINK} hover:bg-hover`,
} as const

/** A key cap (tokens.md): mono 12, 5 each side, a `line-strong` edge with a 2px foot, 4 radius. */
export const KEY =
  'inline-flex h-4.5 items-center rounded-key border border-b-2 border-line-strong px-1.25 font-mono text-meta text-muted'

/** An icon-only button (artboard 3 `.ib`): 28 square, grey until hovered. Give it `aria-label`. */
export const ICON_BUTTON =
  'inline-grid size-7 shrink-0 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink disabled:opacity-50'
