import { NextResponse } from "next/server";
import { GhlApiError, redactForLog } from "@/lib/ghl";

export type ApiHandler<T> = () => Promise<T>;

export async function parseJsonBody<T extends Record<string, unknown>>(
  request: Request,
): Promise<T> {
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object body.");
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid JSON request body.");
    }
    throw error;
  }
}

export async function runGhlRoute<T>(handler: ApiHandler<T>) {
  try {
    const data = await handler();
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const status = error instanceof GhlApiError ? error.status : 400;
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        ok: false,
        error: {
          message,
          details: getErrorDetails(error),
        },
      },
      { status: status >= 400 && status < 600 ? status : 500 },
    );
  }
}

export function readSearchParam(request: Request, key: string) {
  return new URL(request.url).searchParams.get(key) ?? undefined;
}

export function readNumberSearchParam(request: Request, key: string) {
  const value = readSearchParam(request, key);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getErrorDetails(error: unknown) {
  if (error instanceof GhlApiError) {
    return {
      name: error.name,
      status: error.status,
      method: error.method,
      path: error.path,
      requestId: error.requestId,
      responseBody: error.responseBody,
    };
  }

  return redactForLog(error);
}
