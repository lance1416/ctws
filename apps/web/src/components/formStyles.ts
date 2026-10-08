/**
 * The three class strings the app's EDITING blocks share, extracted so the detail pane and the
 * 新建 dialog cannot drift apart. They were written for the detail pane (rows-and-reading spec §5)
 * and the dialog is the second surface that types into a task, so it speaks the same language
 * rather than inventing a second one.
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
export const boxed = 'rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg'

export const field = `w-full ${boxed}`

/** The section label. Small, muted, and the same on every block, so the blocks read as peers. */
export const label = 'block text-xs text-fg-muted'

/** A named decision: the same shape as the row's triage buttons, so the two speak one language. */
export const decision =
  'flex h-9 items-center rounded-lg border border-border-subtle px-2.5 text-sm text-fg hover:border-border-strong hover:bg-surface'
