import { getGhlConfig } from "./config";
import { GhlApiError } from "./errors";
import { logGhl, redactForLog } from "./logger";

export type GhlRequestOptions = {
  apiKey?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  skipAuth?: boolean;
  action?: string;
};

const DEFAULT_TIMEOUT_MS = 30_000;

export async function ghlRequest<TResponse>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: GhlRequestOptions = {},
): Promise<TResponse> {
  const config = getGhlConfig();
  const url = buildGhlUrl(config.baseUrl, path, options.query);
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Codex-GHL-Dashboard/1.0",
    Version: config.apiVersion,
    ...options.headers,
  };

  if (!options.skipAuth) {
    headers.Authorization = `Bearer ${options.apiKey ?? config.apiKey}`;
  }

  logGhl("info", "GHL request started", {
    action: options.action,
    method,
    path,
    queryKeys: Object.keys(options.query ?? {}),
  });

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const responseBody = await readResponseBody(response);
    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      logGhl("error", "GHL request failed", {
        action: options.action,
        method,
        path,
        status: response.status,
        durationMs,
        responseBody,
      });

      throw new GhlApiError({
        status: response.status,
        method,
        path,
        responseBody,
        requestId:
          response.headers.get("x-request-id") ??
          response.headers.get("x-correlation-id"),
      });
    }

    logGhl("info", "GHL request succeeded", {
      action: options.action,
      method,
      path,
      status: response.status,
      durationMs,
    });

    return responseBody as TResponse;
  } catch (error) {
    if (error instanceof GhlApiError) {
      throw error;
    }

    logGhl("error", "GHL request crashed", {
      action: options.action,
      method,
      path,
      error: redactForLog(error),
    });

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function externalPostJson<TResponse>(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<TResponse> {
  const parsedUrl = new URL(url);
  const startedAt = Date.now();

  logGhl("info", "External GHL webhook request started", {
    host: parsedUrl.host,
    path: parsedUrl.pathname,
  });

  const response = await fetch(parsedUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const responseBody = await readResponseBody(response);
  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    logGhl("error", "External GHL webhook request failed", {
      host: parsedUrl.host,
      path: parsedUrl.pathname,
      status: response.status,
      durationMs,
      responseBody,
    });

    throw new GhlApiError({
      status: response.status,
      method: "POST",
      path: parsedUrl.pathname,
      responseBody,
    });
  }

  logGhl("info", "External GHL webhook request succeeded", {
    host: parsedUrl.host,
    path: parsedUrl.pathname,
    status: response.status,
    durationMs,
  });

  return responseBody as TResponse;
}

function buildGhlUrl(
  baseUrl: string,
  path: string,
  query: GhlRequestOptions["query"],
) {
  const url = new URL(path, `${baseUrl}/`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function readResponseBody(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
