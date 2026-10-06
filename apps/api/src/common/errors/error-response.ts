import { HttpException } from '@nestjs/common';
import {
  IllegalStateTransitionError,
  InvalidBusinessDateError,
  InvalidMoneyError,
} from '@ceproject/shared';
import { DomainError, type ErrorDetail } from './domain-error.js';
import { ErrorCode, errorCodeForStatus } from './error-codes.js';

/** Wire format shared by every error response (§2.4). */
export interface ErrorResponseBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ErrorDetail[];
    readonly requestId: string | null;
  };
}

export interface MappedError {
  readonly status: number;
  readonly body: ErrorResponseBody;
  /** Whether this is an unexpected failure that must be logged with its stack. */
  readonly unexpected: boolean;
}

const GENERIC_MESSAGES: Partial<Record<number, string>> = {
  400: '請求格式不正確',
  401: '請先登入',
  403: '沒有執行此操作的權限',
  404: '找不到資料',
  405: '不支援此操作',
  409: '資料狀態衝突，請重新整理後再試',
  413: '資料過大',
  415: '不支援的資料格式',
  429: '操作過於頻繁，請稍後再試',
  503: '服務暫時無法使用',
};

const INTERNAL_MESSAGE = '系統發生錯誤，請稍後再試';

function body(
  code: string,
  message: string,
  requestId: string | null,
  details?: readonly ErrorDetail[],
): ErrorResponseBody {
  return {
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
      requestId,
    },
  };
}

/**
 * Maps any thrown value to the consistent error response. Internal details (stack traces,
 * framework messages, SQL errors) never reach the client for 5xx responses.
 */
export function toErrorResponse(exception: unknown, requestId: string | null): MappedError {
  if (exception instanceof DomainError) {
    return {
      status: exception.httpStatus,
      body: body(exception.code, exception.message, requestId, exception.details),
      unexpected: exception.httpStatus >= 500,
    };
  }

  if (exception instanceof IllegalStateTransitionError) {
    return {
      status: 409,
      body: body(ErrorCode.ILLEGAL_STATE_TRANSITION, '目前狀態不允許此操作', requestId),
      unexpected: false,
    };
  }

  if (exception instanceof InvalidMoneyError || exception instanceof InvalidBusinessDateError) {
    return {
      status: 400,
      body: body(ErrorCode.VALIDATION_ERROR, '輸入資料格式不正確', requestId),
      unexpected: false,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const message =
      status >= 500 ? INTERNAL_MESSAGE : (GENERIC_MESSAGES[status] ?? GENERIC_MESSAGES[400] ?? '');
    return {
      status,
      body: body(errorCodeForStatus(status), message, requestId),
      unexpected: status >= 500,
    };
  }

  return {
    status: 500,
    body: body(ErrorCode.INTERNAL_ERROR, INTERNAL_MESSAGE, requestId),
    unexpected: true,
  };
}
