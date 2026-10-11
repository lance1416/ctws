import {
  AsYouType,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min'

/** 能当号码排的那些字符：数字、空格、横杠、括号，开头可以有一个加号。 */
const TYPEABLE = /^\+?[\d\s()-]+$/
const digitsIn = (v: string) => (v.match(/\d/g) ?? []).length
const read = (value: string, region?: string) =>
  TYPEABLE.test(value)
    ? parsePhoneNumberFromString(value, region as CountryCode | undefined)
    : undefined

/**
 * 一串数字排成一个号码。
 *
 * 分组是按国家来的 —— 中国的手机是 3-4-4，英国的固话是 3-4-4 但区号长短不一，美国是 3-3-4 带
 * 括号。自己写的正则只在自己那个国家对，所以这件事交给 libphonenumber-js（MIT，和本仓库一致）。
 *
 * 用的是 `/min` 那套元数据，而且这个模块只在**编辑联系方式**时才被加载（`ContactForm` 动态
 * import），所以它不在首屏那一包里 —— 和 Markdown 渲染器、Mermaid 一样的待遇。
 *
 * `AsYouType` 而不是 `parsePhoneNumber`：一个人是一位一位打进来的，排版要跟着打到哪儿，而不是
 * 等号码完整才突然跳一下。打不出名堂的（分机、带字母的、还没打到能判断的位数）原样留着 ——
 * 这是一个人自己的通讯录，不是拨号程序。
 */
export function formatPhone(value: string, region?: string): string {
  const raw = value.trim()
  if (raw === '') return ''
  // 只排数字、加号、空格、横杠、括号组成的东西；别的（「分机 8012」）不碰。
  if (!/^\+?[\d\s()-]+$/.test(raw)) return raw
  const typed = new AsYouType(raw.startsWith('+') ? undefined : (region as CountryCode | undefined))
  const out = typed.input(raw)
  return out === '' ? raw : out
}

/**
 * 不带国家码时按哪个国家排：浏览器语言里的地区。
 *
 * 不猜：`zh` 没有地区，那就没有 —— 猜一个会把一个英国号码排成中国的分组，而原样留着不会。
 */
export function regionFromLocale(locale: string): string | undefined {
  const region = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(locale)?.[1]
  return region?.toUpperCase()
}

/** 这台机器上的默认地区，给表单用。 */
export function currentRegion(): string | undefined {
  if (typeof navigator === 'undefined') return undefined
  for (const locale of [navigator.language, ...(navigator.languages ?? [])]) {
    const region = regionFromLocale(locale ?? '')
    if (region) return region
  }
  return undefined
}

/**
 * 存的是一种写法，看到的是另一种。
 *
 * 存下来的是 E.164 —— `+8613800000000`，没有空格也没有括号，全世界只有一个读法，`tel:` 直接拿去
 * 拨。看到的是按国家分好组的那一串，由 E.164 当场算出来。
 *
 * 两边分开，是因为以前没分开：排版只发生在联系人详情那张表的输入框里，于是从新建对话框写下的
 * 号码一辈子挤成一条，而同一个号码在列表和详情里长什么样取决于它当初是从哪儿写进来的。
 */
export function displayPhone(value: string): string {
  const raw = value.trim()
  return read(raw)?.formatInternational() ?? raw
}

/** 写下的那一串，存成一条国际号码。认不出来就原样留着 —— 分机和备注不该在保存时消失。 */
export function toE164(value: string, region?: string): string {
  const raw = value.trim()
  return read(raw, region)?.number ?? raw
}

/**
 * 又打了一个字之后，这个框里该是什么。
 *
 * 退格删掉的那个空格不能被当场补回去：`+86 139 0000 1234` 里删掉一个空格，重排会立刻把它放回
 * 原处，看起来就是这个键坏了。数字没变而字短了，那删掉的就是一个分隔符，这一下让它过。
 */
export function retype(previous: string, next: string, region?: string): string {
  if (next.length < previous.length && digitsIn(next) === digitsIn(previous)) return next
  return formatPhone(next, region)
}

/**
 * 这个长度那个国家不用。
 *
 * 契约管的是写法（带不带国家码、几位数、有没有奇怪的字），这里管的是这个国家的号码到底有多长
 * ——`+86 1380000` 两条写法规则都满足，而中国没有这个长度的号码。只在带了国家码之后才说话：
 * 没带的那条已经有人说了，一处不成立说两句是吵。
 */
export function phoneProblem(value: string): string | null {
  const raw = value.trim()
  if (raw === '' || !raw.startsWith('+')) return null
  const number = read(raw)
  if (!number || number.isPossible()) return null
  return `+${number.countryCallingCode} numbers are not that length`
}

/**
 * 一个地区的国家码，写成 `+86` 这样。不认识那个地区就没有 —— 猜一个国家码比空着糟得多。
 *
 * 空着的电话框里先放上它：「国家码到底怎么输」不该是站在一个空框前要想的问题。
 */
export function callingCodeFor(region: string | undefined): string | undefined {
  if (!region || !isSupportedCountry(region as CountryCode)) return undefined
  return `+${getCountryCallingCode(region as CountryCode)}`
}
