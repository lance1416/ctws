import boundaries from 'eslint-plugin-boundaries'
import reactHooks from 'eslint-plugin-react-hooks'
import { builtinRules } from 'eslint/use-at-your-own-risk'
import tseslint from 'typescript-eslint'

/**
 * The conventions this repo keeps, enforced instead of described. A rule that the code does not
 * satisfy yet is a `warn`, and turns into an `error` in the phase that fixes its last violation.
 */

const restrictedSyntax = builtinRules.get('no-restricted-syntax')
const restrictedImports = builtinRules.get('no-restricted-imports')

/**
 * `no-restricted-syntax` carries one severity per file, so each convention gets a copy of it
 * under its own name: one can warn while another errors, and a report names the convention.
 */
const ctws = {
  rules: {
    clock: restrictedSyntax,
    'enum-cast': restrictedSyntax,
    'class-names': restrictedSyntax,
    'button-text': restrictedSyntax,
    'shell-entry': restrictedImports,
  },
}

/** Patterns are from the repo root, whichever package eslint runs in. */
const ROOT = import.meta.dirname

const PRODUCTION = ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}']
const TESTS = ['**/*.test.{ts,tsx}']

/**
 * Layers by folder: each pattern names a folder, and a file belongs to the first element whose
 * folder holds it. `root` is the composition around the layers: the web app's `app/`, the entry
 * files, styles and fonts.
 */
const elements = (app) =>
  [
    { type: 'platform', pattern: `apps/${app}/src/platform` },
    { type: 'shell', pattern: `apps/${app}/src/shell` },
    { type: 'module', pattern: `apps/${app}/src/modules/*`, capture: ['name'] },
    { type: 'root', pattern: `apps/${app}/src` },
  ].map((e) => ({ ...e, type: `${app}-${e.type}`, partialMatch: false }))

/**
 * A module reaches another module only along an edge listed here, and only through its index.
 * The list is acyclic, so no two modules depend on each other, even through others.
 */
const MODULE_EDGES = [['meetings', 'people']]

const element = (type, more = {}) => ({ element: { type, ...more } })

/** Downwards only: modules, then shell, then platform. Imports inside one element are free. */
const layers = (app) => {
  const [root, platform, shell, module] = ['root', 'platform', 'shell', 'module'].map(
    (t) => `${app}-${t}`,
  )
  return [
    { from: element(root), allow: { to: element('*') } },
    { from: element(platform), allow: { to: element(platform) } },
    { from: element(shell), allow: { to: element(`{${shell},${platform}}`) } },
    { from: element(module), allow: { to: element(`{${shell},${platform}}`) } },
    ...MODULE_EDGES.map(([from, to]) => ({
      from: element(module, { captured: { name: from } }),
      allow: {
        to: element(module, { captured: { name: to }, fileInternalPath: 'index.{ts,tsx}' }),
      },
    })),
  ]
}

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'apps/api/drizzle/**',
      'apps/web/test-results/**',
      'apps/web/playwright-report/**',
      'tools/palette/validate_palette.js',
      'scratchpad/**',
      'docs/**',
      '.superpowers/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: { parser: tseslint.parser },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },

  // ---- React ----
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // ---- Layers ----
  {
    files: ['apps/*/src/**/*.{ts,tsx}'],
    ignores: TESTS,
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [...elements('web'), ...elements('api')],
      'boundaries/root-path': ROOT,
      'boundaries/include': ['apps/*/src/**/*'],
      'boundaries/dependency-nodes': ['import', 'export', 'dynamic-import'],
      'import/resolver': {
        typescript: {
          project: [`${ROOT}/apps/web`, `${ROOT}/apps/api`],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          policies: [...layers('web'), ...layers('api')],
          message:
            '{{from.element.type}} may not import {{to.element.type}} ({{dependency.source}}).',
        },
      ],
    },
  },
  {
    // Outside the shell, an area is reached through its public entry, not a file inside it.
    files: [
      'apps/*/src/modules/**/*.{ts,tsx}',
      'apps/api/src/*.ts',
      'apps/web/src/app/**/*.{ts,tsx}',
      'apps/web/src/main.tsx',
    ],
    plugins: { ctws },
    rules: {
      'ctws/shell-entry': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)shell/[^/]+/.',
              message: 'Import the shell area through its index, not a file inside it.',
            },
          ],
        },
      ],
    },
  },

  // ---- One source of "now" ----
  {
    files: PRODUCTION,
    ignores: [...TESTS, 'apps/api/src/app.ts', 'apps/web/src/platform/time/useNow.ts'],
    plugins: { ctws },
    rules: {
      'ctws/clock': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Read the time from the clock: app.clock in the api, useNow() in the web.',
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Read the time from the clock: app.clock in the api, useNow() in the web.',
        },
      ],
    },
  },

  // ---- Values come from their schema, not from a cast ----
  {
    files: PRODUCTION,
    ignores: TESTS,
    plugins: { ctws },
    rules: {
      'ctws/enum-cast': [
        'error',
        {
          selector:
            'TSAsExpression > TSLiteralType.typeAnnotation, TSAsExpression > TSUnionType.typeAnnotation > TSLiteralType',
          message: 'A cast to a literal type skips the check; parse with the schema instead.',
        },
        {
          selector:
            "TSAsExpression[expression.type='Literal']:not([typeAnnotation.typeName.name='const'])",
          message: 'A literal cast to a type skips the check; annotate or parse instead.',
        },
      ],
    },
  },

  // ---- Class names (Tailwind) ----
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: TESTS,
    plugins: { ctws },
    rules: {
      'ctws/class-names': ['error', ...classNameRules()],
    },
  },
  {
    // A filled button's text is `on-ink` or `on-danger`, and only BUTTON may say so.
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: [...TESTS, 'apps/web/src/platform/ui/buttonStyles.ts'],
    plugins: { ctws },
    rules: {
      'ctws/button-text': [
        'error',
        ...textRule(`/${cls('text-on-(ink|danger)')}/`, 'A filled button comes from BUTTON.'),
      ],
    },
  },
)

/** A selector on string literals and template chunks, which is where a class list lives. */
function textRule(pattern, message) {
  return [
    { selector: `Literal[value=${pattern}]`, message },
    { selector: `TemplateElement[value.raw=${pattern}]`, message },
  ]
}

/** A class name, not part of a longer one (`rounded` is not `rounded-md`; `hover:` is fine). */
function cls(name) {
  return `(?<![\\w-])${name}(?![\\w-])`
}

/** Class vocabulary the design system owns. */
function classNameRules() {
  const any = '[\\s\\S]*'
  return [
    // RADIUS BY ROLE: 0 for structure, 6px (`rounded-md`) for controls, 10px for what floats,
    // round for markers. A row with a corner reads as a button. Two small exceptions keep their
    // own: a key chip's 4px `rounded` (with its `border` and `text-xs`), and a note's checkbox
    // glyph (`rounded-sm align-text-top`).
    ...textRule(
      `/${cls('rounded-(lg|xl|2xl|3xl)')}/`,
      'Off the radius scale: rounded-md for controls, rounded-[10px] for what floats.',
    ),
    ...textRule(
      `/^(?!(?=${any}${cls('border')})(?=${any}${cls('text-xs')}))${any}${cls('rounded')}/`,
      'A bare rounded is only for a key chip (with border and text-xs).',
    ),
    ...textRule(
      `/^(?!${any}${cls('align-text-top')})${any}${cls('rounded-sm')}/`,
      'rounded-sm is only for the note checkbox glyph.',
    ),
    // A state goes one step from the plane it is on, never to another plane: what the pointer,
    // the keyboard or an open menu does is a layer (`bg-hover`, `bg-select`), not a surface.
    ...textRule(
      // `\b`, not cls(): `group-hover:` is a state too.
      '/\\b(hover|focus|focus-visible|focus-within|active|aria-expanded|aria-selected|data-\\[highlighted\\]):bg-(sheet|chrome|desk|float)(?![\\w-])/',
      'A transient state is a layer (bg-hover, bg-select), never a surface.',
    ),
    // A portalled menu with no layer paints under the pane, and five menus once had four row
    // heights: a menu and its rows take the shared look.
    {
      selector:
        "JSXOpeningElement[name.object.name='DropdownMenu'][name.property.name='Content']:not(:has(JSXAttribute[name.name='className'] Identifier[name='MENU_SURFACE']))",
      message: 'A menu takes MENU_SURFACE, which carries its layer.',
    },
    {
      selector:
        "JSXOpeningElement[name.object.name='DropdownMenu'][name.property.name='Item']:not(:has(JSXAttribute[name.name='className'] Identifier[name='MENU_ITEM']))",
      message: 'A menu row takes MENU_ITEM.',
    },
    // The OS draws a native select's popup and ignores the palette.
    {
      selector: "JSXOpeningElement[name.name='select']",
      message: 'No native select: use the app picker (PickOne).',
    },
  ]
}
