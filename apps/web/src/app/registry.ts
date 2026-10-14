import { buildRegistry } from '../shell/registry'
import { SHELL_CONFIG } from './config'
import { MODULES } from './modules'

export const registry = buildRegistry(MODULES, SHELL_CONFIG)
