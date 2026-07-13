import { listConversations } from "@/lib/ghl";
import { readNumberSearchParam, runGhlRoute } from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return runGhlRoute(() =>
    listConversations({
      limit: readNumberSearchParam(request, "limit"),
    }),
  );
}
