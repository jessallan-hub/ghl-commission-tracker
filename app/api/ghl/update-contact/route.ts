import { updateContact, type UpdateContactInput } from "@/lib/ghl";
import { parseJsonBody, runGhlRoute } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return runGhlRoute(async () => {
    const body = await parseJsonBody<Record<string, unknown>>(request);
    const { contactId, ...updates } = body;

    if (typeof contactId !== "string") {
      throw new Error("contactId is required.");
    }

    return updateContact(contactId, updates as UpdateContactInput);
  });
}
