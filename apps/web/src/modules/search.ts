import type { SearchHit } from './contract'

export type ProviderResult = {
  moduleId: string
  moduleLabel: string
  hits: SearchHit[]
  isError: boolean
  isSuccess: boolean
}

export type FederatedHit = SearchHit & { moduleId: string; moduleLabel: string }

export type Federated = {
  /** Every module's hits in one flat list, in provider order; the keyboard walks this list. */
  rows: FederatedHit[]
  /** Any provider failed. One failure is reported; the dialog does not pretend it is complete. */
  isError: boolean
  /** Every provider answered. A half-answered search must not say "没有匹配的任务". */
  isSuccess: boolean
  /**
   * Whether a row has to name the module it came from. With one provider the name would be noise
   * (and a pixel the redesign did not ask for); with two it is the only thing telling the rows
   * apart -- as TEXT, never as a colour (WCAG 1.4.1).
   */
  showModule: boolean
}

/**
 * Merges the search providers' answers. Pure, so the federation can be tested without a browser:
 * the shape has to admit a second provider, and that is exactly what cannot be proven by looking
 * at a one-module app on screen.
 */
export function federate(parts: ProviderResult[]): Federated {
  return {
    rows: parts.flatMap((p) =>
      p.hits.map((hit) => ({ ...hit, moduleId: p.moduleId, moduleLabel: p.moduleLabel })),
    ),
    isError: parts.some((p) => p.isError),
    isSuccess: parts.length > 0 && parts.every((p) => p.isSuccess),
    showModule: parts.length > 1,
  }
}
