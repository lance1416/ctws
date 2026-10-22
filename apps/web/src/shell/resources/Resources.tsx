import { resourceLook } from '@ctws/core'
import { useQuery } from '@tanstack/react-query'
import { addResource, followable, resourcesQuery, type ResourceOwner } from './api'
import { ResourceAdd } from './ResourceAdd'
import { ResourceIcon } from './ResourceIcon'

/**
 * A THING'S RESOURCES (FR-046, FR-056): each address with its service, its name and where it is
 * from ("Google Doc", "martinfowler.com"), and a "+" to hang another.
 */
export function Resources({ owner }: { owner: ResourceOwner }) {
  const all = useQuery(resourcesQuery(owner))
  const rows = all.data ?? []
  return (
    <section aria-labelledby="resources-head" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 id="resources-head" className="text-ui font-medium text-ink">
          Resources
        </h3>
        <ResourceAdd
          owner={owner}
          verb="Add"
          label="Add a resource"
          write={(resource) => addResource(owner, resource)}
        />
      </div>
      {all.isError && (
        <p role="alert" className="text-ui text-stop-t">
          Couldn’t load the resources.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const look = resourceLook(r.url)
            // Where it is from: the service's own word for a document, the host for a page;
            // GitHub, and anything left unnamed, by where it lives.
            const from =
              r.name === null || look.service.startsWith('github') ? look.source : look.label
            return (
              <li key={r.id}>
                <a
                  href={followable(r.url)}
                  target="_blank"
                  rel="noreferrer noopener"
                  data-resource={r.id}
                  className="flex h-8 min-w-0 items-center gap-2 rounded-control border border-line px-2.5 text-ui text-ink hover:border-line-strong"
                >
                  <ResourceIcon url={r.url} />
                  <span className="min-w-0 flex-1 truncate">{r.name ?? look.label}</span>
                  <span className="shrink-0 text-meta text-muted">{from}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
