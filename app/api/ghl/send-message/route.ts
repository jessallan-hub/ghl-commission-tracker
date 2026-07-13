import {
  sendSmsOrConversationMessage,
  type SendSmsOrConversationMessageInput,
} from "@/lib/ghl";
import { parseJsonBody, runGhlRoute } from "../_shared";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return runGhlRoute(async () => {
    const body =
      await parseJsonBody<SendSmsOrConversationMessageInput>(request);
    return sendSmsOrConversationMessage(body);
  });
}
