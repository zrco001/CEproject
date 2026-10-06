import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { IllegalStateTransitionError, InvalidMoneyError } from '@ceproject/shared';
import { describe, expect, it } from 'vitest';
import { DomainError } from './domain-error.js';
import { toErrorResponse } from './error-response.js';

describe('toErrorResponse (§2.4)', () => {
  it('maps DomainError with details', () => {
    const mapped = toErrorResponse(
      DomainError.businessRule('PAYABLE_OVERPAYMENT', '付款金額超過剩餘應付金額', [
        { path: 'allocations.0.amount', issue: 'exceeds_outstanding' },
      ]),
      'req-12345678',
    );
    expect(mapped.status).toBe(422);
    expect(mapped.unexpected).toBe(false);
    expect(mapped.body).toEqual({
      error: {
        code: 'PAYABLE_OVERPAYMENT',
        message: '付款金額超過剩餘應付金額',
        details: [{ path: 'allocations.0.amount', issue: 'exceeds_outstanding' }],
        requestId: 'req-12345678',
      },
    });
  });

  it('maps framework HttpExceptions to stable codes with generic messages', () => {
    expect(toErrorResponse(new NotFoundException('Cannot GET /secret'), null).body.error).toEqual({
      code: 'NOT_FOUND',
      message: '找不到資料',
      requestId: null,
    });
    expect(toErrorResponse(new UnauthorizedException(), null).body.error.code).toBe(
      'UNAUTHENTICATED',
    );
  });

  it('maps shared domain errors', () => {
    expect(
      toErrorResponse(new IllegalStateTransitionError('Expense', 'POSTED', 'SUBMIT'), null).status,
    ).toBe(409);
    expect(toErrorResponse(new InvalidMoneyError('bad'), null).body.error.code).toBe(
      'VALIDATION_ERROR',
    );
  });

  it('never leaks internal error messages', () => {
    const mapped = toErrorResponse(
      new Error('relation "Expense" does not exist; password=hunter2'),
      'r-00000001',
    );
    expect(mapped.status).toBe(500);
    expect(mapped.unexpected).toBe(true);
    expect(JSON.stringify(mapped.body)).not.toContain('hunter2');
    expect(mapped.body.error.code).toBe('INTERNAL_ERROR');
  });
});
