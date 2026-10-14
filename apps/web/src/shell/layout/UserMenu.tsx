import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { applyTheme, readTheme, type Theme } from '../../platform/ui/theme'
import { MENU_ITEM, MENU_SURFACE } from '../../platform/ui/menuSurface'

/**
 * WHO YOU ARE, AND THE WAY OUT.
 *
 * ONE CONTROL, not a raw email beside a bare "Log out" -- two pieces of chrome that are neither
 * a control nor a label. A workspace's top-right corner is one control everywhere else, and this
 * is that control: initial, menu, identity inside it, and the one destructive-ish action at the
 * bottom.
 *
 * Radix's menu rather than a hand-rolled popover: focus, Escape, outside-click, arrow keys and
 * the `aria-expanded`/`aria-controls` pair are its job, and writing them by hand is how a WCAG
 * 2.1.2 keyboard trap ships.
 */
const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function UserMenu({ email, onLogout }: { email: string; onLogout: () => void }) {
  // 这一份状态只为把对勾画在对的那一行上；真正生效的是 <html> 上的那个属性。
  const [theme, setTheme] = useState<Theme>(() => readTheme())

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="current-user"
        aria-label={`Account: ${email}`}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-rule-strong text-sm font-semibold text-ink-muted uppercase hover:bg-hover hover:text-ink"
      >
        {email.slice(0, 1)}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={MENU_SURFACE}>
          <div className="truncate px-2 py-1.5 text-sm text-ink-muted">{email}</div>
          <DropdownMenu.Separator className="my-1 h-px bg-rule" />

          {/*
            THEME, here and not in a settings page: there is no settings page, and this is the
            one menu that is on every screen. Three choices and not a switch -- "follow the
            system" is a real answer, and a two-state toggle cannot say it.
          */}
          <DropdownMenu.Label className="px-2 pt-1 pb-0.5 text-xs text-ink-subtle">
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
          <DropdownMenu.Separator className="my-1 h-px bg-rule" />
          <DropdownMenu.Item onSelect={onLogout} className={MENU_ITEM}>
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
