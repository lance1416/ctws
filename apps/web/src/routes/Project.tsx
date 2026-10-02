import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { listProjects } from '../api/projects'

export function Project() {
  const { id } = useParams()
  // Same query function as every other reader of ['projects']: they share one cache entry, so
  // they must agree on its shape.
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const name = projects.data?.find((p) => p.id === id)?.name

  return <h1 className="text-2xl font-semibold">{name ?? ''}</h1>
}
