// Regression tests for the architecture rules enforced by the Nest ESLint preset (§11.1 P1-03).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const fixtureDir = fileURLToPath(new URL('./fixtures/nest-app/', import.meta.url));

/** @type {Map<string, import('eslint').Linter.LintMessage[]>} */
const messagesByFile = new Map();

/** @param {string} relativePath */
function messagesFor(relativePath) {
  return messagesByFile.get(relativePath.replaceAll('/', path.sep)) ?? [];
}

/** @param {string} relativePath @param {string} ruleId */
function lines(relativePath, ruleId) {
  return messagesFor(relativePath)
    .filter((message) => message.ruleId === ruleId)
    .map((message) => message.line);
}

describe('Nest ESLint preset', () => {
  beforeAll(async () => {
    const eslint = new ESLint({ cwd: fixtureDir });
    const results = await eslint.lintFiles(['src/**/*.ts']);
    for (const result of results) {
      messagesByFile.set(path.relative(fixtureDir, result.filePath), result.messages);
    }
  }, 60_000);

  it('blocks imports of another module internals but allows its public entry', () => {
    expect(lines('src/modules/platform/health/cross-module.ts', 'boundaries/dependencies')).toEqual(
      [1],
    );
  });

  it('allows a module to import its own internals', () => {
    expect(messagesFor('src/modules/payables/expense/expense.module.ts')).toEqual([]);
  });

  it('blocks common/ from depending on business modules', () => {
    expect(lines('src/common/http/uses-module.ts', 'boundaries/dependencies')).toEqual([1]);
  });

  it('blocks modules from importing the composition root', () => {
    expect(
      lines('src/modules/platform/health/composition-root.ts', 'boundaries/dependencies'),
    ).toEqual([1]);
    expect(messagesFor('src/main.ts')).toEqual([]);
  });

  it('restricts raw SQL outside reporting infrastructure', () => {
    const raw = messagesFor('src/modules/platform/health/raw-sql.ts').filter(
      (message) => message.ruleId === 'no-restricted-syntax',
    );
    expect(raw).toHaveLength(3);
  });

  it('allows $queryRaw in reporting infrastructure but never $queryRawUnsafe', () => {
    const raw = messagesFor(
      'src/modules/reporting/infrastructure/project-financials.report-repository.ts',
    ).filter((message) => message.ruleId === 'no-restricted-syntax');
    expect(raw).toHaveLength(1);
    expect(raw[0]?.message).toContain('$queryRawUnsafe');
  });

  it('forbids explicit any', () => {
    expect(
      lines('src/modules/platform/health/any.ts', '@typescript-eslint/no-explicit-any'),
    ).toEqual([1]);
  });
});
