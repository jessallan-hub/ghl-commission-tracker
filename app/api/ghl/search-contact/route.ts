import { searchContactByEmailOrPhone, type SearchContactInput } from "@/lib/ghl";
import {
  parseJsonBody,
  readSearchParam,
  runGhlRoute,
} from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return runGhlRoute(async () =>
    searchContactByEmailOrPhone({
      email: readSearchParam(request, "email"),
      phone: readSearchParam(request, "phone"),
      limit: parseLimit(readSearchParam(request, "limit")),
    }),
  );
}

export async function POST(request: Request) {
  return runGhlRoute(async () => {
    const body = await parseJsonBody<SearchContactInput>(request);
    return searchContactByEmailOrPhone(body);
  });
}

function parseLimit(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
