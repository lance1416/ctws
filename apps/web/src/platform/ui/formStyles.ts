/**
 * The three class strings the app's EDITING blocks share, so the detail pane and the New task
 * dialog cannot drift apart. They are the pane's own vocabulary, and the dialog is a second
 * surface that types into a task rather than a second language.
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
export const boxed = 'rounded-md border border-rule-strong bg-sheet px-3 py-2 text-sm text-ink'

export const field = `w-full ${boxed}`

/** The section label. Small, muted, and the same on every block, so the blocks read as peers. */
export const label = 'block text-xs text-ink-muted'

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
  'h-9 rounded-md border border-rule-strong px-3 text-sm text-ink placeholder:text-ink-muted aria-invalid:border-danger'

/**
 * A VALUE THAT IS A THING -- a person at a meeting, a project someone is on. The same chip when it
 * is read and when it is being edited: a meeting's attendees were bordered 14px chips in the
 * reading pane and borderless 12px ones in the form, and a project was a chip in a person's pane
 * but bare text in a meeting's. The form's chip adds only its ×.
 */
export const CHIP =
  'flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-hover px-2 text-sm text-ink'

/**
 * One status, as a chip over its own radio -- the pane's form and the New task dialog both draw
 * the five of them, and the two copies had drifted (one could wrap a label inside its chip). The
 * row they sit in is `flex flex-wrap`, sized to the words: a fixed three-column grid cut the
 * longest label in half.
 */
export const STATUS_CHIP =
  'relative flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-rule py-1 pr-2 pl-1.5 text-sm whitespace-nowrap text-ink-muted hover:bg-hover has-[:checked]:border-rule-strong has-[:checked]:bg-select has-[:checked]:font-semibold has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink'

/** A named decision: the same shape as the row's triage buttons, so the two speak one language. */
export const decision =
  'flex h-9 items-center rounded-md border border-rule px-2.5 text-sm text-ink hover:border-rule-strong hover:bg-hover'
