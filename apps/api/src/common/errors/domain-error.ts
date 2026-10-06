import { ErrorCode } from './error-codes.js';

/** A single field-level problem. `issue` is a machine-readable reason; input values are never echoed. */
export interface ErrorDetail {
  readonly path: string;
  readonly issue: string;
}

/**
 * Expected, client-facing failure raised by use cases. The message is shown to the user
 * (zh-TW), so it must not contain sensitive values.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode | (string & {}),
    message: string,
    readonly httpStatus: number,
    readonly details: readonly ErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static validation(details: readonly ErrorDetail[], message = '輸入資料格式不正確'): DomainError {
    return new DomainError(ErrorCode.VALIDATION_ERROR, message, 400, details);
  }

  /** 404 is also used for resources in another organization (IDOR, §2.4). */
  static notFound(message = '找不到資料'): DomainError {
    return new DomainError(ErrorCode.NOT_FOUND, message, 404);
  }

  static forbidden(message = '沒有執行此操作的權限'): DomainError {
    return new DomainError(ErrorCode.FORBIDDEN, message, 403);
  }

  static conflict(code: string, message: string): DomainError {
    return new DomainError(code, message, 409);
  }

  static businessRule(
    code: string,
    message: string,
    details: readonly ErrorDetail[] = [],
  ): DomainError {
    return new DomainError(code, message, 422, details);
  }
}
