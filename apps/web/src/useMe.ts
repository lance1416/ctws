import type { UserResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from './api'
import { browserZone } from './dueAt'

/**
 * The signed-in user, or null when there is no valid session. Shared by Layout (the single place
 * that redirects to /login) and Login (which skips itself when already signed in).
 *
 * ONLY A 401 MEANS "NOT SIGNED IN". Swallowing every failure makes a server that is down
 * indistinguishable from a visitor who is not signed in, and the reader is then sent to a login
 * page that cannot work either -- with nothing on screen saying why. Anything that is not a 401
 * is left to throw, so the shell can say the server is unreachable.
 */
export function useMe() {
  return useQuery<UserResponse | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await apiFetch<UserResponse>('/auth/me')
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    retry: false,
  })
}

/**
 * THE ACCOUNT'S TIMEZONE, and the single source of "what day is it" in the web app.
 *
 * The API decides which segment a task is in, which day it was completed on and which week counts
 * as this one, all with `at time zone $tz` on `users.timezone`. Anything the page then says about a
 * day has to be worked out in the SAME zone, or the two disagree: wording taken from the
 * browser's zone would show a reader on another machine a task the server has filed as overdue
 * whose own row says it is due tomorrow. Every date helper takes a zone, and this is what every
 * caller passes.
 *
 * The browser's zone is the fallback for the one moment the `['me']` query has not landed (and for
 * the login screen, which has no account yet); it is a starting value, not a second answer -- the
 * phrases recompute as soon as `me` arrives.
 */
export function useTimeZone(): string {
  const me = useMe()
  return me.data?.timezone ?? browserZone()
}
