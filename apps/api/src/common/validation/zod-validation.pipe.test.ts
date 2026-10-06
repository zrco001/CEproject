import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DomainError } from '../errors/index.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z
  .object({
    name: z.string().min(1),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  })
  .strict();

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns parsed data', () => {
    expect(pipe.transform({ name: '五金行', amount: '100.00' })).toEqual({
      name: '五金行',
      amount: '100.00',
    });
  });

  it('rejects unknown properties (mass assignment)', () => {
    expect(() => pipe.transform({ name: 'x', amount: '1', organizationId: 'other-org' })).toThrow(
      DomainError,
    );
  });

  it('reports paths and issue codes without echoing values', () => {
    try {
      pipe.transform({ name: '', amount: '012345678901-secret' });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const domainError = error as DomainError;
      expect(domainError.code).toBe('VALIDATION_ERROR');
      expect(domainError.details.map((d) => d.path).sort()).toEqual(['amount', 'name']);
      expect(JSON.stringify(domainError.details)).not.toContain('secret');
    }
  });
});
