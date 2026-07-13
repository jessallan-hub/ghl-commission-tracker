import { getDoctorDampWorkflowIntelligenceSnapshot, getLeadSummarySnapshot } from "@/lib/ghl";
import { runGhlRoute } from "../_shared";

export const runtime = "nodejs";

export async function GET() {
  return runGhlRoute(async () => {
    const leadSummary = await getLeadSummarySnapshot();

    return getDoctorDampWorkflowIntelligenceSnapshot(leadSummary);
  });
}
