export { ghlRequest, externalPostJson } from "./client";
export { getGhlConfig } from "./config";
export { GhlApiError, GhlValidationError } from "./errors";
export { logGhl, redactForLog } from "./logger";
export * from "./dashboard";
export * from "./types";

import { ghlRequest, externalPostJson } from "./client";
import { getGhlConfig } from "./config";
import { GHL_ENDPOINTS } from "./endpoints";
import { GhlApiError } from "./errors";
import {
  AddContactNoteInput,
  CreateCalendarAppointmentInput,
  CreateContactInput,
  CreateOpportunityInput,
  SearchContactInput,
  SendSmsOrConversationMessageInput,
  TriggerInboundWebhookInput,
  UpdateContactInput,
} from "./types";
import { requireAtLeastOneString, requireString } from "./validators";

export async function createContact(input: CreateContactInput) {
  const config = getGhlConfig();

  requireAtLeastOneString(input, ["email", "phone"]);

  return ghlRequest("POST", GHL_ENDPOINTS.contacts, {
    action: "createContact",
    body: {
      locationId: config.locationId,
      ...input,
    },
  });
}

export async function updateContact(
  contactId: string,
  updates: UpdateContactInput,
) {
  const config = getGhlConfig();
  const safeContactId = requireString(contactId, "contactId");

  if (!updates || Object.keys(updates).length === 0) {
    throw new Error("updates must include at least one field.");
  }

  return ghlRequest("PUT", GHL_ENDPOINTS.contact(safeContactId), {
    action: "updateContact",
    body: {
      locationId: config.locationId,
      ...updates,
    },
  });
}

export async function searchContactByEmailOrPhone(input: SearchContactInput) {
  const config = getGhlConfig();

  requireAtLeastOneString(input, ["email", "phone"]);

  try {
    return await ghlRequest("POST", GHL_ENDPOINTS.duplicateContactSearch, {
      action: "searchContactByEmailOrPhone.duplicate",
      body: {
        locationId: config.locationId,
        email: input.email,
        phone: input.phone,
      },
    });
  } catch (error) {
    if (!(error instanceof GhlApiError) || ![404, 405].includes(error.status)) {
      throw error;
    }
  }

  return ghlRequest("GET", GHL_ENDPOINTS.contacts, {
    action: "searchContactByEmailOrPhone.list",
    query: {
      locationId: config.locationId,
      query: input.email ?? input.phone,
      limit: input.limit ?? 10,
    },
  });
}

export async function createOpportunity(input: CreateOpportunityInput) {
  const config = getGhlConfig();

  requireString(input.contactId, "contactId");
  requireString(input.pipelineId, "pipelineId");
  requireString(input.pipelineStageId, "pipelineStageId");
  requireString(input.name, "name");

  return ghlRequest("POST", GHL_ENDPOINTS.opportunities, {
    action: "createOpportunity",
    body: {
      locationId: config.locationId,
      status: "open",
      ...input,
    },
  });
}

export async function addContactNote(input: AddContactNoteInput) {
  const contactId = requireString(input.contactId, "contactId");
  const body = requireString(input.body, "body");

  return ghlRequest("POST", GHL_ENDPOINTS.contactNotes(contactId), {
    action: "addContactNote",
    body: {
      body,
      userId: input.userId,
    },
  });
}

export async function sendSmsOrConversationMessage(
  input: SendSmsOrConversationMessageInput,
) {
  requireString(input.contactId, "contactId");
  requireString(input.message, "message");

  return ghlRequest("POST", GHL_ENDPOINTS.conversationMessages, {
    action: "sendSmsOrConversationMessage",
    body: {
      type: "SMS",
      ...input,
    },
  });
}

export async function createCalendarAppointment(
  input: CreateCalendarAppointmentInput,
) {
  const config = getGhlConfig();

  requireString(input.calendarId, "calendarId");
  requireString(input.contactId, "contactId");
  requireString(input.startTime, "startTime");
  requireString(input.endTime, "endTime");

  return ghlRequest("POST", GHL_ENDPOINTS.calendarAppointments, {
    action: "createCalendarAppointment",
    body: {
      locationId: config.locationId,
      appointmentStatus: "new",
      ...input,
    },
  });
}

export async function triggerInboundWebhook(input: TriggerInboundWebhookInput) {
  const webhookUrl = requireString(input.webhookUrl, "webhookUrl");

  if (!input.payload || typeof input.payload !== "object") {
    throw new Error("payload must be a JSON object.");
  }

  return externalPostJson(webhookUrl, input.payload, input.headers);
}
