import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { applyTheme, readTheme, type Theme } from '../../platform/ui/theme'
import { MENU_ITEM, MENU_SURFACE } from '../../platform/ui/menuSurface'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/** Who is signed in, the theme, and sign out. */
export function UserMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
  // Only for drawing the check on the right row; the attribute on <html> is what applies it.
  const [theme, setTheme] = useState<Theme>(() => readTheme())

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="current-user"
        aria-label={`Account: ${email}`}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-line-strong text-ui font-medium text-muted uppercase hover:bg-hover hover:text-ink"
      >
        {email.slice(0, 1)}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={MENU_SURFACE}>
          <div className="truncate px-2 py-1.5 text-ui text-muted">{email}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />

          <DropdownMenu.Label className="px-2 pt-1 pb-0.5 text-meta text-subtle">
            Theme
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={theme}
            onValueChange={(next) => {
              const picked = next as Theme
              setTheme(picked)
              applyTheme(picked)
            }}
          >
            {THEMES.map((t) => (
              <DropdownMenu.RadioItem key={t.value} value={t.value} className={MENU_ITEM}>
                <span className="flex-1">{t.label}</span>
                <DropdownMenu.ItemIndicator aria-hidden="true">✓</DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item onSelect={onLogout} className={MENU_ITEM}>
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
