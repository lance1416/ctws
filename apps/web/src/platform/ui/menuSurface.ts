import { LAYER } from './layers'

const LOOK = `${LAYER.menu} max-h-80 min-w-36 rounded-container bg-float p-1 shadow-float`

/** The look of every menu, its layer included: a float, 8 radius, the float's shadow. */
export const MENU_SURFACE = `${LOOK} overflow-y-auto`

/** The same, for a menu that keeps its first and last rows in place and scrolls what is between. */
export const MENU_SURFACE_HELD = `${LOOK} flex flex-col`

/** A menu's row: 32 high like any control, highlighted by the hover layer. */
export const MENU_ITEM =
  'flex h-8 min-w-0 cursor-default items-center gap-2 rounded-control px-2 text-ui outline-none ' +
  'text-ink data-[highlighted]:bg-hover'
