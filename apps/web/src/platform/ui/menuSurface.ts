import { LAYER } from './layers'

/** The look of every menu, its layer included: a float, 10 radius, the float's shadow. */
export const MENU_SURFACE =
  `${LAYER.menu} max-h-80 min-w-36 overflow-y-auto rounded-block ` + 'bg-float p-1 shadow-float'

/** A menu's row: 32 high like any control, highlighted by the hover layer. */
export const MENU_ITEM =
  'flex h-8 min-w-0 cursor-default items-center gap-2 rounded-control px-2 text-ui outline-none ' +
  'text-ink data-[highlighted]:bg-hover'
