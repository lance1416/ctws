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
/**
 * A LINK IN RUNNING TEXT: ink, told from the words round it by its underline, never by a hue --
 * the app has no accent colour. The underline sits in `rule-strong` and darkens to ink under the
 * pointer.
 */
export const LINK =
  'text-ink underline decoration-rule-strong underline-offset-[3px] hover:decoration-ink'

export const BUTTON = {
  primary:
    'h-9 rounded-lg bg-ink px-3 text-sm font-semibold text-on-ink hover:opacity-90 disabled:opacity-50',
  secondary:
    'h-9 rounded-lg border border-rule-strong px-3 text-sm text-ink hover:bg-hover disabled:opacity-50',
  quiet:
    'h-9 rounded-lg px-2.5 text-sm text-ink-muted hover:bg-hover hover:text-ink disabled:opacity-50',
  destructive:
    'h-9 rounded-lg bg-danger px-3 text-sm font-semibold text-on-danger hover:opacity-90 disabled:opacity-50',
  inline: 'rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-hover hover:text-ink',
  /** The same size, as a link: an offer to add something, not a command. */
  link: `rounded-md px-2 py-1 text-sm ${LINK} hover:bg-hover`,
} as const
