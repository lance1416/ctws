import type { SearchHit } from '../contract'

export type ProviderResult = {
  moduleId: string
  moduleLabel: string
  hits: SearchHit[]
  isError: boolean
  isSuccess: boolean
}

type FederatedHit = SearchHit & { moduleId: string; moduleLabel: string }

export type Federated = {
  /** Every module's hits in one flat list, in provider order; the keyboard walks this list. */
  rows: FederatedHit[]
  /** Any provider failed; the dialog does not pretend the list is complete. */
  isError: boolean
  /** Every provider answered. A half-answered search must not say "Nothing matches". */
  isSuccess: boolean
}

/** Merges the search providers' answers. Pure, so a second provider can be tested without one. */
export function federate(parts: ProviderResult[]): Federated {
  return {
    rows: parts.flatMap((p) =>
      p.hits.map((hit) => ({ ...hit, moduleId: p.moduleId, moduleLabel: p.moduleLabel })),
    ),
    isError: parts.some((p) => p.isError),
    isSuccess: parts.length > 0 && parts.every((p) => p.isSuccess),
  }
}
