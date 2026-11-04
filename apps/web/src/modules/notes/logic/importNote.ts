/** What a note's body and title may hold, as the server checks them. */
const BODY_MAX = 100_000
const TITLE_MAX = 500

const MARKDOWN = /\.(md|markdown)$/i

/** Whether a file is one we import, by its name: browsers rarely say a .md file's type. */
export const isMarkdownFile = (name: string): boolean => MARKDOWN.test(name)

export type Imported = { ok: true; title: string | null; body: string } | { ok: false; why: string }

/**
 * A .md file as a note, unchanged: its text is the body, a leading "# " included, and its name
 * without the extension is the title. A title is cut at the limit rather than refused; a body
 * over it, or bytes that are not UTF-8, are refused with what to do.
 */
export function noteFromFile(name: string, bytes: ArrayBuffer): Imported {
  if (!isMarkdownFile(name)) return { ok: false, why: `${name} isn't a .md file.` }
  let body: string
  try {
    body = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, why: `${name} isn't UTF-8 text. Save it as UTF-8 and import it again.` }
  }
  if (body.length > BODY_MAX)
    return { ok: false, why: `${name} is longer than a note can hold (100,000 characters).` }
  // By code point, so a cut never splits a character in two.
  const title = Array.from(name.replace(MARKDOWN, '')).slice(0, TITLE_MAX).join('').trim()
  return { ok: true, title: title || null, body }
}

/** The line said once the files are in: how many, and where. */
export function importedLine(count: number, folderName: string | null): string {
  const where = folderName ?? 'Not in a folder'
  if (count === 0) return 'No notes imported'
  return `${count} ${count === 1 ? 'note' : 'notes'} imported into ${where}`
}
