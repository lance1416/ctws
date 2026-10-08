import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { MENU_SURFACE } from './menuSurface'

/**
 * WHO YOU ARE, AND THE WAY OUT.
 *
 * The bar used to carry the raw email as a truncated string with a bare "Log out" beside it --
 * two pieces of chrome that were neither a control nor a label, in two languages. A workspace's
 * top-right corner is one control everywhere else, and this is that control: initial, menu,
 * identity inside it, and the one destructive-ish action at the bottom.
 *
 * Radix's menu rather than a hand-rolled popover: focus, Escape, outside-click, arrow keys and
 * the `aria-expanded`/`aria-controls` pair are its job, and this project has already paid once
 * for writing that by hand (a WCAG 2.1.2 keyboard trap shipped).
 */
export function UserMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="current-user"
        aria-label={`Account: ${email}`}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-sm font-semibold text-fg-muted uppercase hover:bg-surface-hover hover:text-fg"
      >
        {email.slice(0, 1)}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={MENU_SURFACE}>
          <div className="truncate px-2.5 py-1.5 text-sm text-fg-muted">{email}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-border-subtle" />
          <DropdownMenu.Item
            onSelect={onLogout}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
          >
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
