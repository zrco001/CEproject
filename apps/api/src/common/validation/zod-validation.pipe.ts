import { Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { DomainError, type ErrorDetail } from '../errors/index.js';

/**
 * Validates a request part against a Zod schema (ADR-03). Schemas must be `.strict()` so unknown
 * properties are rejected (mass-assignment protection). Error details carry the path and Zod issue
 * code only — never the received value, which may be sensitive.
 */
@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<TSchema>
> {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.output<TSchema> {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }
    const details: ErrorDetail[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      issue: issue.code,
    }));
    throw DomainError.validation(details);
  }
}
