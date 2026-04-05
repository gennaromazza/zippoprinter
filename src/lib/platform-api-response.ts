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
  details?: Record<string, unknown>
) {
  return NextResponse.json(
    {
      error: {
        message,
        requestId,
        ...(details ? { details } : {}),
      },
    } satisfies PlatformApiErrorPayload,
    {
      status,
      headers: {
        "x-request-id": requestId,
      },
    }
  );
}

export function platformApiOk<T>(requestId: string, data: T) {
  return NextResponse.json(
    {
      requestId,
      data,
    },
    {
      headers: {
        "x-request-id": requestId,
      },
    }
  );
}
