/**
 * IS THIS LINE A LINK?
 *
 * One rule, used in two places that must agree: the capture box's routing (`accepts`) and the
 * 待读 input's link-or-book decision. If they drifted, a line pasted into capture would land
 * somewhere other than the same line typed into the list.
 *
 * DELIBERATELY NARROW -- the WHOLE line is a url, not a line that merely contains one. 「看看这篇
 * https://… 」 is a note about a link, which is a task; the bare url is the link itself. A rule
 * that claimed every line containing a url would quietly swallow sentences, and the design's one
 * defence against a wrong guess is that you can see where the line went.
 *
 * The narrowness is the URL PARSER's, not a regex of ours: `new URL` rejects anything with a
 * space or a prefix in front of the scheme, which is every sentence. An earlier version guarded
 * those cases by hand as well, and a mutation test showed the guards were doing nothing -- two
 * spellings of one rule, where only one of them could ever be wrong.
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
