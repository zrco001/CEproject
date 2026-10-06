// ESLint preset for the NestJS Modular Monolith (apps/api).
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';
import { baseConfig, unsafeRawSqlRestriction } from './base.js';

/** `$queryRaw` / `$executeRaw` are only allowed inside the tenant-guarded reporting repositories (ADR-19). */
const rawSqlRestriction = [
  ...unsafeRawSqlRestriction,
  {
    selector: 'MemberExpression[property.name=/^\\$(queryRaw|executeRaw)$/]',
    message:
      '$queryRaw / $executeRaw are only allowed in src/modules/reporting/infrastructure/** (ReportingRepository, ADR-19).',
  },
];

/**
 * Module boundaries (ARCHITECTURE.md §2.3):
 * - src/modules/<context>/<module>/** may import another module only through its public entry
 *   (`<name>.module.ts` or `index.ts`), never its application/domain/infrastructure internals.
 * - src/common/** and src/infrastructure/** must not depend on business modules.
 * - Nothing imports the composition root (src/main.ts, src/app.module.ts) except main.ts.
 */
/** @param {string} rootPath */
const boundariesConfig = (rootPath) => ({
  plugins: { boundaries },
  settings: {
    // Patterns are relative to the app root, independent of the directory ESLint runs from.
    'boundaries/root-path': rootPath,
    'import/resolver': {
      typescript: { alwaysTryTypes: true },
      node: true,
    },
    'boundaries/elements': [
      { type: 'config', pattern: 'src/config' },
      { type: 'common', pattern: 'src/common/*', capture: ['name'] },
      { type: 'infrastructure', pattern: 'src/infrastructure/*', capture: ['name'] },
      { type: 'module', pattern: 'src/modules/*/*', capture: ['context', 'name'] },
    ],
    'boundaries/files': [
      { category: 'test', pattern: ['**/*.test.ts', 'test/**'] },
      { category: 'composition-root', pattern: ['src/main.ts', 'src/app.module.ts'] },
    ],
  },
  rules: {
    'boundaries/dependencies': [
      'error',
      {
        default: 'allow',
        policies: [
          {
            from: { element: { type: 'module' } },
            disallow: { to: { element: { type: 'module', path: '!{{ from.element.path }}' } } },
            message:
              'Import another module only through its public entry (*.module.ts or index.ts).',
          },
          {
            from: { element: { type: 'module' } },
            allow: {
              to: { element: { type: 'module', fileInternalPath: ['*.module.ts', 'index.ts'] } },
            },
          },
          {
            from: { element: { types: { anyOf: ['common', 'infrastructure', 'config'] } } },
            disallow: { to: { element: { type: 'module' } } },
            message: 'common / infrastructure / config must not depend on business modules.',
          },
          {
            from: {
              element: { types: { anyOf: ['module', 'common', 'infrastructure', 'config'] } },
            },
            disallow: { to: { file: { categories: 'composition-root' } } },
            message: 'Only main.ts may import the composition root.',
          },
        ],
      },
    ],
  },
});

/**
 * @param {{ tsconfigRootDir: string }} options
 */
export function nestConfig({ tsconfigRootDir }) {
  return [
    ...baseConfig({ tsconfigRootDir }),
    {
      languageOptions: { globals: { ...globals.node } },
      rules: {
        // Nest modules are intentionally empty decorated classes.
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
        // Constructor-injected classes must be value imports for emitDecoratorMetadata.
        '@typescript-eslint/consistent-type-imports': 'off',
        'no-restricted-syntax': ['error', ...rawSqlRestriction],
      },
    },
    {
      files: ['src/modules/reporting/infrastructure/**/*.ts'],
      rules: {
        'no-restricted-syntax': ['error', ...unsafeRawSqlRestriction],
      },
    },
    boundariesConfig(tsconfigRootDir),
  ];
}
