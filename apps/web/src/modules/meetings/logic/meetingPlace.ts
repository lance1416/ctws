/**
 * The location as a link, only with an explicit http(s) scheme: unlike a `url` channel, a location
 * has not said it is a link, and "Acme HQ, 3F" must not become one.
 */
export function meetingLink(location: string | null): string | null {
  if (!location) return null
  const trimmed = location.trim()
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null
}

/**
 * Where Join goes: the meeting's link, else a location that is one. Only an http(s) address is
 * ever a link; a stored value from before that rule is never put in an `href`.
 */
export function joinLink(joinUrl: string | null, location: string | null): string | null {
  if (joinUrl) {
    try {
      const url = new URL(joinUrl)
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href
    } catch {
      // Not an address: fall through to the location.
    }
  }
  return meetingLink(location)
}
