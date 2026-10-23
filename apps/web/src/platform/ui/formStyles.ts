/** Class strings shared by every form (tokens.md "输入框", artboard 3 "Controls"). */

/**
 * A field's look without its width, for rows where controls share a line. Adding a width to
 * `field` would leave Tailwind's emit order to choose between `w-full` and the other.
 * 30 high, 10 each side, 6 radius, a `line-strong` edge on the panel.
 */
export const boxed =
  'h-7.5 rounded-control border border-line-strong bg-panel px-2.5 text-ui text-ink placeholder:text-subtle aria-invalid:border-stop'

export const field = `w-full ${boxed}`

/** A field for lines of prose (notes): `field`'s edge and type, as tall as its rows, five at least. */
export const area =
  'w-full min-h-28 rounded-control border border-line-strong bg-panel px-2.5 py-1.5 text-ui text-ink placeholder:text-subtle aria-invalid:border-stop'

export const label = 'block text-meta text-muted'

/** The box a new thing is typed into. No background: the surface it sits on decides. */
export const textbox = `${boxed} bg-transparent`

/** A value that is a thing (an attendee, a project): the same chip when read and when edited. */
export const CHIP =
  'flex h-5.5 min-w-0 items-center gap-1 rounded-control bg-hover px-2 text-meta font-medium text-ink'

/** One status as a chip over its own radio, in a `flex flex-wrap` row sized to the words. */
export const STATUS_CHIP =
  'relative flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-line px-2 text-ui whitespace-nowrap text-muted hover:bg-hover has-[:checked]:border-line-strong has-[:checked]:bg-select has-[:checked]:font-medium has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-task'

/** A named decision, shaped like the row's triage buttons. */
export const decision =
  'flex h-8 items-center rounded-control border border-line px-2.5 text-ui text-ink hover:border-line-strong hover:bg-hover'

/** `decision` closer in, so a row of four fits a field row of the inspector on one line (I-10). */
export const decisionTight =
  'flex h-8 shrink-0 items-center rounded-control border border-line px-2 text-ui whitespace-nowrap text-ink hover:border-line-strong hover:bg-hover'
