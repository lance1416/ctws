import { afterEach, describe, expect, it } from 'vitest'
import { setupWith, type Harness } from '../helpers/harness'

/**
 * Cities come from a table built into the image, not an outside service: sending every typed
 * letter to a third party is a different thing from fetching a pasted link. City-level checks
 * need no key, no quota and no network.
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
  it('suggests cities after a few letters, most populous first', async () => {
    const ctx = await setupWith(cleanups)
    const hits = await find(ctx, 'oxf')
    expect(hits[0]?.label).toBe('Oxford, England, United Kingdom')
    // Namesakes are there too, but later: the likeliest one comes first.
    expect(hits.some((c) => c.label === 'Oxford, Mississippi, United States')).toBe(true)
  })

  it('labels a city by city, region and country, saying a repeated part once', async () => {
    const ctx = await setupWith(cleanups)
    expect((await find(ctx, 'beijing'))[0]?.label).toBe('Beijing, China')
    expect((await find(ctx, 'shanghai'))[0]?.label).toBe('Shanghai, China')
  })

  it('finds nothing for a misspelling', async () => {
    const ctx = await setupWith(cleanups)
    expect(await find(ctx, 'oxforrd')).toEqual([])
  })

  it('puts names starting with the query before names containing it', async () => {
    const ctx = await setupWith(cleanups)
    // New York City outnumbers York, but someone typing york wants York first.
    const hits = await find(ctx, 'york')
    expect(hits[0]?.name).toBe('York')
    expect(hits.some((c) => c.name === 'New York City')).toBe(true)
  })

  it('ignores accents: zurich finds Zürich', async () => {
    const ctx = await setupWith(cleanups)
    expect((await find(ctx, 'zurich'))[0]?.name).toBe('Zürich')
  })

  it('returns at most eight', async () => {
    const ctx = await setupWith(cleanups)
    expect((await find(ctx, 'san')).length).toBeLessThanOrEqual(8)
  })

  it('waits for three letters', async () => {
    const ctx = await setupWith(cleanups)
    expect(await find(ctx, 'o')).toEqual([])
  })

  it('requires a session', async () => {
    const ctx = await setupWith(cleanups)
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/cities?q=oxford' })
    expect(res.statusCode).toBe(401)
  })
})
