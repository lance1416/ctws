import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts', 'src/db/migrate.ts'],
  format: ['esm'],
  outDir: 'dist',
  // Stale chunks from an earlier build otherwise linger in dist and are dead but confusing:
  // they made a check for leftover unbundled imports report a hit that the current build had
  // not produced.
  clean: true,
  // Workspace packages are shipped as TypeScript source with extensionless imports, which
  // plain Node cannot load at runtime, so bundle them instead of leaving them external.
  // Matched by pattern, not enumerated: an unlisted one used to pass the build and then crash
  // the container at boot with ERR_MODULE_NOT_FOUND (@ctws/contracts in M1, @ctws/core in M2a).
  noExternal: [/^@ctws\//],
})
