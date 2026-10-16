# Web modules

A module is a manifest the shell reads (`WorkspaceModule` in `shell/contract.ts`) and the code
behind it. `reading` is the model:

- `index.tsx`: the manifest and nothing else, plus the few names another module may import.
- `api.ts`: every request the module makes and its query options. No React.
- `pages/`: what its routes render.
- `components/`: everything else that renders, and a hook that only one component uses. What the
  manifest hands the shell is here too: `<Kind>Kind.tsx` for the count and line in Things, and
  the Workbench card.
- `hooks/`: hooks more than one component uses. `hooks/contributions` holds the ones the
  manifest hands the shell's capture, search and calendar.
- `logic/`: pure functions and constants, no React and no requests. `logic/id.ts` names the
  module's namespace.
- A folder for a part with a vocabulary of its own: `tasks/logic/tree/`, `people/birthday/`.
- `*.test.ts(x)` beside what it tests.

It reaches a shell area only through the area's `index.ts`, and another module only through that
module's `index.tsx`, along an edge listed in `eslint.config.js`.
