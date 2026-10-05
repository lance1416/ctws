import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { listProjects } from '../api/projects'
import { MODULES } from '../modules/registry'

/**
 * A project page: the shell's heading, and under it whatever each module hangs on this project.
 *
 * Projects are the SHELL's organising dimension (module-boundary contract §3) -- the user's life
 * runs in lines of work (CTWS / job hunt / open source) and a note about CTWS belongs to CTWS as
 * plainly as a task does. So the page itself is the shell's, and the tasks on it are the task
 * module's contribution. §3 also flags this as the ruling most likely to be overturned by the
 * notes module (a knowledge base is often not organised by project at all), which is why the
 * modules are composed here rather than entangled: unpicking it means deleting a `.map`.
 */
export function Project() {
  const { id } = useParams()
  // Same query function as every other reader of ['projects']: they share one cache entry, so
  // they must agree on its shape.
  const projects = useQuery({ queryKey: ['projects'], queryFn: listProjects })
  const name = projects.data?.find((p) => p.id === id)?.name

  return (
    <>
      <h1 className="text-2xl font-semibold">{name ?? ''}</h1>
      {id &&
        MODULES.map(
          ({ id: moduleId, ProjectView }) =>
            ProjectView && <ProjectView key={moduleId} projectId={id} />,
        )}
    </>
  )
}
