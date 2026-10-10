import type { UserResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './api'
import { browserZone } from './dueAt'

// The signed-in user, or null when there is no valid session. Shared by Layout (the single
// place that redirects to /login) and Login (which skips itself when already signed in).
export function useMe() {
  return useQuery<UserResponse | null>({
    queryKey: ['me'],
    queryFn: () => apiFetch<UserResponse>('/auth/me').catch(() => null),
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
