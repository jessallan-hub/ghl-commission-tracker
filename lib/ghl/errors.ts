import { redactForLog } from "./logger";

export type GhlApiErrorInput = {
  status: number;
  method: string;
  path: string;
  responseBody?: unknown;
  requestId?: string | null;
};

export class GhlApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly responseBody?: unknown;
  readonly requestId?: string | null;

  constructor(input: GhlApiErrorInput) {
    super(
      `GHL API ${input.method} ${input.path} failed with status ${input.status}`,
    );
    this.name = "GhlApiError";
    this.status = input.status;
    this.method = input.method;
    this.path = input.path;
    this.responseBody = redactForLog(input.responseBody);
    this.requestId = input.requestId;
  }
}

export class GhlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhlValidationError";
  }
}
