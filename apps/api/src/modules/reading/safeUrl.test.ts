import { describe, expect, it } from 'vitest'
import { checkLinkUrl, isPublicAddress, literalAddress } from './safeUrl'

/**
 * 出站抓取那道门。
 *
 * 抓的地址是别人粘进来的任意字符串，所以这不是一个「尽量」的检查：一条指向 169.254.169.254 的
 * 链接会让 API 替人去读云元数据，一条指向 10.x 的链接会让它替人探内网。判断在这里写成纯函数，
 * 是因为它是这块里唯一一处写错就出事的地方，而纯函数可以把每一段都钉死。
 */

describe('isPublicAddress', () => {
  it('挡掉本机、私网、链路本地与云元数据', () => {
    for (const ip of [
      '127.0.0.1',
      '127.9.9.9',
      '0.0.0.0',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '198.18.0.1',
      '224.0.0.1',
      '255.255.255.255',
    ]) {
      expect(isPublicAddress(ip, 4), ip).toBe(false)
    }
  })

  it('放行真正在外面的地址', () => {
    for (const ip of ['1.1.1.1', '8.8.8.8', '140.82.121.4', '172.32.0.1', '192.167.1.1']) {
      expect(isPublicAddress(ip, 4), ip).toBe(true)
    }
  })

  it('IPv6 也要挡：回环、ULA、链路本地，以及把 v4 包起来的那几种写法', () => {
    for (const ip of [
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      'ff02::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '64:ff9b::7f00:1',
      '2002:7f00:0001::1',
    ]) {
      expect(isPublicAddress(ip, 6), ip).toBe(false)
    }
    expect(isPublicAddress('2606:4700:4700::1111', 6)).toBe(true)
  })
})

describe('checkLinkUrl', () => {
  it('只认 http(s)', () => {
    expect(checkLinkUrl('file:///etc/passwd')).toBeNull()
    expect(checkLinkUrl('gopher://a.test/1')).toBeNull()
    expect(checkLinkUrl('javascript:alert(1)')).toBeNull()
    expect(checkLinkUrl('不是地址')).toBeNull()
  })

  it('端口不管：真有网页住在 8443 上，而内网是地址的事', () => {
    expect(checkLinkUrl('https://a.test:8443/x')?.port).toBe('8443')
  })

  it('不认带用户名密码的地址', () => {
    expect(checkLinkUrl('http://user:pw@a.test/')).toBeNull()
  })

  it('正常的地址过得去', () => {
    expect(checkLinkUrl('https://github.com/lance1416/ctws')?.host).toBe('github.com')
  })
})

/**
 * 地址写成数字时根本不经过 DNS —— Node 直接就连上去了，那道 lookup 的门一次都不会被调用。
 * 所以这种主机名要在别处当场问，这个函数就是把它认出来。
 */
describe('literalAddress', () => {
  it('认出数字地址，包括方括号里的 IPv6', () => {
    expect(literalAddress('169.254.169.254')).toEqual({ ip: '169.254.169.254', family: 4 })
    expect(literalAddress('[::1]')).toEqual({ ip: '::1', family: 6 })
  })

  it('域名不是地址', () => {
    expect(literalAddress('github.com')).toBeNull()
    expect(literalAddress('1.1.1.1.example.com')).toBeNull()
  })
})
