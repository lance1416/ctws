import { AsYouType, type CountryCode } from 'libphonenumber-js/min'

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
