import { describe, expect, it } from 'vitest'
import {
  callingCodeFor,
  displayPhone,
  formatPhone,
  phoneProblem,
  regionFromLocale,
  retype,
  toE164,
} from './phone'

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

/**
 * 存一种写法，看另一种写法。
 *
 * 存下来的是 E.164（`+8613800000000`）—— 没有空格、没有括号、全世界只有一个读法，`tel:` 直接能
 * 拨。屏幕上看到的是按国家分好组的那一串，由 E.164 算出来。两边分开，于是在哪儿写下这个号码都
 * 不影响它在哪儿长什么样 —— 以前排版只发生在联系人详情的那张表里，从新建对话框进来的号码于是
 * 一辈子挤成一条。
 */
describe('displayPhone', () => {
  it('从 E.164 排成看得清的国际写法', () => {
    expect(displayPhone('+8613800000000')).toBe('+86 138 0000 0000')
    expect(displayPhone('+442079460958')).toBe('+44 20 7946 0958')
    expect(displayPhone('+17301974443')).toBe('+1 730 197 4443')
  })

  it('排不出来的原样给出来：老数据不能因为排不出就消失', () => {
    expect(displayPhone('(730) 197-4443')).toBe('(730) 197-4443')
    expect(displayPhone('分机 8012')).toBe('分机 8012')
    expect(displayPhone('')).toBe('')
  })
})

describe('toE164', () => {
  it('人写的那一串，存成一条国际号码', () => {
    expect(toE164('+86 138 0000 0000')).toBe('+8613800000000')
    expect(toE164('+44 (0)20 7946 0958')).toBe('+442079460958')
  })

  it('没带国家码的老号码，按当地补上 —— 不然它永远过不了校验', () => {
    expect(toE164('(730) 197-4443', 'US')).toBe('+17301974443')
    expect(toE164('139 0000 1234', 'CN')).toBe('+8613900001234')
  })

  it('补不出来就原样留着', () => {
    expect(toE164('分机 8012')).toBe('分机 8012')
    expect(toE164('139 0000 1234')).toBe('139 0000 1234')
  })
})

describe('retype', () => {
  it('删掉一个空格就是删掉一个空格，不会被当场补回去', () => {
    expect(retype('+86 139 0000 1234', '+86 1390000 1234')).toBe('+86 1390000 1234')
  })

  it('又打了一个数字，整条重新排', () => {
    expect(retype('+8613', '+86139')).toBe('+86 139')
  })
})

describe('phoneProblem', () => {
  it('这个长度那个国家不用，就说出来', () => {
    expect(phoneProblem('+8613800')).toBe('+86 numbers are not that length')
    // 15 位是 E.164 的上限，契约放行；中国没有这个长度的号码，这里才知道。
    expect(phoneProblem('+86 138 0000 0000 00')).toBe('+86 numbers are not that length')
  })

  it('说得通的不说话，还没打完的也不催', () => {
    expect(phoneProblem('+86 138 0000 0000')).toBeNull()
    expect(phoneProblem('+86 1380000')).toBeNull()
    expect(phoneProblem('')).toBeNull()
  })

  it('没有国家码那条留给契约说：一处不成立只说一句话', () => {
    expect(phoneProblem('010-1234-5678')).toBeNull()
  })
})

/**
 * 空着的电话框里先放上本地的国家码。
 *
 * 「国家码到底怎么输」不该是一个人站在空框前要想的问题：框里已经写着 `+86`，接着打就是了。
 */
describe('callingCodeFor', () => {
  it('给一个地区，给出它的国家码', () => {
    expect(callingCodeFor('CN')).toBe('+86')
    expect(callingCodeFor('GB')).toBe('+44')
  })

  it('不知道是哪儿就不猜', () => {
    expect(callingCodeFor(undefined)).toBeUndefined()
    expect(callingCodeFor('ZZ')).toBeUndefined()
  })
})
