/** A link in running text, told apart by its underline, never by a hue. */
export const LINK =
  'text-ink underline decoration-rule-strong underline-offset-[3px] hover:decoration-ink'

/**
 * The tone says what an action is: `primary` the one thing a surface is for, `secondary` a real
 * alternative, `quiet` a borderless way out, `destructive` only a danger zone's confirming press.
 */
export const BUTTON = {
  primary:
    'h-9 rounded-md bg-ink px-3 text-sm font-semibold text-on-ink hover:opacity-90 disabled:opacity-50',
  secondary:
    'h-9 rounded-md border border-rule-strong px-3 text-sm text-ink hover:bg-hover disabled:opacity-50',
  quiet:
    'h-9 rounded-md px-2.5 text-sm text-ink-muted hover:bg-hover hover:text-ink disabled:opacity-50',
  destructive:
    'h-9 rounded-md bg-danger px-3 text-sm font-semibold text-on-danger hover:opacity-90 disabled:opacity-50',
  inline: 'rounded-md px-2 py-1 text-sm text-ink-muted hover:bg-hover hover:text-ink',
  /** An offer to add something, not a command. */
  link: `rounded-md px-2 py-1 text-sm ${LINK} hover:bg-hover`,
} as const
