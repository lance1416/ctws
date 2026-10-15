/**
 * What paints over what. Radix's popper wrapper is its own stacking context, so the menu's number
 * is also set on it in `styles.css`.
 */
export const LAYER = {
  /** The detail pane and modal dialogs, with their scrims. */
  pane: 'z-20',
  /** The top bar and the phone's tab bar. */
  bar: 'z-30',
  /** Full-screen writing and the capture box's message. */
  cover: 'z-40',
  /** Any menu or popover, whatever opened it. */
  menu: 'z-50',
} as const
