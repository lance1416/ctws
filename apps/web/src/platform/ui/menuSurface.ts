import { LAYER } from './layers'

/** The look of every menu, its layer included. */
export const MENU_SURFACE =
  `${LAYER.menu} max-h-80 min-w-36 overflow-y-auto rounded-card ` + 'bg-float p-1 shadow-float'

export const MENU_ITEM =
  'flex h-9 min-w-0 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none ' +
  'text-ink data-[highlighted]:bg-hover'
