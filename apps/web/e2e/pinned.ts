/**
 * THE PINNED INSTANT, the one `api-pinned` starts its clock at (docker-compose.yml). A spec that
 * runs against it (`*.pinned.spec.ts`) takes every expected day and time from here, never from
 * the wall clock, so it says the same thing whenever it runs.
 *
 * The pinned clock runs on from when the container starts, so these specs assert days, not
 * minutes: 00:30 UTC leaves the dates they use unchanged for the next ten hours.
 */
export const PINNED_AT = '2026-10-22T00:30:00Z'
