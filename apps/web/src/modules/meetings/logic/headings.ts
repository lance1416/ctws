/** The headings of a note, for the little contents in its block's head (FR-069). */
export function headingsOf(body: string): string[] {
  return body
    .split('\n')
    .flatMap((line) => {
      const m = /^#{1,3}\s+(.+?)\s*#*\s*$/.exec(line)
      return m ? [m[1]!] : []
    })
    .slice(0, 6)
}
