import { useQuery } from '@tanstack/react-query'
import { organisationsQuery } from '../api'

/** Every organisation, by name: the list other modules pick organisations from (a message's). */
export const useOrganisations = () => useQuery(organisationsQuery())
