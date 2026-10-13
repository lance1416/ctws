import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts', 'src/platform/db/migrate.ts'],
  format: ['esm'],
  outDir: 'dist',
  // Stale chunks from an earlier build would otherwise linger in dist.
  clean: true,
  // Workspace packages ship as TypeScript source that plain Node cannot load, so they are
  // bundled. Matched by pattern, so a new one cannot be missed and crash the container at boot.
  noExternal: [/^@ctws\//],
})
