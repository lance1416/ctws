import type { ProjectResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../api'

export function Project() {
  const { id } = useParams()
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: ProjectResponse[] }>('/projects'),
  })
  const name = projects.data?.projects.find((p) => p.id === id)?.name

  return <h1 className="text-2xl font-semibold">{name ?? ''}</h1>
}
