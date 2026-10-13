import { afterEach, describe, expect, it } from 'vitest'
import { setupWith, type Harness } from '../helpers/harness'

/**
 * 城市：一张打进镜像的表，不是一个外部服务。
 *
 * 这个 API 到目前为止只对「粘进来的链接」发过出站请求，而「你在输入框里打的每一个字母发给第三
 * 方」是另一种东西。城市级的校验（Oxford 认得、Oxforrd 不认、北京认得）三万四千行数据就够了，
 * 于是不要密钥、不要限额、离线可用，测试也不看网络脸色。
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

type City = { label: string; name: string; region: string | null; country: string }

async function find(ctx: Harness, q: string): Promise<City[]> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/v1/cities?q=${encodeURIComponent(q)}`,
    headers: ctx.authed,
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { cities: City[] }).cities
}

describe('GET /cities', () => {
  it('打几个字母就给出候选，人口多的排前面', async () => {
    const ctx = await setupWith(cleanups)
    const hits = await find(ctx, 'oxf')
    expect(hits[0]?.label).toBe('Oxford, England, United Kingdom')
    // 同名的那几个也在，但排在后面 —— 先给的该是最可能被说起的那一个。
    expect(hits.some((c) => c.label === 'Oxford, Mississippi, United States')).toBe(true)
  })

  it('一个标准写法：城市、一级行政区、国家，重复的那一节不写两遍', async () => {
    const ctx = await setupWith(cleanups)
    expect((await find(ctx, 'beijing'))[0]?.label).toBe('Beijing, China')
    expect((await find(ctx, 'shanghai'))[0]?.label).toBe('Shanghai, China')
  })

  it('不认得的就是不认得：打错一个字母不该蒙混过去', async () => {
    const ctx = await setupWith(cleanups)
    expect(await find(ctx, 'oxforrd')).toEqual([])
  })

  it('以它开头的排在含有它的前面', async () => {
    const ctx = await setupWith(cleanups)
    // New York City 的人口远多于 York，但打 york 的人先要看到的是 York —— 开头优先于包含。
    const hits = await find(ctx, 'york')
    expect(hits[0]?.name).toBe('York')
    expect(hits.some((c) => c.name === 'New York City')).toBe(true)
  })

  it('变音符号不挡路：zurich 找得到 Zürich', async () => {
    const ctx = await setupWith(cleanups)
    expect((await find(ctx, 'zurich'))[0]?.name).toBe('Zürich')
  })

  it('一次最多给八个，省得下拉框变成一本名录', async () => {
    const ctx = await setupWith(cleanups)
    expect((await find(ctx, 'san')).length).toBeLessThanOrEqual(8)
  })

  it('一两个字母不查：那不是在找城市，那是刚开始打字', async () => {
    const ctx = await setupWith(cleanups)
    expect(await find(ctx, 'o')).toEqual([])
  })

  it('没登录就没有', async () => {
    const ctx = await setupWith(cleanups)
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/cities?q=oxford' })
    expect(res.statusCode).toBe(401)
  })
})
