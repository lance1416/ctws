import sharp from 'sharp'

/** The formats a photo may arrive in. Not SVG: it can carry script, and we would serve it. */
type Format = 'jpeg' | 'png' | 'webp' | 'gif'

/**
 * The format by the file's first bytes, never by its name or the type the browser claims. Done
 * before the decoder sees anything: sharp also reads SVG and TIFF, and checking what it decoded
 * would be after an SVG had already been parsed.
 */
export function sniff(bytes: Buffer): Format | null {
  const at = (offset: number, ascii: string) =>
    bytes.subarray(offset, offset + ascii.length).toString('latin1') === ascii
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (at(0, '\x89PNG\r\n\x1a\n')) return 'png'
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp'
  if (at(0, 'GIF87a') || at(0, 'GIF89a')) return 'gif'
  return null
}

/** A square on the picture as it is seen upright, in its own pixels. */
export type Crop = { x: number; y: number; size: number }

/** Every photo is stored at one size, enough for the largest place one is shown at 2x. */
export const AVATAR_PX = 512

// A decompression bomb is a small file that decodes to an enormous picture. 24 megapixels is
// more than any phone's camera, and bounds the memory one decode can take.
const MAX_PIXELS = 24_000_000

const decode = (bytes: Buffer) =>
  // `pages: 1`: an animated GIF or WebP gives its first frame only.
  sharp(bytes, { pages: 1, limitInputPixels: MAX_PIXELS, failOn: 'error' })

type Result = { ok: true; webp: Buffer } | { ok: false; why: 'unsupported' | 'bad-crop' }

/**
 * A photo as it is kept: turned upright by its EXIF orientation, the square the person chose cut
 * out of that upright picture (which is what the browser showed them), scaled to `AVATAR_PX`
 * and encoded anew as WebP. Nothing of the file survives but its pixels: no EXIF, no location,
 * no device, no second frame. A crop that does not fit is refused, not corrected, so a client
 * that sends one is seen to.
 */
export async function avatarFrom(bytes: Buffer, crop: Crop): Promise<Result> {
  if (sniff(bytes) === null) return { ok: false, why: 'unsupported' }
  let width: number
  let height: number
  try {
    const meta = await decode(bytes).metadata()
    ;({ width, height } = meta.autoOrient)
  } catch {
    return { ok: false, why: 'unsupported' }
  }
  const { x, y, size } = crop
  const whole = [x, y, size].every(Number.isInteger)
  if (!whole || x < 0 || y < 0 || size <= 0 || x + size > width || y + size > height) {
    return { ok: false, why: 'bad-crop' }
  }
  try {
    const webp = await decode(bytes)
      .autoOrient()
      .extract({ left: x, top: y, width: size, height: size })
      .resize(AVATAR_PX, AVATAR_PX)
      .webp({ quality: 82 })
      .toBuffer()
    return { ok: true, webp }
  } catch {
    // The header read but the pixels did not: a truncated or corrupt file.
    return { ok: false, why: 'unsupported' }
  }
}

/** An icon is stored at the size its largest showing needs: a 32px square at 2x. */
const ICON_PX = 64
/** A page's picture is kept no wider than a card shows it at 2x. */
const PICTURE_MAX_WIDTH = 1200

/**
 * The PNG inside an ICO file: the widest one, which is the sharpest scaled down. An ICO of only
 * old-style bitmaps gives null: those are not worth a decoder of their own, and the link shows the
 * generic icon instead.
 */
function pngInIco(bytes: Buffer): Buffer | null {
  if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return null
  const count = bytes.readUInt16LE(4)
  let best: { width: number; png: Buffer } | null = null
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16
    if (at + 16 > bytes.length) return null
    // A width byte of 0 means 256.
    const width = bytes[at]! || 256
    const size = bytes.readUInt32LE(at + 8)
    const offset = bytes.readUInt32LE(at + 12)
    if (offset + size > bytes.length) continue
    const image = bytes.subarray(offset, offset + size)
    if (sniff(image) !== 'png') continue
    if (!best || width > best.width) best = { width, png: image }
  }
  return best?.png ?? null
}

/**
 * A site's icon as kept: a 64px square WebP, the icon whole inside it on a clear ground. ICO is
 * taken for its PNG; anything that is not one of the four pictures, SVG first, is refused.
 */
export async function iconFrom(bytes: Buffer): Promise<Buffer | null> {
  const picture = sniff(bytes) === null ? pngInIco(bytes) : bytes
  if (!picture || sniff(picture) === null) return null
  try {
    return await decode(picture)
      .autoOrient()
      .resize(ICON_PX, ICON_PX, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toBuffer()
  } catch {
    return null
  }
}

/** A page's picture as kept: no wider than a card needs, never scaled up, encoded anew as WebP. */
export async function pictureFrom(bytes: Buffer): Promise<Buffer | null> {
  if (sniff(bytes) === null) return null
  try {
    return await decode(bytes)
      .autoOrient()
      .resize({ width: PICTURE_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer()
  } catch {
    return null
  }
}
