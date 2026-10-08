// Offline tests for the Gate 0 strategy allowlist (no database; does not import the runner).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_STRATEGY,
  STRATEGIES,
  StrategyError,
  addNoteColumn,
  resolveStrategy,
} from '../scripts/strategy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('resolveStrategy', () => {
  it('defaults to hybrid-baseline when GATE0_STRATEGY is not set', () => {
    assert.equal(DEFAULT_STRATEGY, 'hybrid-baseline');
    assert.equal(resolveStrategy(undefined).id, 'hybrid-baseline');
  });

  it('selects native-candidate only when named explicitly', () => {
    assert.equal(resolveStrategy('native-candidate').id, 'native-candidate');
    assert.equal(resolveStrategy('hybrid-baseline').id, 'hybrid-baseline');
  });

  for (const value of [
    '',
    'native',
    'Native-Candidate',
    ' native-candidate',
    'native-candidate ',
    'hybrid',
    'toString',
    '__proto__',
  ]) {
    it(`rejects ${JSON.stringify(value)}`, () => {
      assert.throws(() => resolveStrategy(value), StrategyError);
    });
  }

  it('rejects non-string values', () => {
    assert.throws(() => resolveStrategy(null), StrategyError);
    assert.throws(() => resolveStrategy(1), StrategyError);
  });

  it('exposes exactly the two allowlisted strategies', () => {
    assert.deepEqual(Object.keys(STRATEGIES).sort(), ['hybrid-baseline', 'native-candidate']);
  });
});

describe('strategy definitions', () => {
  it('hybrid-baseline keeps the original schema, migrations and registry rules', () => {
    const s = STRATEGIES['hybrid-baseline'];
    assert.equal(s.schema, 'prisma/schema.prisma');
    assert.equal(s.migrations, 'prisma/migrations');
    assert.deepEqual({ ...s.registryOptions }, {});
    assert.equal(s.g08, 'compare-native-variant');
  });

  it('native-candidate reuses the native variant schema and requires native support', () => {
    const s = STRATEGIES['native-candidate'];
    assert.equal(s.schema, 'variants/native/schema.prisma');
    assert.equal(s.migrations, 'native-candidate/migrations');
    assert.deepEqual({ ...s.registryOptions }, { uniqueMayBeIndex: true });
    assert.equal(s.g08, 'require-native');
  });

  for (const s of Object.values(STRATEGIES)) {
    it(`${s.id}: schema and migrations exist`, () => {
      assert.ok(existsSync(path.join(root, s.schema)), s.schema);
      assert.ok(existsSync(path.join(root, s.migrations, 'migration_lock.toml')), s.migrations);
    });

    it(`${s.id}: adds exactly one note column after payeeReceivedAmount`, () => {
      const schema = readFileSync(path.join(root, s.schema), 'utf8');
      const updated = addNoteColumn(schema, s);
      assert.equal(updated.split('note                String?').length - 1, 1);
      assert.match(updated, /payeeReceivedAmount[^\n]*\n {2}note {16}String\?/);
      assert.equal(updated.replace('\n  note                String?', ''), schema);
    });
  }

  it('addNoteColumn refuses a schema without the anchor line', () => {
    assert.throws(
      () =>
        addNoteColumn('model PocPayment {\n  id String @id\n}\n', STRATEGIES['native-candidate']),
      StrategyError,
    );
  });

  it('addNoteColumn refuses an ambiguous anchor', () => {
    const line = '  payeeReceivedAmount Decimal         @db.Decimal(18, 2)\n';
    assert.throws(() => addNoteColumn(line + line, STRATEGIES['hybrid-baseline']), StrategyError);
  });
});
