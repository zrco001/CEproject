import { Rate, type Money } from './money.js';

/** TWD tax amounts are whole dollars (營業稅以元為單位，四捨五入). */
export const TAX_SCALE_TWD = 0;

/** Default Taiwan business tax rate (5%). Organisation settings may override it. */
export const DEFAULT_TAX_RATE = Rate.of('0.05');

/** Tax on a tax-exclusive subtotal, rounded HALF_UP to whole dollars. */
export function calculateTax(subtotal: Money, rate: Rate, scale: number = TAX_SCALE_TWD): Money {
  return subtotal.times(rate).round(scale, 'HALF_UP');
}

export interface TaxSplit {
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
}

/** Tax-exclusive input: subtotal + rounded tax = total. */
export function splitTaxExcluded(
  subtotal: Money,
  rate: Rate,
  scale: number = TAX_SCALE_TWD,
): TaxSplit {
  const tax = calculateTax(subtotal, rate, scale);
  return { subtotal, tax, total: subtotal.plus(tax) };
}

/**
 * Tax-inclusive input (the usual quick-expense entry): subtotal = round(total / (1 + rate)),
 * tax = total − subtotal, so subtotal + tax always equals the entered total exactly.
 */
export function splitTaxIncluded(
  total: Money,
  rate: Rate,
  scale: number = TAX_SCALE_TWD,
): TaxSplit {
  const divisor = Rate.of('1').toDecimal().plus(rate.toDecimal()).toString();
  const subtotal = total.dividedBy(divisor).round(scale, 'HALF_UP');
  return { subtotal, tax: total.minus(subtotal), total };
}
