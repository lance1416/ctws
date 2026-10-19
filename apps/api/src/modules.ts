import { meetingsModule } from './modules/meetings'
import { organisationsModule } from './modules/organisations'
import { peopleModule } from './modules/people'
import { readingModule } from './modules/reading'
import { tasksModule } from './modules/tasks'
import type { ApiModule, EnvSource, ModuleDefinition } from './shell/module'

/** In object-page order: an object page groups linked things in this order. */
const MODULES = [
  tasksModule,
  meetingsModule,
  peopleModule,
  organisationsModule,
  readingModule,
] as const

type DepsOf<M> = M extends ModuleDefinition<infer Deps> ? Deps : never
type Both<U> = (U extends unknown ? (u: U) => void : never) extends (all: infer I) => void
  ? I
  : never

/** Every module's replaceable parts, any of which a test may pass. */
export type ModuleDeps = Partial<Both<DepsOf<(typeof MODULES)[number]>>>

/** The modules, each built from the environment and whichever of its parts `deps` replaces. */
export function apiModules(env: EnvSource, deps: ModuleDeps = {}): ApiModule[] {
  return MODULES.map((m) => m.build(env, deps))
}
