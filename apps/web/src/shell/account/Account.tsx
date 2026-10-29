import { clockTime } from '@ctws/core/clock'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../../platform/http/api'
import { keyLabel } from '../../platform/keyboard/keys'
import { monthDay } from '../../platform/time/dates'
import { useNow } from '../../platform/time/useNow'
import { Block } from '../../platform/ui/Block'
import { BUTTON, KEY_ON_INK } from '../../platform/ui/buttonStyles'
import { field, label } from '../../platform/ui/formStyles'
import {
  DarkIcon,
  EmailIcon,
  LightIcon,
  MovedIcon,
  PasswordIcon,
  SignOutIcon,
  SystemIcon,
  TimeZoneIcon,
  type IconComponent,
} from '../../platform/ui/icons'
import { Segmented } from '../../platform/ui/Segmented'
import { applyTheme, onSchemeChange, readTheme, type Theme } from '../../platform/ui/theme'
import { ZoneBox, zoneFrom } from '../../platform/ui/ZoneBox'
import { meKey, useMe } from '../auth/useMe'
import { useSignOut } from '../layout/signOut'
import { changePassword, migrationQuery, setTimeZone } from './api'

const THEMES = [
  { id: 'light', label: 'Light', icon: LightIcon },
  { id: 'dark', label: 'Dark', icon: DarkIcon },
  { id: 'system', label: 'System', icon: SystemIcon },
] as const

/** The shortest password the server takes (`newPassword`). */
const SHORTEST = 12

/**
 * THE ACCOUNT (artboard 30): who is signed in, and Sign out; the report of the move to the new
 * layout while it is not Done (FR-099); the zone every day is counted in; light, dark or the
 * system's; the email and the password.
 */
export function Account() {
  const me = useMe().data
  const signOut = useSignOut()
  if (!me) return null
  return (
    <div className="flex max-w-[1440px] flex-col gap-3">
      <div className="mb-2 flex items-center gap-3.5">
        <span
          aria-hidden="true"
          className="inline-grid size-12 place-items-center rounded-full bg-hover text-prose font-medium text-muted uppercase"
        >
          {me.email.slice(0, 1)}
        </span>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-title text-ink">Account</h1>
          <span className="truncate text-ui text-muted">{me.email}</span>
        </div>
        {/* Nothing is lost by it, so it asks nothing (DES-001). */}
        <button type="button" onClick={signOut} className={`${BUTTON.secondary} ml-auto`}>
          <SignOutIcon size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>

      {me.migrationReport && <Moved pending={me.migrationReport.pending} />}

      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Time and place">
          <TimeZoneRow zone={me.timezone} />
        </Block>
        <Block title="Appearance">
          <Row icon={LightIcon} name="Theme">
            <ThemeSwitch />
          </Row>
        </Block>
        <Block title="Signing in" className="lg:col-span-2">
          <SigningIn email={me.email} changedAt={me.passwordChangedAt} />
        </Block>
      </div>
    </div>
  )
}

/** One setting: its icon and name, then what it is, then what can be done to it. */
function Row({
  icon: Icon,
  name,
  children,
  action,
}: {
  icon: IconComponent
  name: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    // On a phone, its name over its value, the action on a line of its own (DES-001 "账号页").
    <div className="grid min-h-16 grid-cols-[16px_140px_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 max-lg:grid-cols-[16px_minmax(0,1fr)] max-lg:gap-y-1.5">
      <Icon size={16} aria-hidden="true" className="text-muted" />
      <span className="text-ui text-muted">{name}</span>
      <div className="min-w-0 max-lg:col-start-2">{children}</div>
      {action ? (
        <div className="max-lg:col-start-2">{action}</div>
      ) : (
        <span className="max-lg:hidden" />
      )}
    </div>
  )
}

/** The prompt to look the report over, while it is not Done (FR-099). */
function Moved({ pending }: { pending: number }) {
  const report = useQuery(migrationQuery())
  const ranAt = report.data?.ranAt
  return (
    <section
      aria-label="Your data in the new layout"
      className="flex items-center gap-3 rounded-block border border-warn bg-panel px-4 py-3"
    >
      <MovedIcon size={16} aria-hidden="true" className="shrink-0 text-warn" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-ui font-medium text-ink">Your data in the new layout</span>
        <span className="text-meta text-muted">
          {ranAt && `Moved on ${monthDay(ranAt.slice(0, 10))}. `}
          {pending > 0
            ? `${pending} ${pending === 1 ? 'place where a guess was made still needs' : 'places where a guess was made still need'} a look.`
            : 'Every guess has been looked at.'}
        </span>
      </div>
      <span className="text-meta text-muted tabular-nums">
        {pending > 0 ? `${pending} left` : 'All looked at'}
      </span>
      <Link to="/migration" className={BUTTON.secondary}>
        Review
      </Link>
    </section>
  )
}

/** The account's zone: changed in place, saved on picking, Esc to keep it (DES-001). */
function TimeZoneRow({ zone }: { zone: string }) {
  const qc = useQueryClient()
  const now = useNow()
  const [changing, setChanging] = useState(false)
  const [typed, setTyped] = useState('')
  const save = useMutation({
    mutationFn: setTimeZone,
    // It reads what it changed again itself.
    meta: { refresh: false, ownsError: true },
    onSuccess: async (me) => {
      qc.setQueryData(meKey, me)
      // Every day the app shows is counted in it: read them all again.
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== meKey[0] })
    },
  })
  const pick = (next: string | null) => {
    setChanging(false)
    if (next && next !== zone) save.mutate(next)
  }
  return (
    <Row
      icon={TimeZoneIcon}
      name="Time zone"
      action={
        !changing && (
          <button
            type="button"
            onClick={() => {
              setTyped('')
              setChanging(true)
            }}
            className={BUTTON.secondary}
          >
            Change
          </button>
        )
      }
    >
      {changing ? (
        <ZoneBox
          zone={zone}
          placeholder={zone}
          typed={typed}
          onType={setTyped}
          onZone={pick}
          onLeave={() => pick(zoneFrom(typed) ?? null)}
          onCancel={() => setChanging(false)}
        />
      ) : (
        <div className="flex flex-col">
          <span className="truncate text-ui text-ink">{zone}</span>
          <span className="text-meta text-muted">
            <span className="font-mono tabular-nums">{clockTime(now, zone)}</span> now. Today, this
            week and every date are counted here.
          </span>
        </div>
      )}
      {save.isError && (
        <p role="alert" className="mt-1 text-meta text-stop-t">
          Couldn’t change it. It is still {zone}.
        </p>
      )}
    </Row>
  )
}

/** Light, dark or the system's; the top bar's switch is the same setting (DES-001). */
function ThemeSwitch() {
  const theme = useSyncExternalStore(onSchemeChange, readTheme)
  return (
    <Segmented
      label="Theme"
      picks
      segments={THEMES}
      current={theme}
      onPick={(id) => applyTheme(id as Theme)}
    />
  )
}

/** The email, shown only; the password, and changing it under its row (DES-001). */
function SigningIn({ email, changedAt }: { email: string; changedAt: string | null }) {
  const [changing, setChanging] = useState(false)
  return (
    <>
      <div className="grid lg:grid-cols-2">
        <Row icon={EmailIcon} name="Email">
          <span className="truncate text-ui text-ink">{email}</span>
        </Row>
        <Row
          icon={PasswordIcon}
          name="Password"
          action={
            !changing && (
              <button type="button" onClick={() => setChanging(true)} className={BUTTON.secondary}>
                Change password
              </button>
            )
          }
        >
          <span className="text-ui text-muted">
            {changedAt ? `Changed ${monthDay(changedAt.slice(0, 10))}` : 'Set'}
          </span>
        </Row>
      </div>
      {changing && <ChangePassword onClose={() => setChanging(false)} />}
    </>
  )
}

type Fields = { current: string; next: string; again: string }

/** What is wrong with a field, said when it is left (README rule 5). */
function problemsOf(f: Fields, left: Set<keyof Fields>) {
  return {
    next:
      left.has('next') && f.next.length > 0 && f.next.length < SHORTEST
        ? `At least ${SHORTEST} characters.`
        : null,
    again:
      left.has('again') && f.again.length > 0 && f.again !== f.next
        ? 'This is not the same as the new password.'
        : null,
  }
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState<Fields>({ current: '', next: '', again: '' })
  const [left, setLeft] = useState(new Set<keyof Fields>())
  const problems = problemsOf(f, left)
  const save = useMutation({
    mutationFn: () => changePassword(f.current, f.next),
    // It reads what it changed again itself.
    meta: { refresh: false, ownsError: true },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: meKey })
      onClose()
    },
  })
  const wrongCurrent =
    save.error instanceof ApiError && save.error.type === 'urn:ctws:problem:wrong-password'
  const ready =
    f.current.length > 0 && f.next.length >= SHORTEST && f.again === f.next && !save.isPending
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (ready) save.mutate()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') onClose()
    if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.nativeEvent.isComposing) return
    e.preventDefault()
    e.currentTarget.requestSubmit()
  }
  const input = (key: keyof Fields, name: string, problem: string | null, autoFocus = false) => (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={`password-${key}`} className={label}>
        {name}
      </label>
      <input
        id={`password-${key}`}
        type="password"
        autoFocus={autoFocus}
        autoComplete={key === 'current' ? 'current-password' : 'new-password'}
        value={f[key]}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `password-${key}-problem` : undefined}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
        onBlur={() => setLeft(new Set(left).add(key))}
        className={field}
      />
      {problem && (
        <p id={`password-${key}-problem`} className="text-meta text-stop-t">
          {problem}
        </p>
      )}
    </div>
  )
  return (
    <form
      aria-label="Change password"
      onSubmit={submit}
      onKeyDown={onKeyDown}
      noValidate
      className="flex flex-col gap-4 border-t border-line px-4 py-4"
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {input(
          'current',
          'Current password',
          wrongCurrent ? 'That is not your current password.' : null,
          true,
        )}
        {input('next', 'New password', problems.next)}
        {input('again', 'Repeat the new password', problems.again)}
      </div>
      {save.isError && !wrongCurrent && (
        <p role="alert" className="text-ui text-stop-t">
          Couldn’t change it. Your password is as it was.
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className={BUTTON.secondary}>
          Cancel
        </button>
        <button type="submit" disabled={!ready} className={BUTTON.primary}>
          Change password
          <kbd className={KEY_ON_INK}>{keyLabel('Ctrl Enter')}</kbd>
        </button>
      </div>
    </form>
  )
}
