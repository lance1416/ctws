/**
 * WHAT PAINTS OVER WHAT.
 *
 * Every layer in this app in one place, because the bug these numbers caused was invisible in
 * every test: a menu opened INSIDE the detail pane rendered into a portal at `<body>` with no
 * z-index at all, while the pane carries `z-20`. The menu was in the DOM, it answered clicks, and
 * it was painted underneath the pane -- 「浮层没显示出来，但是能点动」.
 *
 * Two of the menus had been given `z-40` by hand when they were written and three had not, which
 * is exactly what a set of numbers spread across five files does.
 *
 * A MENU IS ALWAYS ON TOP. It is opened from something, so it must paint over whatever opened it,
 * including a modal layer.
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
