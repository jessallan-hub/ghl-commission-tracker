export const GHL_ENDPOINTS = {
  contacts: "/contacts/",
  contact: (contactId: string) => `/contacts/${encodeURIComponent(contactId)}`,
  duplicateContactSearch: "/contacts/search/duplicate",
  contactNotes: (contactId: string) =>
    `/contacts/${encodeURIComponent(contactId)}/notes`,
  contactTasks: (contactId: string) =>
    `/contacts/${encodeURIComponent(contactId)}/tasks`,
  contactAppointments: (contactId: string) =>
    `/contacts/${encodeURIComponent(contactId)}/appointments`,
  opportunities: "/opportunities/",
  opportunitiesSearch: "/opportunities/search",
  pipelines: "/opportunities/pipelines",
  conversationsSearch: "/conversations/search",
  conversationMessages: "/conversations/messages",
  conversationMessagesByConversationId: (conversationId: string) =>
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
  messageTranscription: (locationId: string, messageId: string) =>
    `/conversations/locations/${encodeURIComponent(
      locationId,
    )}/messages/${encodeURIComponent(messageId)}/transcription`,
  workflows: "/workflows/",
  paymentTransactions: "/payments/transactions",
  paymentOrders: "/payments/orders",
  paymentSubscriptions: "/payments/subscriptions",
  invoices: "/invoices/",
  calendars: "/calendars/",
  calendarAppointments: "/calendars/events/appointments",
} as const;
