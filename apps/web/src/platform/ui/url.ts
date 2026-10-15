/**
 * A link as one line of text: `github.com/lance1416/ctws`. The path stays, since a bare host says
 * little; the query string goes.
 */
export function linkLabel(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return u.host.replace(/^www\./, '') + u.pathname.replace(/\/$/, '')
  } catch {
    return url
  }
}
