import {
  AsYouType,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min'

const TYPEABLE = /^\+?[\d\s()-]+$/
const digitsIn = (v: string) => (v.match(/\d/g) ?? []).length
const read = (value: string, region?: string) =>
  TYPEABLE.test(value)
    ? parsePhoneNumberFromString(value, region as CountryCode | undefined)
    : undefined

/**
 * Lays out a number as it is typed, grouped the way its country writes it. Anything it cannot make
 * sense of (an extension, letters, too few digits yet) is left as written.
 */
export function formatPhone(value: string, region?: string): string {
  const raw = value.trim()
  if (raw === '') return ''
  if (!/^\+?[\d\s()-]+$/.test(raw)) return raw
  const typed = new AsYouType(raw.startsWith('+') ? undefined : (region as CountryCode | undefined))
  const out = typed.input(raw)
  return out === '' ? raw : out
}

/** The region in a locale tag; none for a bare `zh`, since a guess would mis-group numbers. */
export function regionFromLocale(locale: string): string | undefined {
  const region = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(locale)?.[1]
  return region?.toUpperCase()
}

export function currentRegion(): string | undefined {
  if (typeof navigator === 'undefined') return undefined
  for (const locale of [navigator.language, ...(navigator.languages ?? [])]) {
    const region = regionFromLocale(locale ?? '')
    if (region) return region
  }
  return undefined
}

/** A stored E.164 number grouped for reading; anything it cannot parse is shown as stored. */
export function displayPhone(value: string): string {
  const raw = value.trim()
  return read(raw)?.formatInternational() ?? raw
}

/** The typed number as E.164; anything unrecognised is kept as written, not lost on save. */
export function toE164(value: string, region?: string): string {
  const raw = value.trim()
  return read(raw, region)?.number ?? raw
}

/**
 * The field's value after a keystroke. A deleted separator is let stand: reformatting would put the
 * space straight back, and the key would look broken.
 */
export function retype(previous: string, next: string, region?: string): string {
  if (next.length < previous.length && digitsIn(next) === digitsIn(previous)) return next
  return formatPhone(next, region)
}

/**
 * Says when a number's length is not one its country uses, which the contract cannot tell. Silent
 * without a country code, which the contract already reports.
 */
export function phoneProblem(value: string): string | null {
  const raw = value.trim()
  if (raw === '' || !raw.startsWith('+')) return null
  const number = read(raw)
  if (!number || number.isPossible()) return null
  return `+${number.countryCallingCode} numbers are not that length`
}

/** A region's calling code, such as `+86`, or none for a region it does not know. */
export function callingCodeFor(region: string | undefined): string | undefined {
  if (!region || !isSupportedCountry(region as CountryCode)) return undefined
  return `+${getCountryCallingCode(region as CountryCode)}`
}
