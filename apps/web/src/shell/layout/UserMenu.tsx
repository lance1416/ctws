import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Link } from 'react-router-dom'
import { MENU_ITEM, MENU_SURFACE } from '../../platform/ui/menuSurface'

/** Who is signed in, their account page (artboard 30), and sign out. */
export function UserMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="current-user"
        aria-label={`Account: ${email}`}
        className="inline-grid size-7 place-items-center rounded-full bg-hover text-initials text-muted uppercase hover:text-ink"
      >
        {email.slice(0, 1)}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={MENU_SURFACE}>
          <div className="truncate px-2 py-1.5 text-ui text-muted">{email}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className={MENU_ITEM}>
            <Link to="/account">Account and time zone</Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item onSelect={onLogout} className={MENU_ITEM}>
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
