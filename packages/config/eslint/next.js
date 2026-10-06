// ESLint preset for the Next.js app (apps/web).
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { baseConfig } from './base.js';

/**
 * @param {{ tsconfigRootDir: string }} options
 */
export function nextConfig({ tsconfigRootDir }) {
  return [
    ...baseConfig({ tsconfigRootDir }),
    {
      languageOptions: { globals: { ...globals.browser } },
      plugins: {
        '@next/next': nextPlugin,
        'react-hooks': reactHooks,
      },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
        // Business logic must not live in React components (規格 §二十五); data access goes
        // through features/*/api.ts, never a database client.
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@prisma/*', '@ceproject/db', '@ceproject/db/*'],
                message: 'The web app must not access the database.',
              },
            ],
          },
        ],
      },
    },
  ];
}
