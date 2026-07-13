import { GhlValidationError } from "./errors";

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GhlValidationError(`${fieldName} is required.`);
  }

  return value.trim();
}

export function requireAtLeastOneString(
  values: Record<string, unknown>,
  fieldNames: string[],
) {
  const hasValue = fieldNames.some(
    (fieldName) =>
      typeof values[fieldName] === "string" &&
      values[fieldName].trim().length > 0,
  );

  if (!hasValue) {
    throw new GhlValidationError(
      `At least one of ${fieldNames.join(", ")} is required.`,
    );
  }
}

export function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
