import { describe, expect, it } from 'vitest'
import { createBody, newPerson, personForm, personPatch } from './usePersonForm'

describe('the person form', () => {
  it('needs a name', () => {
    expect(personForm.safeParse(newPerson).success).toBe(false)
    expect(personForm.safeParse({ ...newPerson, name: ' ' }).success).toBe(false)
    expect(personForm.safeParse({ ...newPerson, name: 'Ada' }).success).toBe(true)
  })

  it('creates with what is empty left out', () => {
    expect(
      createBody({ ...newPerson, name: ' Ada ', org: ' ', note: ' Met at a talk ' }, []),
    ).toEqual({ name: 'Ada', note: 'Met at a talk' })
  })

  it('saves every field, clearing empty ones, and the birthday only when touched', () => {
    const patch = personPatch({ ...newPerson, name: 'Ada', city: ' ' }, [])
    expect(patch).toEqual({
      name: 'Ada',
      org: null,
      title: null,
      hometown: null,
      city: null,
      gender: null,
      circle: null,
      projectIds: [],
      channels: [],
      note: null,
    })
    expect(personPatch({ ...newPerson, name: 'Ada', birthday: null }, [])).toHaveProperty(
      'birthday',
      null,
    )
  })
})
