// Shared ESLint flat config for every TypeScript workspace.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Raw SQL escape hatches that bypass parameterisation are banned everywhere (ADR-19).
 * `$queryRaw` / `$executeRaw` are additionally restricted by the Nest preset.
 */
export const unsafeRawSqlRestriction = [
  {
    selector: 'MemberExpression[property.name=/^\\$(queryRawUnsafe|executeRawUnsafe)$/]',
    message:
      '$queryRawUnsafe / $executeRawUnsafe are forbidden (ADR-19). Use Prisma.sql inside ReportingRepository.',
  },
];

/**
 * @param {{ tsconfigRootDir: string }} options
 */
export function baseConfig({ tsconfigRootDir }) {
  return tseslint.config(
    {
      ignores: [
        '**/dist/**',
        '**/.next/**',
        '**/coverage/**',
        '**/node_modules/**',
        '**/*.config.*',
        '**/next-env.d.ts',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      linterOptions: {
        reportUnusedDisableDirectives: 'error',
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'no-restricted-syntax': ['error', ...unsafeRawSqlRestriction],
        eqeqeq: ['error', 'always'],
      },
    },
    {
      files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      },
    },
  );
}
