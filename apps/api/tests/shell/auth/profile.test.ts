import { afterEach, describe, expect, it } from 'vitest'
import { appWithUser, secondUser, type Harness } from '../../helpers/harness'

/**
 * Who the account says it is: a name in a person's three parts, shown the way a person's is, and
 * a handle unique in the instance whatever its case. And the theme, kept with the account.
 */

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const stop of cleanups.splice(0)) await stop()
})

async function setup(): Promise<Harness> {
  const ctx = await appWithUser('me@example.com')
  cleanups.push(ctx.stop)
  return ctx
}

const patch = (ctx: Harness, payload: object, headers = ctx.authed) =>
  ctx.app.inject({ method: 'PATCH', url: '/api/v1/auth/me', headers, payload })

const me = async (ctx: Harness) =>
  (await ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: ctx.authed })).json()

describe('the account name', () => {
  it('starts with none, and no handle, photo or theme', async () => {
    const ctx = await setup()
    expect(await me(ctx)).toMatchObject({
      name: null,
      givenName: null,
      middleName: null,
      familyName: null,
      username: null,
      avatarId: null,
      theme: null,
    })
  })

  it('is shown from its parts the way a person is: Latin in order, Chinese family first', async () => {
    const ctx = await setup()
    expect((await patch(ctx, { givenName: 'Lance', familyName: 'Reub' })).json()).toMatchObject({
      name: 'Lance Reub',
      givenName: 'Lance',
      familyName: 'Reub',
    })
    expect((await patch(ctx, { givenName: '雯', familyName: '李' })).json()).toMatchObject({
      name: '李雯',
    })
  })

  it('takes any one part alone, and clears a part with null', async () => {
    const ctx = await setup()
    await patch(ctx, { givenName: 'Lance', middleName: 'J', familyName: 'Reub' })
    expect((await patch(ctx, { givenName: null, middleName: null })).json()).toMatchObject({
      name: 'Reub',
      givenName: null,
      middleName: null,
      familyName: 'Reub',
    })
  })

  it('refuses to empty all three parts', async () => {
    const ctx = await setup()
    await patch(ctx, { givenName: 'Lance' })
    const res = await patch(ctx, { givenName: null, middleName: null, familyName: null })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({ type: 'urn:ctws:problem:name-required' })
    expect(await me(ctx)).toMatchObject({ name: 'Lance' })
  })
})

describe('the username', () => {
  it('is lowered as given', async () => {
    const ctx = await setup()
    expect((await patch(ctx, { username: 'Lance' })).json()).toMatchObject({ username: 'lance' })
  })

  it.each(['-lance', 'lance-', 'la', 'a'.repeat(33), 'lan ce', 'lance_r', 'lancé'])(
    'refuses %j by the rule it breaks',
    async (username) => {
      const ctx = await setup()
      const res = await patch(ctx, { username })
      expect(res.statusCode).toBe(400)
      expect(res.body).toContain('Use 3 to 32 characters: lowercase letters, numbers and hyphens.')
    },
  )

  it('takes 3 and 32 characters, and inner hyphens', async () => {
    const ctx = await setup()
    for (const username of ['abc', 'a'.repeat(32), 'lance-r-1']) {
      expect((await patch(ctx, { username })).statusCode).toBe(200)
    }
  })

  it('is one per instance, whatever the case, and the holder may set it again', async () => {
    const ctx = await setup()
    const other = await secondUser(ctx)
    expect((await patch(ctx, { username: 'lance' })).statusCode).toBe(200)
    const res = await patch(ctx, { username: 'LANCE' }, other.authed)
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      type: 'urn:ctws:problem:username-taken',
      title: 'That username is taken.',
    })
    expect((await patch(ctx, { username: 'Lance' })).statusCode).toBe(200)
  })

  it('is freed when cleared', async () => {
    const ctx = await setup()
    const other = await secondUser(ctx)
    await patch(ctx, { username: 'lance' })
    await patch(ctx, { username: null })
    expect((await patch(ctx, { username: 'lance' }, other.authed)).statusCode).toBe(200)
  })
})

describe('the theme', () => {
  it('is kept with the account once chosen, system included', async () => {
    const ctx = await setup()
    expect((await patch(ctx, { theme: 'dark' })).json()).toMatchObject({ theme: 'dark' })
    expect((await patch(ctx, { theme: 'system' })).json()).toMatchObject({ theme: 'system' })
    expect(await me(ctx)).toMatchObject({ theme: 'system' })
  })

  it('cannot be set back to unchosen, or to anything else', async () => {
    const ctx = await setup()
    expect((await patch(ctx, { theme: null })).statusCode).toBe(400)
    expect((await patch(ctx, { theme: 'sepia' })).statusCode).toBe(400)
  })
})

describe('photos', () => {
  it('are off on a server with no storage', async () => {
    const ctx = await setup()
    expect(await me(ctx)).toMatchObject({ photos: false })
  })
})
