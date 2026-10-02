import type { ProjectResponse } from '@ctws/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { apiFetch } from '../api'

export function Projects() {
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<{ projects: ProjectResponse[] }>('/projects'),
  })

  return (
    <>
      <h1 className="text-2xl font-semibold">项目</h1>
      {projects.isError && (
        <p role="alert" className="mt-4 text-danger">
          项目加载失败
        </p>
      )}
      <ul className="mt-4 flex flex-col gap-1">
        {projects.data?.projects.map((p) => (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`} className="text-accent">
              {p.name}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
