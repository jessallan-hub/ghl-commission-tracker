import { getActiveClientDetail } from "@/lib/ghl";
import { readSearchParam, runGhlRoute } from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return runGhlRoute(() =>
    getActiveClientDetail({
      contactId: readSearchParam(request, "contactId") ?? "",
      opportunityId: readSearchParam(request, "opportunityId"),
    }),
  );
}
