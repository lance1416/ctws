import { api, type MeResponse } from '@ctws/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, call } from '../../platform/http/api'
import { setShortcutsEnabled } from '../../platform/keyboard/enabled'
import { browserZone, ymd } from '../../platform/time/dates'
import { setServerNow } from '../../platform/time/serverClock'
import { useNow } from '../../platform/time/useNow'

/** The signed-in user's key. No write but signing in or out changes what it reads. */
export const meKey = ['me'] as const

/**
 * The signed-in user, or null when there is no valid session. Only a 401 means signed out; any
 * other failure throws, so the shell can say the server is unreachable.
 */
export function useMe() {
  return useQuery<MeResponse | null>({
    queryKey: meKey,
    queryFn: async ({ signal }) => {
      try {
        const me = await call(api.auth.me, {}, { signal })
        // A pinned server (acceptance, UAT) says what the present is; every date follows it.
        // Otherwise the browser's own clock is the present.
        if (me.clockPinned) setServerNow(me.now)
        // Single keys on or off is the account's (FR-029); the keyboard reads this copy of it.
        setShortcutsEnabled(me.singleKeyShortcuts)
        return me
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    retry: false,
  })
}

/**
 * The account's timezone, which every date helper is given: the server files days in this zone,
 * so the page must word them in it too. The browser's zone only stands in until `me` loads.
 */
export function useTimeZone(): string {
  const me = useMe()
  return me.data?.timezone ?? browserZone()
}

/** Today in the account's zone, `YYYY-MM-DD`, turning at its midnight while the page stays open. */
export function useAccountToday(): string {
  return ymd(useNow(), useTimeZone())
}

/** Single keys on or off, kept with the account (FR-029): at once here, then on the server. */
export function useSetSingleKeys() {
  const qc = useQueryClient()
  const save = useMutation({
    mutationFn: (on: boolean) => call(api.auth.updateMe, { body: { singleKeyShortcuts: on } }),
    // Nothing else reads it: the account comes back in the answer.
    meta: { refresh: false },
    onSuccess: (me) => qc.setQueryData(meKey, me),
    // Not kept: the account says what it still is.
    onError: () => void qc.invalidateQueries({ queryKey: meKey }),
  })
  // Said at once, before the press's render: the switch is drawn from it.
  return (on: boolean) => {
    setShortcutsEnabled(on)
    save.mutate(on)
  }
}
