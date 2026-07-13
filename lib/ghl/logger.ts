const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|api[-_]?key|email|phone/i;

export type LogLevel = "info" | "warn" | "error";

export function redactForLog(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: process.env.NODE_ENV === "development" ? value.stack : undefined,
    };
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactForLog(entry),
      ]),
    );
  }

  return value;
}

export function logGhl(
  level: LogLevel,
  message: string,
  metadata: Record<string, unknown> = {},
) {
  const safeMetadata = redactForLog(metadata);
  const payload = {
    integration: "ghl",
    message,
    ...((safeMetadata as Record<string, unknown>) ?? {}),
  };

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.info(payload);
}

function redactString(value: string) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/\+?\d[\d\s().-]{7,}\d/g, REDACTED);
}
