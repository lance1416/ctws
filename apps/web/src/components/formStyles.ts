/**
 * The three class strings the app's EDITING blocks share, so the detail pane and the New task
 * dialog cannot drift apart. They are the pane's own vocabulary (rows-and-reading spec §5), and
 * the dialog is a second surface that types into a task rather than a second language.
 *
 * Only the shared ones live here. The detail pane's `exact` (the fallback date field) stays with
 * the pane: the dialog deliberately has no exact date inputs, and a constant with one caller is
 * not shared vocabulary.
 */

/**
 * A field's look WITHOUT its width, for the rows where several controls share a line. A field
 * that owns its line takes `field` below; composing `field` with a fixed width would leave
 * whichever of `w-full` and `w-20` Tailwind happened to emit last.
 */
export const boxed = 'rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg'

export const field = `w-full ${boxed}`

/** The section label. Small, muted, and the same on every block, so the blocks read as peers. */
export const label = 'block text-xs text-fg-muted'

/**
 * THE BOX YOU TYPE A NEW THING INTO -- the capture line, the new task, the sign-in fields.
 *
 * One height and one text size, because they stand next to each other across the app: two of
 * them were 40px tall at 16px while the rest were 36px at 14px, which read as two apps.
 *
 * It carries no BACKGROUND: what a box sits on is the surface's own business, and the sign-in
 * page lifts its fields off a plane the panels do not have.
 */
export const textbox =
  'h-9 rounded-lg border border-border-strong px-3 text-sm text-fg placeholder:text-fg-muted aria-invalid:border-danger'

/** A named decision: the same shape as the row's triage buttons, so the two speak one language. */
export const decision =
  'flex h-9 items-center rounded-lg border border-border-subtle px-2.5 text-sm text-fg hover:border-border-strong hover:bg-surface'
