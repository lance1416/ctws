import { describe, expect, it } from 'vitest'
import { importedLine, isMarkdownFile, noteFromFile } from './importNote'

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

describe('a .md file as a note', () => {
  it('keeps the text as it is, a leading heading included, and takes the name as the title', () => {
    const body = '# Ideas\r\n\r\n- one\n- two\n'
    expect(noteFromFile('Ideas.md', bytes(body))).toEqual({ ok: true, title: 'Ideas', body })
  })

  it('takes .markdown too, in any case, and nothing else', () => {
    expect(isMarkdownFile('Plan.MD')).toBe(true)
    expect(isMarkdownFile('Plan.markdown')).toBe(true)
    expect(isMarkdownFile('Plan.txt')).toBe(false)
    expect(noteFromFile('Photo.png', bytes('x'))).toEqual({
      ok: false,
      why: "Photo.png isn't a .md file.",
    })
  })

  it('refuses bytes that are not UTF-8, saying what to do', () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer
    expect(noteFromFile('Ideas.md', latin1)).toEqual({
      ok: false,
      why: "Ideas.md isn't UTF-8 text. Save it as UTF-8 and import it again.",
    })
  })

  it('refuses a body past the limit, and takes one exactly at it', () => {
    expect(noteFromFile('Long.md', bytes('a'.repeat(100_001)))).toEqual({
      ok: false,
      why: 'Long.md is longer than a note can hold (100,000 characters).',
    })
    expect(noteFromFile('Long.md', bytes('a'.repeat(100_000))).ok).toBe(true)
  })

  it('cuts a long name to 500 characters, never inside one', () => {
    const imported = noteFromFile(`${'面'.repeat(499)}😀😀.md`, bytes('x'))
    expect(imported.ok && Array.from(imported.title!)).toHaveLength(500)
    expect(imported.ok && imported.title!.endsWith('😀')).toBe(true)
  })

  it('leaves a file named only .md untitled', () => {
    expect(noteFromFile('.md', bytes('x'))).toEqual({ ok: true, title: null, body: 'x' })
  })
})

describe('the line once they are in', () => {
  it('says how many and where', () => {
    expect(importedLine(3, 'Reading notes')).toBe('3 notes imported into Reading notes')
    expect(importedLine(1, null)).toBe('1 note imported into Not in a folder')
    expect(importedLine(0, null)).toBe('No notes imported')
  })
})
