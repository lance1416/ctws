/**
 * Read the character coverage straight out of a woff2 file.
 *
 * Test-only: nothing in the app imports this, so it never reaches the bundle. It exists so
 * `coverage.test.ts` can assert against the SHIPPED font rather than against a list of characters
 * that says what the font ought to contain -- a list can drift from the binary, a cmap cannot.
 *
 * woff2 is a Brotli-compressed sfnt with a rewritten table directory (W3C WOFF2 section 4). Node
 * has Brotli built in, so no dependency is needed. `glyf`/`loca` are stored in a transformed form,
 * but `cmap` is not: once the stream is decompressed, the cmap bytes are an ordinary OpenType cmap
 * table, and its offset is the sum of the stored lengths of the tables declared before it.
 */
import { brotliDecompressSync } from 'node:zlib'

/** The 63 tags woff2 encodes as a 6-bit index, in the order the spec fixes (section 5.2). */
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
]

/** UIntBase128: 1-5 bytes, 7 bits each, high bit continues (WOFF2 section 4.1). */
function readBase128(buf: Buffer, at: number): [value: number, next: number] {
  let value = 0
  for (let i = 0; i < 5; i++) {
    const byte = buf[at + i]
    if (byte === undefined) break
    value = value * 128 + (byte & 0x7f)
    if ((byte & 0x80) === 0) return [value, at + i + 1]
  }
  throw new Error('woff2: malformed UIntBase128')
}

/** The decompressed bytes of one table of a woff2 file. */
function readTable(file: Buffer, want: string): Buffer {
  if (file.toString('latin1', 0, 4) !== 'wOF2') throw new Error('woff2: bad signature')
  const numTables = file.readUInt16BE(12)
  let at = 48
  const tables: { tag: string; length: number }[] = []
  for (let i = 0; i < numTables; i++) {
    const flags = file[at++]
    if (flags === undefined) throw new Error('woff2: table directory runs past the file')
    const index = flags & 0x3f
    let tag: string
    if (index === 0x3f) {
      tag = file.toString('latin1', at, at + 4)
      at += 4
    } else {
      const known = KNOWN_TAGS[index]
      if (known === undefined) throw new Error(`woff2: unknown table index ${index}`)
      tag = known
    }
    const transform = (flags >> 6) & 0x03
    let length: number
    ;[length, at] = readBase128(file, at)
    // A transformLength follows when the table is stored transformed: for glyf/loca that is any
    // version except 3 ("no transform"), for every other table it is any version except 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? transform !== 3 : transform !== 0
    if (transformed) [length, at] = readBase128(file, at)
    tables.push({ tag, length })
  }
  const sfnt = brotliDecompressSync(file.subarray(at))
  let offset = 0
  for (const table of tables) {
    if (table.tag === want) return sfnt.subarray(offset, offset + table.length)
    offset += table.length
  }
  throw new Error(`woff2: no ${want} table`)
}

/** Every Unicode codepoint the font maps to a glyph, from its best unicode cmap subtable. */
export function woff2Codepoints(file: Buffer): Set<number> {
  const cmap = readTable(file, 'cmap')
  const found = new Set<number>()
  let best: { format: number; offset: number } | undefined
  for (let i = 0; i < cmap.readUInt16BE(2); i++) {
    const rec = 4 + i * 8
    const platform = cmap.readUInt16BE(rec)
    const encoding = cmap.readUInt16BE(rec + 2)
    const offset = cmap.readUInt32BE(rec + 4)
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10))
    if (!unicode) continue
    const format = cmap.readUInt16BE(offset)
    // Prefer format 12 (full 32-bit) when both are present; otherwise take format 4.
    if (format === 12 || (format === 4 && best?.format !== 12)) best = { format, offset }
  }
  if (!best) throw new Error('cmap: no format 4 or 12 unicode subtable')

  if (best.format === 4) {
    const base = best.offset
    const segs = cmap.readUInt16BE(base + 6) / 2
    const ends = base + 14
    const starts = ends + segs * 2 + 2
    const deltas = starts + segs * 2
    const ranges = deltas + segs * 2
    for (let s = 0; s < segs; s++) {
      const end = cmap.readUInt16BE(ends + s * 2)
      const start = cmap.readUInt16BE(starts + s * 2)
      if (start === 0xffff) continue
      const delta = cmap.readInt16BE(deltas + s * 2)
      const rangeOffset = cmap.readUInt16BE(ranges + s * 2)
      for (let c = start; c <= end; c++) {
        if (rangeOffset === 0) {
          if (((c + delta) & 0xffff) !== 0) found.add(c)
        } else {
          const at = ranges + s * 2 + rangeOffset + (c - start) * 2
          const glyph = cmap.readUInt16BE(at)
          if (glyph !== 0) found.add(c)
        }
      }
    }
  } else {
    const base = best.offset
    const groups = cmap.readUInt32BE(base + 12)
    for (let g = 0; g < groups; g++) {
      const at = base + 16 + g * 12
      const start = cmap.readUInt32BE(at)
      const end = cmap.readUInt32BE(at + 4)
      for (let c = start; c <= end; c++) found.add(c)
    }
  }
  return found
}
