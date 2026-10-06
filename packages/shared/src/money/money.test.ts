import { describe, expect, it } from 'vitest';
import {
  InvalidMoneyError,
  Money,
  Rate,
  calculateTax,
  formatMoney,
  formatMoneyCompactZhTW,
  isMoneyString,
  parseMoneyString,
  splitTaxExcluded,
  splitTaxIncluded,
} from './index.js';

describe('Money', () => {
  it('avoids floating point precision errors', () => {
    expect(Money.of('0.1').plus('0.2').toMoneyString()).toBe('0.30');
    expect(Money.of('1.15').times('100').toMoneyString()).toBe('115.00');
    expect(Money.of('10000000000000.01').plus('0.02').toMoneyString()).toBe('10000000000000.03');
  });

  it('reproduces the multi-payment payable example from the spec', () => {
    const outstanding = Money.of('100000').minus('30000').minus('20000');
    expect(outstanding.toMoneyString()).toBe('50000.00');
  });

  it('sums values exactly', () => {
    const total = Money.sum(['0.10', '0.20', '0.30'].map((v) => Money.of(v)));
    expect(total.equals('0.6')).toBe(true);
    expect(Money.sum([]).isZero()).toBe(true);
  });

  it('rounds HALF_UP only when asked', () => {
    const value = Money.of('100').times(Rate.of('0.333333'));
    expect(value.toFixed(6)).toBe('33.333300');
    expect(value.round().toMoneyString()).toBe('33.33');
    expect(Money.of('2.345').round(2).toMoneyString()).toBe('2.35');
    expect(Money.of('-2.345').round(2).toMoneyString()).toBe('-2.35');
    expect(Money.of('2.349').round(2, 'DOWN').toMoneyString()).toBe('2.34');
  });

  it('compares values', () => {
    const a = Money.of('100.00');
    expect(a.equals('100')).toBe(true);
    expect(a.greaterThan('99.99')).toBe(true);
    expect(a.lessThan('100.01')).toBe(true);
    expect(a.greaterThanOrEqual('100')).toBe(true);
    expect(a.lessThanOrEqual('100')).toBe(true);
    expect(Money.of('-1').isNegative()).toBe(true);
    expect(Money.of('0').isNegative()).toBe(false);
    expect(Money.of('-0').isZero()).toBe(true);
    expect(Money.of('1').isPositive()).toBe(true);
  });

  it('accepts bigint and decimal-like values but never coerces to number', () => {
    expect(Money.of(123n).toMoneyString()).toBe('123.00');
    expect(Money.fromDecimal({ toString: () => '42.5' }).toMoneyString()).toBe('42.50');
    expect(() => Number(Money.of('1'))).toThrow(TypeError);
  });

  it('serialises to a money string in JSON', () => {
    expect(JSON.stringify({ amount: Money.of('850000') })).toBe('{"amount":"850000.00"}');
    expect(Money.of('-0.001').toMoneyString()).toBe('0.00');
  });

  it('rejects malformed or out-of-range input', () => {
    expect(() => Money.of('1e5')).toThrow(InvalidMoneyError);
    expect(() => Money.of('abc')).toThrow(InvalidMoneyError);
    expect(() => Money.of('')).toThrow(InvalidMoneyError);
    expect(() => Money.of('12345678901234567')).toThrow(InvalidMoneyError);
    expect(() => Money.of('10').dividedBy('0')).toThrow(InvalidMoneyError);
  });

  it('computes ratios without float', () => {
    expect(Money.of('229500').ratioTo(Money.of('850000'))).toBe('0.2700');
    expect(Money.of('1').ratioTo(Money.zero())).toBeNull();
  });
});

describe('MoneyString', () => {
  it.each(['0', '0.5', '12.34', '-12.34', '1234567890123456.99'])('accepts %s', (value) => {
    expect(isMoneyString(value)).toBe(true);
  });

  it.each(['', '01', '1.234', '1,000', '1e3', ' 1', '-0', '12345678901234567', '.5'])(
    'rejects %s',
    (value) => {
      expect(isMoneyString(value)).toBe(false);
    },
  );

  it('parseMoneyString throws on invalid input', () => {
    expect(parseMoneyString('10.00')).toBe('10.00');
    expect(() => parseMoneyString('10.001')).toThrow(InvalidMoneyError);
  });
});

describe('Rate', () => {
  it('validates format', () => {
    expect(Rate.of('0.05').toJSON()).toBe('0.0500');
    expect(() => Rate.of('-0.05')).toThrow(InvalidMoneyError);
    expect(() => Rate.of('5%')).toThrow(InvalidMoneyError);
  });
});

describe('tax (TWD)', () => {
  const rate = Rate.of('0.05');

  it('calculates tax rounded HALF_UP to whole dollars', () => {
    expect(calculateTax(Money.of('1000'), rate).toMoneyString()).toBe('50.00');
    expect(calculateTax(Money.of('1010'), rate).toMoneyString()).toBe('51.00'); // 50.5 → 51
    expect(calculateTax(Money.of('1009'), rate).toMoneyString()).toBe('50.00'); // 50.45 → 50
  });

  it('splits a tax-exclusive subtotal', () => {
    const split = splitTaxExcluded(Money.of('1010'), rate);
    expect(split.tax.toMoneyString()).toBe('51.00');
    expect(split.total.toMoneyString()).toBe('1061.00');
  });

  it('splits a tax-inclusive total so the parts always add up', () => {
    const split = splitTaxIncluded(Money.of('1050'), rate);
    expect(split.subtotal.toMoneyString()).toBe('1000.00');
    expect(split.tax.toMoneyString()).toBe('50.00');

    for (const total of ['1', '99', '1051', '33333', '1234567']) {
      const parts = splitTaxIncluded(Money.of(total), rate);
      expect(parts.subtotal.plus(parts.tax).equals(total)).toBe(true);
    }
  });
});

describe('formatting', () => {
  it('formats TWD as whole dollars by default', () => {
    expect(formatMoney(Money.of('8500000'))).toBe('8,500,000');
    expect(formatMoney(Money.of('1234.5'))).toBe('1,235');
    expect(formatMoney(Money.of('1234.5'), { fractionDigits: 2 })).toBe('1,234.50');
    expect(formatMoney(Money.of('100'), { withCurrencySymbol: true })).toContain('100');
  });

  it('formats compact zh-TW amounts for mobile cards', () => {
    expect(formatMoneyCompactZhTW(Money.of('8500000'))).toBe('850萬');
    expect(formatMoneyCompactZhTW(Money.of('4200000'))).toBe('420萬');
    expect(formatMoneyCompactZhTW(Money.of('12345'))).toBe('1.2萬');
    expect(formatMoneyCompactZhTW(Money.of('123456789'))).toBe('1.2億');
    expect(formatMoneyCompactZhTW(Money.of('9999'))).toBe('9,999');
    expect(formatMoneyCompactZhTW(Money.of('-3600000'))).toBe('-360萬');
  });
});
