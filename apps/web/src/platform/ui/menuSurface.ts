import { LAYER } from './layers'

/**
 * THE LOOK OF EVERY MENU, in one string.
 *
 * Five menus had five hand-written copies of this and three of them were missing the layer, which
 * is how a menu ended up painting underneath the pane that opened it.
 */
export const MENU_SURFACE =
  `${LAYER.menu} max-h-80 min-w-36 overflow-y-auto rounded-[10px] ` + 'bg-float p-1 shadow-float'

/** One row of a menu. Five menus had four heights between them before this was shared. */
export const MENU_ITEM =
  'flex h-9 min-w-0 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none ' +
  'text-ink data-[highlighted]:bg-hover'
