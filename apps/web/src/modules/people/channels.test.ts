import { describe, expect, it } from 'vitest'
import { byKind, channelHref, channelLabel, channelPlaceholder } from './channels'

/**
 * 三种地址怎么排、怎么写。
 *
 * 一个人在表里是想到一条加一条，于是会出现 email link email phone link 这种顺序 —— 读起来像没
 * 整理过的抽屉。按类型归堆（和 Apple、Google 的联系人一样），手写顺序只在同一类里保留。
 */
describe('byKind', () => {
  const ch = (kind: 'email' | 'phone' | 'url', value: string) => ({ kind, value, label: null })

  it('按 email → phone → link 归堆', () => {
    const mixed = [
      ch('email', 'a@x.test'),
      ch('url', 'x.test/a'),
      ch('email', 'b@x.test'),
      ch('phone', '+86 139 0000 1234'),
      ch('url', 'x.test/b'),
    ]
    expect(byKind(mixed).map((c) => c.kind)).toEqual(['email', 'email', 'phone', 'url', 'url'])
  })

  it('同一类里保留写下的先后', () => {
    const two = [ch('email', '第二个'), ch('email', '第一个')]
    expect(byKind(two).map((c) => c.value)).toEqual(['第二个', '第一个'])
  })
})

describe('channelLabel', () => {
  it('链接写成 host 加路径：整条地址在一行里读不出来', () => {
    expect(channelLabel('url', 'https://sites.google.com/site/a/b?utm=1')).toBe(
      'sites.google.com/site/a/b',
    )
  })

  it('邮箱和电话原样写：那就是人要读的东西', () => {
    expect(channelLabel('email', 'ying@acme.test')).toBe('ying@acme.test')
    expect(channelLabel('phone', '+86 139 0000 1234')).toBe('+86 139 0000 1234')
  })
})

describe('channelPlaceholder', () => {
  it('每一类给出它长什么样，而不是一句「待填」', () => {
    expect(channelPlaceholder('email')).toContain('@')
    expect(channelPlaceholder('phone')).toMatch(/\d/)
    expect(channelPlaceholder('url')).toContain('.')
  })
})

/**
 * An address in a person list is a LINK. Getting the scheme wrong means the person copies the
 * address by hand, which is the whole cost the list existed to remove.
 */
describe('channelHref', () => {
  it('opens an email in the mail client', () => {
    expect(channelHref('email', 'a@b.test')).toBe('mailto:a@b.test')
  })

  it('strips the spacing a person writes a phone number with', () => {
    // A dialler takes digits; "+86 138 0000 0000" is how a human writes it.
    expect(channelHref('phone', '+86 138 0000 0000')).toBe('tel:+8613800000000')
    expect(channelHref('phone', '010-1234-5678')).toBe('tel:01012345678')
  })

  it('gives a bare host a scheme, so it is not read as a relative path', () => {
    // Without this, `github.com/dana` links inside the app and goes nowhere.
    expect(channelHref('url', 'github.com/dana')).toBe('https://github.com/dana')
    expect(channelHref('url', 'https://github.com/dana')).toBe('https://github.com/dana')
    expect(channelHref('url', 'HTTP://example.test')).toBe('HTTP://example.test')
  })

  it('has no opinion about a kind it does not know', () => {
    expect(channelHref('fax', '123')).toBeNull()
  })
})
