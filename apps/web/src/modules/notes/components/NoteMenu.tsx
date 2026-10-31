import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ICON_BUTTON } from '../../../platform/ui/buttonStyles'
import { MoreIcon } from '../../../platform/ui/icons'
import { MENU_ITEM, MENU_SURFACE } from '../../../platform/ui/menuSurface'
import { fileNameOf } from '../logic/download'

/** Hands the browser `text` as a file called `name`. */
function save(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** A note's "…" (artboard 34): Download .md, the text as it is written (FR-111). */
export function NoteMenu({ title, body }: { title: string; body: string }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger aria-label="More" title="More" className={`${ICON_BUTTON} shrink-0`}>
        <MoreIcon size={16} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className={MENU_SURFACE}>
          <DropdownMenu.Item onSelect={() => save(fileNameOf(title), body)} className={MENU_ITEM}>
            Download .md
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
