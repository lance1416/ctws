/** Class strings shared by the detail pane and the New task dialog. */

/**
 * A field's look without its width, for rows where controls share a line. Adding a width to `field`
 * would leave Tailwind's emit order to choose between `w-full` and the other.
 */
export const boxed = 'rounded-md border border-rule-strong bg-sheet px-3 py-2 text-sm text-ink'

export const field = `w-full ${boxed}`

export const label = 'block text-xs text-ink-muted'

/** The box a new thing is typed into. No background: the surface it sits on decides. */
export const textbox =
  'h-9 rounded-md border border-rule-strong px-3 text-sm text-ink placeholder:text-ink-muted aria-invalid:border-danger'

/** A value that is a thing (an attendee, a project): the same chip when read and when edited. */
export const CHIP =
  'flex h-7 min-w-0 items-center gap-1.5 rounded-md bg-hover px-2 text-sm text-ink'

/** One status as a chip over its own radio, in a `flex flex-wrap` row sized to the words. */
export const STATUS_CHIP =
  'relative flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-rule py-1 pr-2 pl-1.5 text-sm whitespace-nowrap text-ink-muted hover:bg-hover has-[:checked]:border-rule-strong has-[:checked]:bg-select has-[:checked]:font-semibold has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink'

/** A named decision, shaped like the row's triage buttons. */
export const decision =
  'flex h-9 items-center rounded-md border border-rule px-2.5 text-sm text-ink hover:border-rule-strong hover:bg-hover'
