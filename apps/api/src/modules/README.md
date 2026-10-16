# API modules

A module is one kind of thing: its tables, its endpoints and what it tells the shell. `reading` is
the model; a module has these files, and only the ones it needs:

- `index.ts`: the module for the composition root (`modules.ts`), nothing else. `fixedModule(...)`
  when it has no settings; a `ModuleDefinition` when it reads its own settings from the
  environment or has a part a test replaces (reading's unfurl). Also the few names another module
  may import.
- `routes.ts`: its operations from the contracts' endpoint table: who acts, then the service or a
  query, then the mapper.
- `service.ts`: writes, each one transaction. `queries.ts`: reads. `mapper.ts`: rows to responses.
- `tables.ts`: its tables, pointing at the shell through `workspaceKeys` and `projectKeys`.
- `linkable.ts`: how the shell names its things on an object page. `errors.ts`: its refusals.
- `config.ts`: its settings, read from the environment by the module itself.
- One file or folder per topic of its own (`reading/unfurl/`, `meetings/occurrences.ts`).
- `*.test.ts` beside the source for what runs without a database; the rest is in `apps/api/tests`.

It reaches a shell area only through the area's `index.ts`, and another module only through that
module's `index.ts`, along an edge listed in `eslint.config.js`.

One exception: tasks reads through a `queries/` folder, one file per view behind
`queries/index.ts`. It has eleven views, most of them a page of raw SQL; one file would run to 650
lines.
