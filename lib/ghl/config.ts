export type GhlConfig = {
  apiKey: string;
  doctorDampApiKey?: string;
  doctorDampLocationId?: string;
  locationId: string;
  baseUrl: string;
  apiVersion: string;
};

export const DEFAULT_GHL_API_BASE_URL =
  "https://services.leadconnectorhq.com";
export const DEFAULT_GHL_API_VERSION = "2021-07-28";

export function getGhlConfig(): GhlConfig {
  const apiKey = process.env.GHL_API_KEY;
  const doctorDampApiKey = process.env.GHL_DOCTOR_DAMP_API_KEY;
  const doctorDampLocationId = process.env.GHL_DOCTOR_DAMP_LOCATION_ID;
  const locationId = process.env.GHL_LOCATION_ID;
  const baseUrl = process.env.GHL_API_BASE_URL ?? DEFAULT_GHL_API_BASE_URL;
  const apiVersion = process.env.GHL_API_VERSION ?? DEFAULT_GHL_API_VERSION;

  const missing = [
    ["GHL_API_KEY", apiKey],
    ["GHL_LOCATION_ID", locationId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required GHL env var(s): ${missing.join(", ")}`);
  }

  return {
    apiKey: apiKey as string,
    doctorDampApiKey,
    doctorDampLocationId,
    locationId: locationId as string,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiVersion,
  };
}
