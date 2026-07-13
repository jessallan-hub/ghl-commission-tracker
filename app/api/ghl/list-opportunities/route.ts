import { listOpportunities } from "@/lib/ghl";
import {
  readNumberSearchParam,
  readSearchParam,
  runGhlRoute,
} from "../_shared";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return runGhlRoute(() =>
    listOpportunities({
      limit: readNumberSearchParam(request, "limit"),
      pipelineId: readSearchParam(request, "pipelineId"),
      pipelineStageId: readSearchParam(request, "pipelineStageId"),
      status: readSearchParam(request, "status"),
      assignedTo: readSearchParam(request, "assignedTo"),
    }),
  );
}
