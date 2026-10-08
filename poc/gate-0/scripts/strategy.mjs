// Gate 0 strategy allowlist. Resolved before any database or scratch operation.
// `hybrid-baseline` is the default and keeps the original PoC unchanged; `native-candidate`
// must be selected explicitly. Empty or unknown values are rejected.

export const DEFAULT_STRATEGY = 'hybrid-baseline';

/** Matches the PocPayment line the G0-4 step adds the unrelated `note` column after. */
const NOTE_ANCHOR = /^(\s*payeeReceivedAmount\s+Decimal\s+@db\.Decimal\(18, 2\)[^\S\n]*)$/m;

export const STRATEGIES = Object.freeze({
  'hybrid-baseline': Object.freeze({
    id: 'hybrid-baseline',
    description:
      'Single-column Prisma relations; composite unique targets, composite FKs, CHECKs and the partial unique index are manual SQL (run 37645666192 failed TC-16).',
    schema: 'prisma/schema.prisma',
    migrations: 'prisma/migrations',
    noteAnchor: NOTE_ANCHOR,
    // Manual composite unique targets are UNIQUE constraints.
    registryOptions: Object.freeze({}),
    // G0-8 compares the separate native variant (recorded outcome) with the hybrid schema.
    g08: 'compare-native-variant',
  }),
  'native-candidate': Object.freeze({
    id: 'native-candidate',
    description:
      'Native Prisma composite relations and (organizationId, id) unique targets from variants/native/schema.prisma; only the 3 CHECKs and the partial unique index are manual SQL.',
    schema: 'variants/native/schema.prisma',
    migrations: 'native-candidate/migrations',
    noteAnchor: NOTE_ANCHOR,
    // Prisma creates the composite unique targets as UNIQUE INDEXes. The full registry (all 8
    // entries) is still required; only the unique-target form is relaxed.
    registryOptions: Object.freeze({ uniqueMayBeIndex: true }),
    // G0-8: native validate must succeed (no recorded "unsupported" outcome).
    g08: 'require-native',
  }),
});

export class StrategyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StrategyError';
  }
}

/**
 * Resolves GATE0_STRATEGY. `undefined` (variable not set) selects the default; anything else
 * must exactly match an allowlisted id (no trimming, no case folding).
 */
export function resolveStrategy(value) {
  if (value === undefined) {
    return STRATEGIES[DEFAULT_STRATEGY];
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new StrategyError('GATE0_STRATEGY is set but empty; refusing to guess a strategy.');
  }
  if (!Object.hasOwn(STRATEGIES, value)) {
    throw new StrategyError(
      `Unknown GATE0_STRATEGY "${value}". Allowed: ${Object.keys(STRATEGIES).join(', ')}.`,
    );
  }
  return STRATEGIES[value];
}

/** Inserts the unrelated `note` column for G0-4. Throws if the anchor is missing or ambiguous. */
export function addNoteColumn(schema, strategy) {
  const matches = schema.match(new RegExp(strategy.noteAnchor.source, 'gm')) ?? [];
  if (matches.length !== 1) {
    throw new StrategyError(
      `Expected exactly one PocPayment payeeReceivedAmount line, found ${matches.length}.`,
    );
  }
  return schema.replace(strategy.noteAnchor, '$1\n  note                String?');
}
