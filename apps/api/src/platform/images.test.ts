import sharp, { type Sharp } from 'sharp'
import { describe, expect, it } from 'vitest'
import { AVATAR_PX, avatarFrom, iconFrom, pictureFrom, sniff } from './images'

const RED = { r: 255, g: 0, b: 0 }
const BLUE = { r: 0, g: 0, b: 255 }

/** A picture `w` by `h`, red on its left half and blue on its right. */
async function halves(w: number, h: number) {
  const half = await sharp({ create: { width: w / 2, height: h, channels: 3, background: BLUE } })
    .png()
    .toBuffer()
  return sharp({ create: { width: w, height: h, channels: 3, background: RED } }).composite([
    { input: half, left: w / 2, top: 0 },
  ])
}

/** The colour at the middle of a decoded picture. */
async function middle(bytes: Buffer) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
  const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels
  return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! }
}

const near = (c: { r: number; g: number; b: number }, to: typeof RED) =>
  Math.abs(c.r - to.r) + Math.abs(c.g - to.g) + Math.abs(c.b - to.b) < 60

/** A JPEG straight off a phone: stored on its side, saying what it was taken on. */
async function phonePhoto() {
  const photo = await (
    await halves(400, 200)
  )
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Make: 'Phone', Model: 'Phone 99' } })
    .toBuffer()
  // What the test leans on, checked once: sideways as stored, upright 200 by 400.
  expect((await sharp(photo).metadata()).autoOrient).toEqual({ width: 200, height: 400 })
  expect(photo.includes('Phone 99')).toBe(true)
  return photo
}

describe('sniff', () => {
  it('knows the four formats by their first bytes', async () => {
    const base = sharp({ create: { width: 2, height: 2, channels: 3, background: RED } })
    expect(sniff(await base.clone().jpeg().toBuffer())).toBe('jpeg')
    expect(sniff(await base.clone().png().toBuffer())).toBe('png')
    expect(sniff(await base.clone().webp().toBuffer())).toBe('webp')
    expect(sniff(await base.clone().gif().toBuffer())).toBe('gif')
  })

  it('knows nothing else, whatever the file would be called', () => {
    expect(sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniff(Buffer.from('II*\0'))).toBeNull()
    expect(sniff(Buffer.alloc(0))).toBeNull()
  })
})

describe('avatarFrom', () => {
  it('turns a phone photo upright before cutting the square the person chose', async () => {
    const photo = await phonePhoto()
    // Upright, the red half is on top: 200 wide, 400 tall.
    const top = await avatarFrom(photo, { x: 0, y: 0, size: 200 })
    const bottom = await avatarFrom(photo, { x: 0, y: 200, size: 200 })
    if (!top.ok || !bottom.ok) throw new Error('expected both to be kept')
    expect(near(await middle(top.webp), RED)).toBe(true)
    expect(near(await middle(bottom.webp), BLUE)).toBe(true)
  })

  it('keeps a square WebP of one size, and nothing of the file but its pixels', async () => {
    const out = await avatarFrom(await phonePhoto(), { x: 0, y: 0, size: 200 })
    if (!out.ok) throw new Error('expected it to be kept')
    const meta = await sharp(out.webp).metadata()
    expect(meta).toMatchObject({ format: 'webp', width: AVATAR_PX, height: AVATAR_PX })
    expect(meta.exif).toBeUndefined()
    expect(meta.icc).toBeUndefined()
    expect(meta.xmp).toBeUndefined()
    expect(meta.orientation).toBeUndefined()
    expect(out.webp.includes('Phone 99')).toBe(false)
  })

  it('takes the first frame of an animation', async () => {
    const frame = (background: typeof RED) =>
      sharp({ create: { width: 8, height: 8, channels: 3, background } })
        .png()
        .toBuffer()
    const animated = await sharp([await frame(RED), await frame(BLUE)], {
      join: { animated: true },
    })
      .gif()
      .toBuffer()
    expect((await sharp(animated).metadata()).pages).toBe(2)
    const out = await avatarFrom(animated, { x: 0, y: 0, size: 8 })
    if (!out.ok) throw new Error('expected it to be kept')
    expect((await sharp(out.webp).metadata()).pages ?? 1).toBe(1)
    expect(near(await middle(out.webp), RED)).toBe(true)
  })

  it('refuses an SVG renamed to anything', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    )
    expect(await avatarFrom(svg, { x: 0, y: 0, size: 10 })).toEqual({
      ok: false,
      why: 'unsupported',
    })
  })

  it('refuses a file that only begins like a picture', async () => {
    const torn = (
      await sharp({ create: { width: 64, height: 64, channels: 3, background: RED } })
        .png()
        .toBuffer()
    ).subarray(0, 40)
    expect(await avatarFrom(torn, { x: 0, y: 0, size: 8 })).toEqual({
      ok: false,
      why: 'unsupported',
    })
  })

  it('refuses a picture bigger than any camera makes', async () => {
    const huge = await sharp({
      create: { width: 6000, height: 4100, channels: 3, background: RED },
    })
      .jpeg()
      .toBuffer()
    expect(await avatarFrom(huge, { x: 0, y: 0, size: 100 })).toEqual({
      ok: false,
      why: 'unsupported',
    })
  })

  it.each([
    { x: 0, y: 0, size: 201 },
    { x: 1, y: 0, size: 200 },
    { x: 0, y: 201, size: 200 },
    { x: -1, y: 0, size: 10 },
    { x: 0, y: 0, size: 0 },
    { x: 0, y: 0, size: -5 },
    { x: 0.5, y: 0, size: 10 },
  ])('refuses a square that does not fit the upright picture: %j', async (crop) => {
    expect(await avatarFrom(await phonePhoto(), crop)).toEqual({ ok: false, why: 'bad-crop' })
  })
})

/** An ICO holding `entries`, each a PNG or (with `bmp`) bytes that are not one. */
function ico(entries: { width: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + entries.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)
  let offset = header.length
  entries.forEach((e, i) => {
    const at = 6 + i * 16
    header[at] = e.width === 256 ? 0 : e.width
    header[at + 1] = header[at]!
    header.writeUInt32LE(e.data.length, at + 8)
    header.writeUInt32LE(offset, at + 12)
    offset += e.data.length
  })
  return Buffer.concat([header, ...entries.map((e) => e.data)])
}

const square = (px: number, background: typeof RED) =>
  sharp({ create: { width: px, height: px, channels: 3, background } })
    .png()
    .toBuffer()

describe('iconFrom', () => {
  it('keeps a 64px WebP square of a PNG, a JPEG, a GIF or a WebP', async () => {
    for (const make of [
      (s: Sharp) => s.png(),
      (s: Sharp) => s.jpeg(),
      (s: Sharp) => s.gif(),
      (s: Sharp) => s.webp(),
    ]) {
      const bytes = await make(
        sharp({ create: { width: 32, height: 32, channels: 3, background: RED } }),
      ).toBuffer()
      const out = await iconFrom(bytes)
      expect(await sharp(out!).metadata()).toMatchObject({ format: 'webp', width: 64, height: 64 })
    }
  })

  it('takes the widest PNG out of an ICO', async () => {
    const out = await iconFrom(
      ico([
        { width: 16, data: await square(16, BLUE) },
        { width: 48, data: await square(48, RED) },
      ]),
    )
    expect(near(await middle(out!), RED)).toBe(true)
  })

  it('has no icon from an ICO of old bitmaps only, or from an SVG', async () => {
    expect(await iconFrom(ico([{ width: 16, data: Buffer.alloc(40) }]))).toBeNull()
    expect(await iconFrom(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
  })
})

describe('pictureFrom', () => {
  it('keeps a picture no wider than 1200, never scaled up, as WebP', async () => {
    const wide = await sharp({
      create: { width: 2400, height: 1260, channels: 3, background: RED },
    })
      .jpeg()
      .toBuffer()
    expect(await sharp((await pictureFrom(wide))!).metadata()).toMatchObject({
      format: 'webp',
      width: 1200,
      height: 630,
    })
    const small = await square(300, RED)
    expect(await sharp((await pictureFrom(small))!).metadata()).toMatchObject({ width: 300 })
  })

  it('refuses what is not one of the four pictures', async () => {
    expect(await pictureFrom(Buffer.from('<svg/>'))).toBeNull()
  })
})
