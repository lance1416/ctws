/**
 * Whether the whole line is a link, for capture's routing and the reading input alike. A line that
 * merely contains one ("read this https://…") is a note, and `new URL` rejects it for the space.
 */
export function isReadingUrl(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === '') return false
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return false
  }
  // http(s) only: the list renders this as an href someone will click. A host as well, because
  // `https://` alone parses and is a link to nothing.
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.host.length > 0
}
