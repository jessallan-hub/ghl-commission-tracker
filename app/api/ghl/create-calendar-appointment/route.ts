import {
  createCalendarAppointment,
  type CreateCalendarAppointmentInput,
} from "@/lib/ghl";
import { parseJsonBody, runGhlRoute } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return runGhlRoute(async () => {
    const body = await parseJsonBody<CreateCalendarAppointmentInput>(request);
    return createCalendarAppointment(body);
  });
}
