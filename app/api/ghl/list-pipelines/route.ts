import { listPipelines } from "@/lib/ghl";
import { runGhlRoute } from "../_shared";

export const runtime = "nodejs";

export async function GET() {
  return runGhlRoute(() => listPipelines());
}
