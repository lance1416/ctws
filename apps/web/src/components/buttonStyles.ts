/**
 * THE APP'S BUTTONS, in four tones and one size.
 *
 * Every standalone action -- a dialog's footer, the pane's Save, a page's “New …”, a
 * confirmation -- is one of these. They were written by hand at each site before, and the copies
 * drifted: three heights, two radii, and half of them missing `text-sm`, which left a dialog's
 * Save rendering at 16px beside its own 14px fields.
 *
 * The TONE says what the action is, never how important this screen feels:
 *
 * - `primary` -- the one thing the surface is for. At most one per surface.
 * - `secondary` -- a real alternative to it, usually the way out.
 * - `quiet` -- a way out that is not worth a border.
 * - `destructive` -- the second press in a danger zone's question, and nothing else.
 *
 * `inline` is the exception that proves the size: a control that sits INSIDE a row or a field,
 * where a 36px button would push the line apart.
 */
export const BUTTON = {
  primary:
    'h-9 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-fg hover:opacity-90 disabled:opacity-50',
  secondary:
    'h-9 rounded-lg border border-border-strong px-3 text-sm text-fg hover:bg-surface-hover disabled:opacity-50',
  quiet:
    'h-9 rounded-lg px-2.5 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-50',
  destructive:
    'h-9 rounded-lg bg-danger px-3 text-sm font-semibold text-danger-fg hover:opacity-90 disabled:opacity-50',
  inline: 'rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg',
  /** The same size, in the accent: an offer to add something, not a command. */
  link: 'rounded-md px-2 py-1 text-sm text-accent hover:bg-surface-hover',
} as const
