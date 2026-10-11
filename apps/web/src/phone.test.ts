import { describe, expect, it } from 'vitest'
import { formatPhone, regionFromLocale } from './phone'

/**
 * 一串数字排成一个号码。
 *
 * 分组规则是按国家来的（中国的手机是 3-4-4，英国的固话又不一样），所以这件事交给
 * libphonenumber-js —— 自己写的那套正则只在自己那个国家对。
 */
describe('formatPhone', () => {
  it('带国家码的，排成国际写法', () => {
    expect(formatPhone('+8613900001234')).toBe('+86 139 0000 1234')
    expect(formatPhone('+442079460958')).toBe('+44 20 7946 0958')
  })

  it('不带国家码的，按当地的分组排', () => {
    expect(formatPhone('13900001234', 'CN')).toBe('139 0000 1234')
    expect(formatPhone('02079460958', 'GB')).toBe('020 7946 0958')
  })

  it('还没打完就按打了的排，不要跳回去', () => {
    expect(formatPhone('139000', 'CN')).toBe('139 000')
    expect(formatPhone('+8613', 'CN')).toBe('+86 13')
  })

  it('排不出来就原样留着：这是个人自己的通讯录，不是拨号程序', () => {
    expect(formatPhone('分机 8012')).toBe('分机 8012')
    expect(formatPhone('')).toBe('')
  })
})

describe('regionFromLocale', () => {
  it('从语言标签里取地区', () => {
    expect(regionFromLocale('zh-CN')).toBe('CN')
    expect(regionFromLocale('en-GB')).toBe('GB')
  })

  it('没有地区就没有：猜一个比不猜更糟', () => {
    expect(regionFromLocale('zh')).toBeUndefined()
    expect(regionFromLocale('')).toBeUndefined()
  })
})
