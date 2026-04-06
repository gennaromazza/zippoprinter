import { NextResponse } from "next/server";

export interface PlatformApiErrorPayload {
  error: {
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
}

export function createRequestId() {
  return crypto.randomUUID();
}

export function platformApiError(
  requestId: string,
  status: 401 | 403 | 404 | 422 | 429 | 500,
  message: string,
  details?: Record<string, unknown>,
  correlationId?: string
) {
  return NextResponse.json(
    {
      error: {
        message,
        requestId,
        ...(correlationId ? { correlationId } : {}),
        ...(details ? { details } : {}),
      },
    } satisfies PlatformApiErrorPayload,
    {
      status,
      headers: {
        "x-request-id": requestId,
        ...(correlationId ? { "x-correlation-id": correlationId } : {}),
      },
    }
  );
}

export function platformApiOk<T>(requestId: string, data: T, correlationId?: string) {
  return NextResponse.json(
    {
      requestId,
      ...(correlationId ? { correlationId } : {}),
      data,
    },
    {
      headers: {
        "x-request-id": requestId,
        ...(correlationId ? { "x-correlation-id": correlationId } : {}),
      },
    }
  );
}
