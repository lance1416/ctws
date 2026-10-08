import { LAYER } from './layers'

/**
 * THE LOOK OF EVERY MENU, in one string.
 *
 * Five menus had five hand-written copies of this and three of them were missing the layer, which
 * is how a menu ended up painting underneath the pane that opened it.
 */
export const MENU_SURFACE =
  `${LAYER.menu} max-h-80 min-w-36 overflow-y-auto rounded-xl border border-border-subtle ` +
  'bg-surface-panel p-1 shadow-panel'

/** One row of a menu. */
export const MENU_ITEM =
  'flex h-9 min-w-0 cursor-default items-center gap-2 rounded-lg px-2 text-sm text-fg outline-none ' +
  'data-[highlighted]:bg-surface-hover'
