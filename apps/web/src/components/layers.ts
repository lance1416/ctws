/**
 * WHAT PAINTS OVER WHAT.
 *
 * Every layer in this app in one place, because the bug these numbers caused was invisible in
 * every test: a menu opened INSIDE the detail pane rendered into a portal at `<body>` with no
 * z-index at all, while the pane carries `z-20`. The menu was in the DOM, it answered clicks, and
 * it was painted underneath the pane: invisible, and still answering the pointer. Spread across
 * five files, these numbers disagree; here they cannot.
 *
 * A MENU IS ALWAYS ON TOP. It is opened from something, so it must paint over whatever opened it,
 * including a modal layer.
 *
 * ONE OF THESE CANNOT BE SET IN JSX. Radix wraps every floating layer in a positioned element of
 * its own (`[data-radix-popper-content-wrapper]`), and a `transform` on that wrapper makes it a
 * stacking context -- so `z-50` on the content inside it is scoped to the wrapper and never
 * compared with the scrim outside. The menu then paints UNDER a dialog's scrim, which swallows
 * every click aimed at it and closes the dialog instead. The rule that raises the wrapper lives
 * in `styles.css`; `layers.test.ts` holds both ends together.
 */
export const LAYER = {
  /** The detail pane, and the scrim under it when it is an overlay. */
  pane: 'z-20',
  /** Row-level controls that must sit above their own row. */
  row: 'z-30',
  /** A modal layer: search, the shortcut help, a dialog. */
  overlay: 'z-40',
  /** Any menu or popover, whatever opened it. */
  menu: 'z-50',
} as const
