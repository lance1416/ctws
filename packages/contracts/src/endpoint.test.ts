import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { patchOf } from './common'
import { type Endpoint, href } from './endpoint'
import { api } from './endpoints'

const every = Object.values(api).flatMap((group) => Object.values(group) as Endpoint[])

describe('patchOf', () => {
  const body = patchOf({ name: z.string(), note: z.string().nullable() })

  it('takes any of the fields, and null for one that may be cleared', () => {
    expect(body.safeParse({ name: 'x' }).success).toBe(true)
    expect(body.safeParse({ note: null }).success).toBe(true)
    expect(body.safeParse({ name: null }).success).toBe(false)
  })

  it('refuses an empty body and a field it does not know', () => {
    expect(body.safeParse({}).success).toBe(false)
    expect(body.safeParse({ name: 'x', other: 1 }).success).toBe(false)
  })

  it('makes every PATCH in the table refuse an empty body', () => {
    const patches = every.filter((e) => e.method === 'PATCH')
    expect(patches.length).toBeGreaterThan(0)
    for (const e of patches) expect(e.body!.safeParse({}).success, e.path).toBe(false)
  })
})

describe('href', () => {
  it('fills path params, encoded, and leaves out query values that are not there', () => {
    expect(
      href({ path: '/a/:id/b/:other' }, { id: 'x y', other: 2 }, { q: 'é&', n: undefined }),
    ).toBe('/a/x%20y/b/2?q=%C3%A9%26')
  })

  it('leaves a colon in a path segment as it is, so an occurrence reads as its local time', () => {
    expect(href({ path: '/m/:at' }, { at: '2026-10-20T09:00/x' })).toBe('/m/2026-10-20T09:00%2Fx')
  })

  it('shares a method and path only between views that a query tells apart', () => {
    const byRoute = new Map<string, Endpoint[]>()
    for (const e of every) {
      const route = `${e.method} ${e.path}`
      byRoute.set(route, [...(byRoute.get(route) ?? []), e])
    }
    for (const [route, views] of byRoute) {
      if (views.length === 1) continue
      for (const v of views) expect(v.query, route).toBeDefined()
      expect(new Set(views.map((v) => v.ok)).size, route).toBe(1)
    }
  })
})
