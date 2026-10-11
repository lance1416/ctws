import { describe, expect, it } from 'vitest'
import { contactChannel } from './contact'
/**
 * 三种地址各自是什么样子。
 *
 * 以前 `value` 只要求非空：一个电话字段里可以放 `to fill in`，一个邮箱里可以放一句话。它们是三种
 * 不同的结构化文本，规则写在契约里，服务端和界面才是同一套 —— 而且报错要说清是哪一条不成立。
 */
describe('contactChannel 按 kind 校验', () => {
  const ok = (kind: string, value: string) => contactChannel.safeParse({ kind, value }).success
  const says = (kind: string, value: string) =>
    contactChannel.safeParse({ kind, value }).error?.issues[0]?.message

  it('邮箱要像个邮箱', () => {
    expect(ok('email', 'ying@acme.test')).toBe(true)
    expect(ok('email', 'ying+jobs@acme.co.uk')).toBe(true)
    expect(ok('email', 'to fill in')).toBe(false)
    expect(ok('email', 'ying@acme')).toBe(false)
    expect(ok('email', 'ying at acme.test')).toBe(false)
  })

  /**
   * 电话必须带国家码，这是这张表里唯一一条强制的写法。
   *
   * 不带国家码的一串数字没有唯一的读法：`010-1234-5678` 可能是北京的固话，也可能是别处的别的
   * 东西，排不出分组，`tel:` 也拨不准。存下来的是 E.164，屏幕上的分组由它算出来 —— 所以这条
   * 必须在存之前就成立。
   */
  it('电话要带国家码', () => {
    expect(ok('phone', '+86 139 0000 1234')).toBe(true)
    expect(ok('phone', '+442079460958')).toBe(true)
    expect(ok('phone', '+1 (730) 197-4443')).toBe(true)
    expect(ok('phone', '010-1234-5678')).toBe(false)
    expect(ok('phone', '(020) 7946 0958')).toBe(false)
    expect(ok('phone', 'to fill in')).toBe(false)
  })

  it('缺的是哪一条就说哪一条', () => {
    expect(says('phone', '010-1234-5678')).toBe('start with the country code, like +86')
    expect(says('phone', '+86 139 abc')).toBe(
      'a phone number is digits, spaces, dashes and brackets',
    )
    expect(says('phone', '+123')).toBe('that is too short for a phone number')
    expect(says('phone', '+1234567890123456')).toBe('a phone number has at most 15 digits')
  })

  it('链接要有个像域名的主机，协议可以不写', () => {
    expect(ok('url', 'https://sites.google.com/site/a')).toBe(true)
    expect(ok('url', 'github.com/lance1416')).toBe(true)
    expect(ok('url', 'to fill in')).toBe(false)
    expect(ok('url', 'localhost')).toBe(false)
  })

  it('说清是哪一条不成立', () => {
    const bad = contactChannel.safeParse({ kind: 'phone', value: 'to fill in' })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues[0]?.message).toBe(
      'a phone number is digits, spaces, dashes and brackets',
    )
  })
})
