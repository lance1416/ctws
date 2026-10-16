/**
 * The location as a link, only with an explicit http(s) scheme: unlike a `url` channel, a location
 * has not said it is a link, and "Acme HQ, 3F" must not become one.
 */
export function meetingLink(location: string | null): string | null {
  if (!location) return null
  const trimmed = location.trim()
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null
}
