import { api, type UserResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { ApiError, call } from '../../platform/http/api'
import { browserZone, ymd } from '../../platform/time/dates'
import { useNow } from '../../platform/time/useNow'

/**
 * The signed-in user, or null when there is no valid session. Only a 401 means signed out; any
 * other failure throws, so the shell can say the server is unreachable.
 */
export function useMe() {
  return useQuery<UserResponse | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await call(api.auth.me)
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
