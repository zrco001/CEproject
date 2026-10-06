import { Decimal } from 'decimal.js';

/**
 * Isolated decimal.js constructor so global Decimal settings elsewhere cannot leak in.
 * ROUND_HALF_UP matches Taiwan accounting practice for amounts and tax (ADR-04).
 */
const MoneyDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});
type MoneyDecimal = InstanceType<typeof MoneyDecimal>;

/** Database scale for money columns: NUMERIC(18, 2). */
export const MONEY_SCALE = 2;

/** Max integer digits allowed by NUMERIC(18, 2). */
const MAX_INTEGER_DIGITS = 16;

/** API wire format for money: plain decimal string, at most 2 fraction digits, e.g. "850000.00". */
export type MoneyString = string & { readonly __brand: 'MoneyString' };

const MONEY_STRING_PATTERN = /^-?(0|[1-9]\d{0,15})(\.\d{1,2})?$/;

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyError';
  }
}

export function isMoneyString(value: unknown): value is MoneyString {
  return typeof value === 'string' && MONEY_STRING_PATTERN.test(value) && value !== '-0';
}

export function parseMoneyString(value: string): MoneyString {
  if (!isMoneyString(value)) {
    throw new InvalidMoneyError(
      'Invalid money format: expected a decimal string with at most 2 fraction digits.',
    );
  }
  return value;
}

/** Anything exposing a decimal string representation, e.g. Prisma.Decimal. */
export interface DecimalLike {
  toString(): string;
}

/**
 * Values accepted by Money.of. JavaScript `number` is deliberately excluded:
 * money must never pass through IEEE-754 floating point (規格 §二十三).
 */
export type MoneyInput = Money | string | bigint;

export type RoundingMode = 'HALF_UP' | 'DOWN' | 'UP';

const ROUNDING: Record<RoundingMode, Decimal.Rounding> = {
  HALF_UP: Decimal.ROUND_HALF_UP,
  DOWN: Decimal.ROUND_DOWN,
  UP: Decimal.ROUND_UP,
};

/** Rate persistence scale: NUMERIC(7, 4). */
export const RATE_SCALE = 4;

/**
 * NUMERIC(7, 4): non-negative, at most 3 integer digits and 4 fraction digits (0 – 999.9999).
 * Domain limits (e.g. tax rate ≤ 1, retention rate ≤ 1) are validated by the owning domain, not here.
 */
const RATE_STRING_PATTERN = /^(0|[1-9]\d{0,2})(\.\d{1,4})?$/;

/**
 * A ratio such as a tax rate (0.05) or retention rate (0.10), stored as NUMERIC(7, 4).
 * `Rate.of` only accepts values representable in that column without rounding.
 */
export class Rate {
  private constructor(private readonly value: MoneyDecimal) {}

  static of(input: string): Rate {
    if (!RATE_STRING_PATTERN.test(input)) {
      throw new InvalidMoneyError(
        'Invalid rate: expected a non-negative decimal with at most 3 integer and 4 fraction digits (NUMERIC(7, 4)).',
      );
    }
    return new Rate(new MoneyDecimal(input));
  }

  /** @internal */
  toDecimal(): MoneyDecimal {
    return this.value;
  }

  toString(): string {
    return this.value.toString();
  }

  toJSON(): string {
    return this.value.toFixed(RATE_SCALE);
  }
}

/** Immutable money value. All arithmetic is decimal; rounding only happens when explicitly requested. */
export class Money {
  private constructor(private readonly value: MoneyDecimal) {}

  static of(input: MoneyInput): Money {
    if (input instanceof Money) {
      return input;
    }
    if (typeof input === 'bigint') {
      return new Money(new MoneyDecimal(input.toString()));
    }
    return Money.parse(input);
  }

  /** Accepts a decimal-like object (e.g. Prisma.Decimal) without going through `number`. */
  static fromDecimal(value: DecimalLike): Money {
    return Money.parse(value.toString());
  }

  static zero(): Money {
    return new Money(new MoneyDecimal(0));
  }

  static sum(values: Iterable<Money>): Money {
    let total = new MoneyDecimal(0);
    for (const value of values) {
      total = total.plus(value.value);
    }
    return new Money(total);
  }

  private static parse(input: string): Money {
    const trimmed = input.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new InvalidMoneyError('Invalid money value: expected a plain decimal string.');
    }
    const decimal = new MoneyDecimal(trimmed);
    if (decimal.abs().truncated().toFixed(0).length > MAX_INTEGER_DIGITS) {
      throw new InvalidMoneyError('Money value exceeds NUMERIC(18, 2) range.');
    }
    return new Money(decimal);
  }

  plus(other: MoneyInput): Money {
    return new Money(this.value.plus(Money.of(other).value));
  }

  minus(other: MoneyInput): Money {
    return new Money(this.value.minus(Money.of(other).value));
  }

  /** Multiply by a rate or a quantity. The result is NOT rounded; call `round()` when persisting. */
  times(factor: Rate | string | bigint): Money {
    const multiplier =
      factor instanceof Rate ? factor.toDecimal() : new MoneyDecimal(factor.toString());
    return new Money(this.value.times(multiplier));
  }

  /** Divide by a rate-like divisor. The result is NOT rounded. */
  dividedBy(divisor: Rate | string): Money {
    const value = divisor instanceof Rate ? divisor.toDecimal() : new MoneyDecimal(divisor);
    if (value.isZero()) {
      throw new InvalidMoneyError('Division by zero.');
    }
    return new Money(this.value.dividedBy(value));
  }

  /** Ratio of this amount to another, e.g. margin = profit / contract. Returns null when dividing by zero. */
  ratioTo(other: Money, fractionDigits = 4): string | null {
    if (other.value.isZero()) {
      return null;
    }
    return this.value.dividedBy(other.value).toFixed(fractionDigits, Decimal.ROUND_HALF_UP);
  }

  negated(): Money {
    return new Money(this.value.negated());
  }

  abs(): Money {
    return new Money(this.value.abs());
  }

  round(scale: number = MONEY_SCALE, mode: RoundingMode = 'HALF_UP'): Money {
    return new Money(this.value.toDecimalPlaces(scale, ROUNDING[mode]));
  }

  compare(other: MoneyInput): -1 | 0 | 1 {
    const result = this.value.comparedTo(Money.of(other).value);
    return result < 0 ? -1 : result > 0 ? 1 : 0;
  }

  equals(other: MoneyInput): boolean {
    return this.compare(other) === 0;
  }

  greaterThan(other: MoneyInput): boolean {
    return this.compare(other) === 1;
  }

  greaterThanOrEqual(other: MoneyInput): boolean {
    return this.compare(other) >= 0;
  }

  lessThan(other: MoneyInput): boolean {
    return this.compare(other) === -1;
  }

  lessThanOrEqual(other: MoneyInput): boolean {
    return this.compare(other) <= 0;
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  /** Database/API representation, rounded HALF_UP to 2 fraction digits. */
  toMoneyString(): MoneyString {
    const fixed = this.value.toFixed(MONEY_SCALE, Decimal.ROUND_HALF_UP);
    return (fixed === '-0.00' ? '0.00' : fixed) as MoneyString;
  }

  /** Decimal string with a given number of fraction digits, for display formatting. */
  toFixed(fractionDigits: number): string {
    const fixed = this.value.toFixed(fractionDigits, Decimal.ROUND_HALF_UP);
    return /^-0(\.0+)?$/.test(fixed) ? fixed.slice(1) : fixed;
  }

  toString(): string {
    return this.toMoneyString();
  }

  toJSON(): MoneyString {
    return this.toMoneyString();
  }

  /** Prevents accidental `+money` / `money * 2` coercion into floating point. */
  valueOf(): never {
    throw new TypeError('Money cannot be coerced to a number. Use Money methods instead.');
  }
}
