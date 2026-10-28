import { topPage } from '../../shell/layout'
import type { WorkspaceModule } from '../../shell/contract'
import { organisationKeys } from './api'
import {
  OrganisationFact,
  OrganisationListMark,
  OrganisationsCount,
} from './components/OrganisationFacts'
import { OrganisationsSidebar } from './components/OrganisationsSidebar'
import { describeOrganisationChange } from './logic/describeChange'
import { ORGANISATIONS_ID } from './logic/id'
import { Organisation, OrganisationEdit, OrganisationNew } from './pages/Organisation'
import { OrganisationsOverview } from './pages/OrganisationsOverview'

// For other modules: a message names organisations among those it was with.
export { OrganisationMark } from './components/OrganisationMark'
export { useOrganisations } from './hooks/useOrganisations'

const PAGE = topPage('Organisations')

/**
 * Organisations (FR-064, FR-065): the overview, each one's page, and the form that writes one
 * down. Who works where is the people module's; this one reads it from the server's answer.
 */
export const organisationModule: WorkspaceModule = {
  id: ORGANISATIONS_ID,
  label: 'Organisations',
  kind: {
    label: 'Organisations',
    to: `/${ORGANISATIONS_ID}`,
    Count: OrganisationsCount,
    List: OrganisationsSidebar,
    chord: 'organisations',
    order: 25,
  },
  routes: [
    { index: true, element: <OrganisationsOverview />, handle: PAGE },
    // Before `:id`, which would take `new` for an id.
    { path: 'new', element: <OrganisationNew />, handle: PAGE },
    { path: ':id', element: <Organisation />, handle: PAGE },
    { path: ':id/edit', element: <OrganisationEdit />, handle: PAGE },
  ],
  creates: [
    { kind: 'organisation', key: 'o', label: 'Organisation', to: `/${ORGANISATIONS_ID}/new` },
  ],
  chords: [
    {
      id: 'organisations',
      key: 'o',
      label: 'Organisations',
      resolve: () => `/${ORGANISATIONS_ID}`,
      order: 35,
    },
  ],
  relations: [
    {
      type: 'organisation',
      kind: 'Organisation',
      plural: 'Organisations',
      to: (id) => `/${ORGANISATIONS_ID}/${id}`,
      Mark: OrganisationListMark,
      Fact: OrganisationFact,
      describeChange: describeOrganisationChange,
    },
  ],
  // Who works there, what was said with it, and where it stands in projects.
  reads: [
    {
      queryKey: organisationKeys.all,
      of: ['organisation', 'person', 'communication', 'task', 'project'],
    },
  ],
}
