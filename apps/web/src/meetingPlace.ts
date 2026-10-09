/**
 * WHERE A MEETING IS, when "where" is a link.
 *
 * `location` is one free-text field because that is what it is in iCalendar and what it is in
 * life: a room, an address, a Zoom URL. The only thing worth deciding about it is whether it can
 * be OPENED -- at 09:29 the useful thing about "https://meet…/abc" is a control that joins, not
 * a string to select and paste.
 *
 * STRICT ABOUT WHAT A LINK IS: only an explicit http(s) scheme. The contacts module guesses
 * (`github.com/dana` becomes a URL) because a channel typed as `url` has already said what it
 * is; a location has not, and "Acme HQ, 3F" must not become a link to a domain that may exist.
 */
export function meetingLink(location: string | null): string | null {
  if (!location) return null
  const trimmed = location.trim()
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null
}
