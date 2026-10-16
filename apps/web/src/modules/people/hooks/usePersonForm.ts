import {
  CIRCLES,
  GENDERS,
  projectId,
  type CreatePersonBody,
  type PersonChannel,
  type PersonResponse,
  type UpdatePersonBody,
} from '@ctws/contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { BirthdayDraft } from '../api'

/**
 * A person's fields as the new-person dialog and the pane's form hold them. The addresses are
 * held by `useChannelRows`, which checks each as it is typed. A birthday left alone is
 * `undefined`; `null` removes it. It needs a name.
 */
export const personForm = z.object({
  name: z.string().refine((n) => n.trim() !== ''),
  org: z.string(),
  title: z.string(),
  hometown: z.string(),
  city: z.string(),
  gender: z.enum(GENDERS).nullable(),
  circle: z.enum(CIRCLES).nullable(),
  projectIds: z.array(projectId),
  note: z.string(),
  birthday: z.custom<BirthdayDraft | null | undefined>(() => true),
})
export type PersonForm = z.infer<typeof personForm>

export const newPerson: PersonForm = {
  name: '',
  org: '',
  title: '',
  hometown: '',
  city: '',
  gender: null,
  circle: null,
  projectIds: [],
  note: '',
  birthday: undefined,
}

/** The form opened on a person. */
export const personValues = (person: PersonResponse): PersonForm => ({
  name: person.name,
  org: person.org ?? '',
  title: person.title ?? '',
  hometown: person.hometown ?? '',
  city: person.city ?? '',
  gender: person.gender,
  circle: person.circle,
  projectIds: person.projects.map((p) => p.id),
  note: person.note ?? '',
  birthday: undefined,
})

/** What Create sends: what is empty is left out. */
export function createBody(v: PersonForm, channels: PersonChannel[]): CreatePersonBody {
  const text = (key: 'org' | 'title' | 'hometown' | 'city' | 'note') =>
    v[key].trim() ? { [key]: v[key].trim() } : {}
  return {
    name: v.name.trim(),
    ...text('org'),
    ...text('title'),
    ...text('hometown'),
    ...text('city'),
    ...text('note'),
    ...(v.projectIds.length > 0 ? { projectIds: v.projectIds } : {}),
    ...(channels.length > 0 ? { channels } : {}),
    ...(v.gender ? { gender: v.gender } : {}),
    ...(v.circle ? { circle: v.circle } : {}),
    ...(v.birthday ? { birthday: v.birthday } : {}),
  }
}

/** What Save sends: every field, cleared ones as null, and the birthday only when touched. */
export function personPatch(v: PersonForm, channels: PersonChannel[]): UpdatePersonBody {
  return {
    name: v.name.trim(),
    org: v.org.trim() || null,
    title: v.title.trim() || null,
    hometown: v.hometown.trim() || null,
    city: v.city.trim() || null,
    gender: v.gender,
    circle: v.circle,
    projectIds: v.projectIds,
    channels,
    note: v.note.trim() || null,
    ...(v.birthday === undefined ? {} : { birthday: v.birthday }),
  }
}

/** The form both the dialog and the pane draw. */
export function usePersonForm(opened: PersonForm) {
  const form = useForm<PersonForm>({
    resolver: zodResolver(personForm),
    defaultValues: opened,
    // Save is disabled until it can be sent; nothing is said, so focus stays where it is.
    shouldFocusError: false,
  })
  const values = form.watch()
  return { form, values, named: personForm.safeParse(values).success }
}
