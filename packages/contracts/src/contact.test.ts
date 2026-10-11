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

  it('邮箱要像个邮箱', () => {
    expect(ok('email', 'ying@acme.test')).toBe(true)
    expect(ok('email', 'ying+jobs@acme.co.uk')).toBe(true)
    expect(ok('email', 'to fill in')).toBe(false)
    expect(ok('email', 'ying@acme')).toBe(false)
    expect(ok('email', 'ying at acme.test')).toBe(false)
  })

  it('电话是数字、空格、横杠、括号，可以带一个加号', () => {
    expect(ok('phone', '+86 139 0000 1234')).toBe(true)
    expect(ok('phone', '010-1234-5678')).toBe(true)
    expect(ok('phone', '(020) 7946 0958')).toBe(true)
    expect(ok('phone', 'to fill in')).toBe(false)
    expect(ok('phone', '123')).toBe(false)
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
