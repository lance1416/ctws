import {
  idFrom,
  organisationId,
  type CreateOrganisationBody,
  type OrganisationResponse,
  type UpdateOrganisationBody,
} from '@ctws/contracts'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { problemText } from '../../../platform/http/api'
import { DangerZone } from '../../../platform/ui/DangerZone'
import { DeletedNotice } from '../../../shell/detail'
import { useSubjectOf } from '../../../shell/layout'
import { useForgetWhenGone, useRecordRecent } from '../../../shell/search'
import { createOrganisation, organisationKeys, organisationsQuery, patchOrganisation } from '../api'
import { DeleteOrganisation } from '../components/DeleteOrganisation'
import { OrganisationEditor } from '../components/OrganisationEditor'
import { OrganisationPage } from './OrganisationPage'

/** The organisation the address names, or that there is no such organisation. */
function useAddressed(): {
  organisation: OrganisationResponse | undefined
  id: string | undefined
  gone: boolean
} {
  const { id } = useParams()
  const organisations = useQuery(organisationsQuery())
  const organisation = id
    ? organisations.data?.find((o) => o.id === idFrom(organisationId, id))
    : undefined
  return { organisation, id, gone: organisations.isSuccess && !organisation }
}

/** `/organisations/:id`: its page (FR-065), or what happened to it (artboard 23). */
export function Organisation() {
  const { organisation: o, id, gone } = useAddressed()
  useForgetWhenGone('organisation', id ?? null, gone)
  useSubjectOf(o ? { type: 'organisation', id: o.id, title: o.name } : null)
  useRecordRecent(
    o
      ? {
          type: 'organisation',
          id: o.id,
          title: o.name,
          to: `/organisations/${o.id}`,
          kind: 'Organisation',
        }
      : null,
  )
  if (gone && id) return <DeletedNotice type="organisation" id={id} />
  if (!o) return null
  return <OrganisationPage key={o.id} organisation={o} />
}

/** Writes an organisation, then opens its page. */
function useWriteOrganisation(organisation: OrganisationResponse | null) {
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (body: CreateOrganisationBody & UpdateOrganisationBody) =>
      organisation ? patchOrganisation(organisation.id, body) : createOrganisation(body),
    meta: { changes: ['organisation'], awaits: [organisationKeys.all], ownsError: true },
    onSuccess: (saved) => navigate(`/organisations/${saved.id}`),
  })
}

/** `/organisations/new`: one written down, in the main area. */
export function OrganisationNew() {
  const write = useWriteOrganisation(null)
  return (
    <OrganisationEditor
      organisation={null}
      busy={write.isPending}
      error={write.isError ? problemText(write.error) : null}
      cancelTo="/organisations"
      onSubmit={(body) => write.mutate(body)}
    />
  )
}

/** `/organisations/:id/edit`: the same form, filled, and delete at its foot. */
export function OrganisationEdit() {
  const { organisation: o, id, gone } = useAddressed()
  const navigate = useNavigate()
  const write = useWriteOrganisation(o ?? null)
  if (gone && id) return <DeletedNotice type="organisation" id={id} />
  if (!o) return null
  return (
    <OrganisationEditor
      key={o.id}
      organisation={o}
      busy={write.isPending}
      error={write.isError ? problemText(write.error) : null}
      cancelTo={`/organisations/${o.id}`}
      onSubmit={(body) => write.mutate(body)}
    >
      <DangerZone>
        <DeleteOrganisation organisation={o} onDeleted={() => navigate('/organisations')} />
      </DangerZone>
    </OrganisationEditor>
  )
}
