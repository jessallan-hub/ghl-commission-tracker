import { readFileSync } from "node:fs";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const committedClientConfigs: unknown = require("../../config/commission-clients.json");

import { ghlRequest } from "./client";
import { getGhlConfig } from "./config";
import { GHL_ENDPOINTS } from "./endpoints";
import { GhlApiError } from "./errors";
import type {
  ActiveClientDetail,
  ActiveClientDetailAppointment,
  ActiveClientDetailContact,
  ActiveClientDetailConversation,
  ActiveClientDetailInput,
  ActiveClientDetailNote,
  ActiveClientDetailTask,
  AiAgentChannelBreakdown,
  AiAgentConversationInsight,
  AiAgentEffectivenessSnapshot,
  AiAgentSentiment,
  CommissionClientConfig,
  CommissionClientSnapshot,
  CommissionLedgerMonth,
  CommissionPaymentRow,
  CommissionTrackerSnapshot,
  GhlRecord,
  ListCalendarsResponse,
  ListConversationMessagesResponse,
  ListConversationsInput,
  ListConversationsResponse,
  LeadConversationSummary,
  LeadSummaryRow,
  LeadSummarySnapshot,
  ListContactsInput,
  ListContactsResponse,
  ListOpportunitiesInput,
  ListOpportunitiesResponse,
  ListPipelinesResponse,
  MissionControlAccessIssue,
  MissionControlActiveClients,
  MissionControlCalendar,
  MissionControlConversation,
  MissionControlFollowUp,
  MissionControlKpis,
  MissionControlOpportunity,
  MissionControlSnapshot,
  MissionControlStage,
  WorkflowCategory,
  WorkflowIntelligenceRow,
  WorkflowIntelligenceSnapshot,
} from "./types";
import { requireString } from "./validators";

const DEFAULT_OPPORTUNITY_LIMIT = 100;
const DEFAULT_CONVERSATION_LIMIT = 50;
const MAX_LIMIT = 100;
const STALE_OPPORTUNITY_DAYS = 14;
const DETAIL_LIMIT = 12;
const AI_AGENT_ACCOUNT_NAME = "RT Digital";
const AI_AGENT_CONVERSATION_LIMIT = 14;
const AI_AGENT_MESSAGE_LIMIT = 40;
const LEAD_ACCOUNT_NAME = "Doctor Damp";
const DEFAULT_DOCTOR_DAMP_LOCATION_ID = "PkoELbKfvhIzmaYMsV4r";
const DOCTOR_DAMP_LEADS_SINCE = "2026-03-01T00:00:00.000Z";
const LEAD_PAGE_LIMIT = 100;
const LEAD_MAX_CONTACTS = 100;
const LEAD_ENRICH_LIMIT = 60;
const DOCTOR_DAMP_EXPECTED_MAX_CONTACTS = 100;
const COMMISSION_ACCOUNT_NAME = "RT Digital";
const COMMISSION_CONFIG_FILE = "commission-clients.local.json";
const workflowCategoryOrder: WorkflowCategory[] = [
  "inbound",
  "outbound",
  "nurture",
  "appointment",
  "pipeline",
  "handoff",
  "estimate",
  "notification",
  "other",
];

type SourceResult<T> = {
  data?: T;
  issue?: MissionControlAccessIssue;
};

type StageLookup = {
  stageId: string;
  stageName: string;
  pipelineId: string;
  pipelineName: string;
};

type AiAgentMessage = {
  id: string;
  body: string;
  direction?: string;
  source?: string;
  status?: string;
  messageType?: string;
  dateAdded?: string;
};

type ListWorkflowsResponse = {
  workflows?: GhlRecord[];
  traceId?: string;
} & GhlRecord;

type PaymentCollectionResponse = {
  data?: GhlRecord[];
  traceId?: string;
} & GhlRecord;

type InvoiceCollectionResponse = {
  invoices?: GhlRecord[];
  traceId?: string;
} & GhlRecord;

export async function listPipelines() {
  const config = getGhlConfig();

  return ghlRequest<ListPipelinesResponse>("GET", GHL_ENDPOINTS.pipelines, {
    action: "listPipelines",
    query: {
      locationId: config.locationId,
    },
  });
}

export async function listOpportunities(input: ListOpportunitiesInput = {}) {
  const config = getGhlConfig();

  return ghlRequest<ListOpportunitiesResponse>(
    "GET",
    GHL_ENDPOINTS.opportunitiesSearch,
    {
      action: "listOpportunities",
      query: {
        location_id: config.locationId,
        limit: clampLimit(input.limit, DEFAULT_OPPORTUNITY_LIMIT),
        pipeline_id: input.pipelineId,
        pipeline_stage_id: input.pipelineStageId,
        status: input.status,
        assigned_to: input.assignedTo,
      },
    },
  );
}

export async function listConversations(input: ListConversationsInput = {}) {
  const config = getGhlConfig();

  return listConversationsForLocation(config.locationId, input);
}

async function listConversationsForLocation(
  locationId: string,
  input: ListConversationsInput = {},
  apiKey?: string,
) {

  return ghlRequest<ListConversationsResponse>(
    "GET",
    GHL_ENDPOINTS.conversationsSearch,
    {
      apiKey,
      action: "listConversations",
      query: {
        locationId,
        limit: clampLimit(input.limit, DEFAULT_CONVERSATION_LIMIT),
      },
    },
  );
}

export async function listContacts(input: ListContactsInput = {}) {
  const config = getGhlConfig();

  return ghlRequest<ListContactsResponse>("GET", GHL_ENDPOINTS.contacts, {
    apiKey: input.apiKey,
    action: "listContacts",
    query: {
      locationId: input.locationId ?? config.locationId,
      limit: clampLimit(input.limit, LEAD_PAGE_LIMIT),
      startAfter: input.startAfter,
      startAfterId: input.startAfterId,
    },
  });
}

export async function listCalendars() {
  const config = getGhlConfig();

  return ghlRequest<ListCalendarsResponse>("GET", GHL_ENDPOINTS.calendars, {
    action: "listCalendars",
    query: {
      locationId: config.locationId,
    },
  });
}

async function listWorkflowsForLocation(locationId: string, apiKey?: string) {
  return ghlRequest<ListWorkflowsResponse>("GET", GHL_ENDPOINTS.workflows, {
    apiKey,
    action: "listWorkflows",
    query: {
      locationId,
    },
  });
}

async function listPaymentTransactionsForClient(locationId: string, apiKey: string) {
  return ghlRequest<PaymentCollectionResponse>(
    "GET",
    GHL_ENDPOINTS.paymentTransactions,
    {
      apiKey,
      action: "listPaymentTransactions",
      query: { altId: locationId, altType: "location", limit: 100 },
    },
  );
}

async function listPaymentOrdersForClient(locationId: string, apiKey: string) {
  return ghlRequest<PaymentCollectionResponse>("GET", GHL_ENDPOINTS.paymentOrders, {
    apiKey,
    action: "listPaymentOrders",
    query: { altId: locationId, altType: "location", limit: 100 },
  });
}

async function listPaymentSubscriptionsForClient(locationId: string, apiKey: string) {
  return ghlRequest<PaymentCollectionResponse>(
    "GET",
    GHL_ENDPOINTS.paymentSubscriptions,
    {
      apiKey,
      action: "listPaymentSubscriptions",
      query: { altId: locationId, altType: "location", limit: 100 },
    },
  );
}

async function listInvoicesForClient(locationId: string, apiKey: string) {
  return ghlRequest<InvoiceCollectionResponse>("GET", GHL_ENDPOINTS.invoices, {
    apiKey,
    action: "listInvoices",
    query: { altId: locationId, altType: "location", limit: 100, offset: "0" },
  });
}

export async function getContact(contactId: string) {
  const safeContactId = requireString(contactId, "contactId");

  return ghlRequest<Record<string, unknown>>(
    "GET",
    GHL_ENDPOINTS.contact(safeContactId),
    {
      action: "getContact",
    },
  );
}

export async function listContactNotes(contactId: string) {
  const safeContactId = requireString(contactId, "contactId");

  return ghlRequest<Record<string, unknown>>(
    "GET",
    GHL_ENDPOINTS.contactNotes(safeContactId),
    {
      action: "listContactNotes",
    },
  );
}

export async function listContactTasks(contactId: string) {
  const safeContactId = requireString(contactId, "contactId");

  return ghlRequest<Record<string, unknown>>(
    "GET",
    GHL_ENDPOINTS.contactTasks(safeContactId),
    {
      action: "listContactTasks",
    },
  );
}

export async function listContactAppointments(contactId: string) {
  const safeContactId = requireString(contactId, "contactId");

  return ghlRequest<Record<string, unknown>>(
    "GET",
    GHL_ENDPOINTS.contactAppointments(safeContactId),
    {
      action: "listContactAppointments",
    },
  );
}

export async function listContactConversations(contactId: string) {
  const config = getGhlConfig();
  const safeContactId = requireString(contactId, "contactId");

  return ghlRequest<ListConversationsResponse>(
    "GET",
    GHL_ENDPOINTS.conversationsSearch,
    {
      action: "listContactConversations",
      query: {
        locationId: config.locationId,
        contactId: safeContactId,
        limit: DETAIL_LIMIT,
      },
    },
  );
}

export async function listConversationMessages(conversationId: string) {
  const safeConversationId = requireString(conversationId, "conversationId");

  return ghlRequest<ListConversationMessagesResponse>(
    "GET",
    GHL_ENDPOINTS.conversationMessagesByConversationId(safeConversationId),
    {
      action: "listConversationMessages",
    },
  );
}

export async function getActiveClientDetail(
  input: ActiveClientDetailInput,
): Promise<ActiveClientDetail> {
  const contactId = requireString(input.contactId, "contactId");
  const [contactResult, notesResult, tasksResult, appointmentsResult, conversationsResult] =
    await Promise.all([
      loadSource("contact", () => getContact(contactId)),
      loadSource("notes", () => listContactNotes(contactId)),
      loadSource("tasks", () => listContactTasks(contactId)),
      loadSource("appointments", () => listContactAppointments(contactId)),
      loadSource("conversations", () => listContactConversations(contactId)),
    ]);
  const accessIssues = [
    contactResult.issue,
    notesResult.issue,
    tasksResult.issue,
    appointmentsResult.issue,
    conversationsResult.issue,
  ].filter((issue): issue is MissionControlAccessIssue => Boolean(issue));

  return {
    contactId,
    opportunityId: input.opportunityId,
    contact: buildContactDetail(contactResult.data),
    notes: buildContactNotes(notesResult.data),
    tasks: buildContactTasks(tasksResult.data),
    appointments: buildContactAppointments(appointmentsResult.data),
    conversations: buildContactConversations(conversationsResult.data),
    accessIssues,
  };
}

export async function getAiAgentEffectivenessSnapshot(
  sourceConversations?: GhlRecord[],
): Promise<AiAgentEffectivenessSnapshot> {
  const conversations =
    sourceConversations ??
    getRecords(await listConversations({ limit: DEFAULT_CONVERSATION_LIMIT }), "conversations");
  const candidates = conversations
    .slice()
    .sort((a, b) =>
      compareDateDesc(
        readConversationDate(a),
        readConversationDate(b),
      ),
    )
    .slice(0, AI_AGENT_CONVERSATION_LIMIT);
  const messageResults: SourceResult<ListConversationMessagesResponse>[] =
    await Promise.all(
      candidates.map(async (conversation) => {
      const conversationId = readString(conversation, ["id"]);

      if (!conversationId) {
        return {
          issue: {
            source: "conversationMessages",
            message: "Conversation did not include an id.",
          },
        } satisfies SourceResult<ListConversationMessagesResponse>;
      }

      return loadSource("conversationMessages", () =>
        listConversationMessages(conversationId),
      );
      }),
    );
  const insights = candidates.map((conversation, index) =>
    buildAiAgentConversationInsight(conversation, messageResults[index]?.data),
  );
  const accessIssues = messageResults
    .map((result) => result.issue)
    .filter((issue): issue is MissionControlAccessIssue => Boolean(issue));

  return buildAiAgentEffectivenessSnapshot(
    conversations.length,
    insights,
    accessIssues,
  );
}

export async function getLeadSummarySnapshot(): Promise<LeadSummarySnapshot> {
  const config = getGhlConfig();
  const doctorDampLocationId =
    config.doctorDampLocationId ?? DEFAULT_DOCTOR_DAMP_LOCATION_ID;
  const doctorDampApiKey = config.doctorDampApiKey;
  const contactResults: SourceResult<ListContactsResponse>[] = [];
  const contacts: GhlRecord[] = [];
  let startAfter: number | undefined;
  let startAfterId: string | undefined;
  let totalContacts = 0;

  while (contacts.length < LEAD_MAX_CONTACTS) {
    const result = await loadSource("contacts", () =>
      listContacts({
        limit: Math.min(LEAD_PAGE_LIMIT, LEAD_MAX_CONTACTS - contacts.length),
        apiKey: doctorDampApiKey,
        locationId: doctorDampLocationId,
        startAfter,
        startAfterId,
      }),
    );
    contactResults.push(result);

    if (!result.data) {
      break;
    }

    const pageContacts = getRecords(result.data, "contacts");
    contacts.push(...pageContacts);
    totalContacts = result.data.meta?.total ?? totalContacts;
    startAfter = result.data.meta?.startAfter;
    startAfterId = result.data.meta?.startAfterId;

    if (!startAfter || !startAfterId || pageContacts.length === 0) {
      break;
    }
  }

  const filteredContacts = contacts.filter((contact) =>
    isLeadSince(contact, DOCTOR_DAMP_LEADS_SINCE),
  );
  const conversationsResult = await loadSource("leadConversations", () =>
    listConversationsForLocation(
      doctorDampLocationId,
      {
        limit: DEFAULT_CONVERSATION_LIMIT,
      },
      doctorDampApiKey,
    ),
  );
  const conversations = getRecords(conversationsResult.data, "conversations");
  const conversationsByContact = buildConversationsByContact(conversations);
  const rows = filteredContacts.map((contact) =>
    buildLeadSummaryRow(contact, conversationsByContact.get(readString(contact, ["id"]) ?? "")),
  );
  const accessIssues = [
    ...contactResults.map((result) => result.issue),
    conversationsResult.issue,
  ].filter((issue): issue is MissionControlAccessIssue => Boolean(issue));
  const possibleLocationMismatch =
    totalContacts > DOCTOR_DAMP_EXPECTED_MAX_CONTACTS;
  const hasAccessIssue = accessIssues.length > 0;

  return {
    accountName: LEAD_ACCOUNT_NAME,
    generatedAt: new Date().toISOString(),
    totalContacts,
    fetchedContacts: filteredContacts.length,
    enrichedContacts: rows.filter((row) => row.conversations.length > 0).length,
    possibleLocationMismatch,
    newestLeadAt: rows[0]?.dateAdded,
    sourceBreakdown: buildLeadBreakdown(rows, "source", "Unknown source").slice(0, 8),
    tagBreakdown: buildTagBreakdown(rows).slice(0, 12),
    leads: rows,
    accessIssues,
    notes: [
      hasAccessIssue
        ? `The current HighLevel token cannot read Doctor Damp location ${doctorDampLocationId}. Install or use a Private Integration token that has access to that sub-account.`
        : undefined,
      possibleLocationMismatch
        ? `HighLevel reports ${totalContacts.toLocaleString()} contacts for Doctor Damp location ${doctorDampLocationId}. That is higher than expected, so this section only shows leads added since March 1, 2026.`
        : `HighLevel reports ${totalContacts.toLocaleString()} contacts in Doctor Damp. This section shows leads added since March 1, 2026 and enriches leads that appear in the recent conversation sample.`,
      "Address and location fields appear only when HighLevel has them on the contact record.",
      "This panel is intentionally capped for Doctor Damp so it cannot overload the dashboard if the env points at the wrong sub-account.",
    ].filter((note): note is string => Boolean(note)),
  };
}

export async function getDoctorDampWorkflowIntelligenceSnapshot(
  leadSummary?: LeadSummarySnapshot | null,
): Promise<WorkflowIntelligenceSnapshot> {
  const config = getGhlConfig();
  const doctorDampLocationId =
    config.doctorDampLocationId ?? DEFAULT_DOCTOR_DAMP_LOCATION_ID;
  const doctorDampApiKey = config.doctorDampApiKey ?? config.apiKey;
  const workflowsResult = await loadSource("doctorDampWorkflows", () =>
    listWorkflowsForLocation(doctorDampLocationId, doctorDampApiKey),
  );
  const workflows = getRecords(workflowsResult.data, "workflows");
  const rows = workflows
    .map((workflow, index) =>
      buildWorkflowIntelligenceRow(
        workflow,
        index,
        leadSummary?.tagBreakdown.map((tag) => tag.tag) ?? [],
      ),
    )
    .sort((a, b) => compareWorkflowRows(a, b));
  const statusCounts = countBy(rows, (row) => row.status || "unknown");
  const categoryCounts = countBy(rows, (row) => row.category);
  const accessIssues = [workflowsResult.issue].filter(
    (issue): issue is MissionControlAccessIssue => Boolean(issue),
  );

  return {
    accountName: LEAD_ACCOUNT_NAME,
    generatedAt: new Date().toISOString(),
    totalWorkflows: rows.length,
    publishedCount: rows.filter((row) => row.status === "published").length,
    draftCount: rows.filter((row) => row.status === "draft").length,
    recentlyUpdatedCount: rows.filter(
      (row) => (daysSince(row.updatedAt) ?? Number.POSITIVE_INFINITY) <= 30,
    ).length,
    categoryBreakdown: workflowCategoryOrder
      .map((category) => ({
        category,
        count: categoryCounts.get(category) ?? 0,
      }))
      .filter((row) => row.count > 0),
    statusBreakdown: [...statusCounts.entries()].map(([status, count]) => ({
      status,
      count,
    })),
    workflows: rows,
    priorityReviews: rows
      .filter((row) => row.riskLevel !== "low")
      .slice(0, 10),
    accessIssues,
    notes: [
      "Workflow intelligence is read-only and uses the official workflow list endpoint exposed to this token.",
      "Categories are inferred from workflow names, status, version, and matching lead tags. We can deepen this later if a detail endpoint exposes individual workflow steps.",
      accessIssues.length
        ? "The Doctor Damp token cannot read workflows yet. Check workflow/private integration scopes for the sub-account."
        : undefined,
    ].filter((note): note is string => Boolean(note)),
  };
}

export async function getCommissionTrackerSnapshot(): Promise<CommissionTrackerSnapshot> {
  const configs = loadCommissionClientConfigs();
  const clientSnapshots = await Promise.all(
    configs.map((config) => buildCommissionClientSnapshot(config)),
  );
  const accessIssues = clientSnapshots.flatMap((client) => client.accessIssues);
  const ledger = mergeLedger(clientSnapshots.flatMap((client) => client.ledger));

  return {
    accountName: COMMISSION_ACCOUNT_NAME,
    generatedAt: new Date().toISOString(),
    clientCount: clientSnapshots.length,
    totalCollected: sum(clientSnapshots, "totalCollected"),
    totalExcluded: sum(clientSnapshots, "totalExcluded"),
    totalCommissionEarned: sum(clientSnapshots, "commissionEarned"),
    setupCommissionEarned: sum(clientSnapshots, "setupCommissionEarned"),
    recurringCommissionEarned: sum(clientSnapshots, "recurringCommissionEarned"),
    outstandingSetupCommission: sum(clientSnapshots, "outstandingSetupCommission"),
    failedPaymentAmount: sum(clientSnapshots, "totalFailed"),
    failedPaymentCount: clientSnapshots.reduce(
      (total, client) => total + client.failedTransactionCount,
      0,
    ),
    attentionCount: clientSnapshots.filter((client) => client.status === "attention")
      .length,
    activeSubscriptionCount: clientSnapshots.reduce(
      (total, client) => total + client.activeSubscriptionCount,
      0,
    ),
    clients: clientSnapshots,
    ledger,
    accessIssues,
    notes: [
      "This module reads live RT Digital GHL payments and combines them with local commission terms.",
      "Commission figures exclude HighLevel wallet auto-recharges and other non-client charges.",
      "Commission figures do not yet track whether RT Digital has paid that commission onward.",
      "Google Sheets should become the source of truth once these fields feel right.",
    ],
  };
}

async function buildCommissionClientSnapshot(
  config: CommissionClientConfig,
): Promise<CommissionClientSnapshot> {
  const apiKey = config.apiKeyEnvVar ? (process.env[config.apiKeyEnvVar] ?? "") : "";
  const locationId = config.locationId ?? "";

  const [transactionsResult, ordersResult, subscriptionsResult, invoicesResult] =
    await Promise.all([
      loadSource(`${config.id}:transactions`, () =>
        listPaymentTransactionsForClient(locationId, apiKey),
      ),
      loadSource(`${config.id}:orders`, () =>
        listPaymentOrdersForClient(locationId, apiKey),
      ),
      loadSource(`${config.id}:subscriptions`, () =>
        listPaymentSubscriptionsForClient(locationId, apiKey),
      ),
      loadSource(`${config.id}:invoices`, () =>
        listInvoicesForClient(locationId, apiKey),
      ),
    ]);
  const transactions = getRecords(transactionsResult.data, "data");
  const orders = getRecords(ordersResult.data, "data");
  const subscriptions = getRecords(subscriptionsResult.data, "data");
  const invoices = getRecords(invoicesResult.data, "invoices");
  const successfulTransactions = transactions.filter(
    (transaction) => readString(transaction, ["status"])?.toLowerCase() === "succeeded",
  );
  const failedTransactions = transactions.filter(
    (transaction) => readString(transaction, ["status"])?.toLowerCase() === "failed",
  );
  const paidOrders = orders.filter((order) =>
    ["paid", "completed", "succeeded"].some((status) =>
      `${readString(order, ["paymentStatus"]) ?? ""} ${readString(order, ["status"]) ?? ""}`
        .toLowerCase()
        .includes(status),
    ),
  );
  const activeSubscriptions = subscriptions.filter(
    (subscription) =>
      readString(subscription, ["status"])?.toLowerCase() === "active",
  );
  const commissionableSuccessfulTransactions = successfulTransactions.filter(
    isCommissionablePayment,
  );
  const excludedSuccessfulTransactions = successfulTransactions.filter(
    (transaction) => !isCommissionablePayment(transaction),
  );
  const totalCollected = sumAmounts(commissionableSuccessfulTransactions);
  const totalExcluded = sumAmounts(excludedSuccessfulTransactions);
  const totalFailed = sumAmounts(failedTransactions);
  const orderSetupCollected = sumAmounts(paidOrders);
  const setupCollected = config.setupFee
    ? Math.min(
        totalCollected,
        orderSetupCollected > 0 ? orderSetupCollected : config.setupFee,
      )
    : 0;
  const recurringCollected = Math.max(0, totalCollected - setupCollected);
  const expectedSetupCommission = config.setupFee * config.commissionRate;
  const expectedMonthlyCommission = config.monthlySaasFee * config.commissionRate;
  const setupCommissionEarned = setupCollected * config.commissionRate;
  const recurringCommissionEarned = recurringCollected * config.commissionRate;
  const commissionEarned = setupCommissionEarned + recurringCommissionEarned;
  const outstandingSetupCommission = Math.max(
    0,
    expectedSetupCommission - setupCommissionEarned,
  );
  const payments = [
    ...commissionableSuccessfulTransactions.map((transaction) =>
      buildPaymentRow(transaction, "transaction"),
    ),
    ...excludedSuccessfulTransactions.map((transaction) =>
      buildPaymentRow(transaction, "transaction"),
    ),
    ...failedTransactions.map((transaction) =>
      buildPaymentRow(transaction, "transaction"),
    ),
    ...paidOrders.map((order) => buildPaymentRow(order, "order")),
    ...activeSubscriptions.map((subscription) =>
      buildPaymentRow(subscription, "subscription"),
    ),
  ].sort((a, b) => compareDateDesc(a.createdAt, b.createdAt));
  const status = determineCommissionStatus({
    configuredStatus: config.status,
    totalCollected,
    failedCount: failedTransactions.length,
    activeSubscriptionCount: activeSubscriptions.length,
    setupFee: config.setupFee,
    monthlySaasFee: config.monthlySaasFee,
  });
  const accessIssues = [
    transactionsResult.issue,
    ordersResult.issue,
    subscriptionsResult.issue,
    invoicesResult.issue,
  ].filter((issue): issue is MissionControlAccessIssue => Boolean(issue));

  return {
    id: config.id,
    name: config.name,
    accountName: config.accountName ?? config.name,
    locationId: config.locationId,
    status,
    commissionRate: config.commissionRate,
    setupFee: config.setupFee,
    monthlySaasFee: config.monthlySaasFee,
    expectedSetupCommission,
    expectedMonthlyCommission,
    setupCollected,
    recurringCollected,
    totalCollected,
    totalExcluded,
    totalFailed,
    commissionEarned,
    setupCommissionEarned,
    recurringCommissionEarned,
    outstandingSetupCommission,
    transactionCount: transactions.length,
    successfulTransactionCount: commissionableSuccessfulTransactions.length,
    excludedTransactionCount: excludedSuccessfulTransactions.length,
    failedTransactionCount: failedTransactions.length,
    orderCount: orders.length,
    activeSubscriptionCount: activeSubscriptions.length,
    invoiceCount: invoices.length,
    latestPaymentAt: payments[0]?.createdAt,
    payments: payments.slice(0, 12),
    ledger: buildCommissionLedger(
      commissionableSuccessfulTransactions,
      config.commissionRate,
    ),
    notes: config.notes ?? [],
    accessIssues,
  };
}

export async function getMissionControlSnapshot(): Promise<MissionControlSnapshot> {
  const [pipelinesResult, opportunitiesResult, conversationsResult, calendarsResult] =
    await Promise.all([
      loadSource("pipelines", listPipelines),
      loadSource("opportunities", () =>
        listOpportunities({ limit: DEFAULT_OPPORTUNITY_LIMIT }),
      ),
      loadSource("conversations", () =>
        listConversations({ limit: DEFAULT_CONVERSATION_LIMIT }),
      ),
      loadSource("calendars", listCalendars),
    ]);

  const pipelines = getRecords(pipelinesResult.data, "pipelines");
  const activeClientPipeline = findPipeline(pipelines, "active clients");
  const activeClientOpportunitiesResult = activeClientPipeline
    ? await loadSource("activeClients", () =>
        listOpportunities({
          limit: DEFAULT_OPPORTUNITY_LIMIT,
          pipelineId: readString(activeClientPipeline, ["id"]),
        }),
      )
    : ({ data: undefined } satisfies SourceResult<ListOpportunitiesResponse>);
  const opportunities = getRecords(opportunitiesResult.data, "opportunities");
  const activeClientOpportunities = getRecords(
    activeClientOpportunitiesResult.data,
    "opportunities",
  );
  const conversations = getRecords(conversationsResult.data, "conversations");
  const calendars = getRecords(calendarsResult.data, "calendars");
  const aiAgentEffectiveness = await getAiAgentEffectivenessSnapshot(conversations);
  const leadSummaryResult = await loadSource("leadSummary", getLeadSummarySnapshot);
  const workflowIntelligenceResult = await loadSource("workflowIntelligence", () =>
    getDoctorDampWorkflowIntelligenceSnapshot(leadSummaryResult.data ?? null),
  );
  const stageLookup = buildStageLookup(pipelines);
  const pipelineStages = buildPipelineStageBreakdown(opportunities, stageLookup);
  const dashboardOpportunities = buildDashboardOpportunities(
    opportunities,
    stageLookup,
  );
  const recentOpportunities = dashboardOpportunities.slice(0, 10);
  const opportunitiesByStage = buildOpportunitiesByStage(dashboardOpportunities);
  const activeClients = buildActiveClientsSnapshot(
    activeClientPipeline,
    activeClientOpportunities,
    stageLookup,
  );
  const recentConversations = buildRecentConversations(conversations);
  const dashboardCalendars = buildDashboardCalendars(calendars);
  const followUps = buildFollowUps(recentOpportunities, recentConversations);
  const accessIssues = [
    pipelinesResult.issue,
    opportunitiesResult.issue,
    activeClientOpportunitiesResult.issue,
    conversationsResult.issue,
    calendarsResult.issue,
    ...aiAgentEffectiveness.accessIssues,
    leadSummaryResult.issue,
    ...(leadSummaryResult.data?.accessIssues ?? []),
    workflowIntelligenceResult.issue,
    ...(workflowIntelligenceResult.data?.accessIssues ?? []),
  ].filter((issue): issue is MissionControlAccessIssue => Boolean(issue));

  return {
    generatedAt: new Date().toISOString(),
    kpis: buildKpis({
      pipelines,
      opportunities,
      conversations,
      calendars,
      followUps,
      pipelineStageCount: stageLookup.size,
      activeClients,
    }),
    pipelineStages,
    opportunitiesByStage,
    activeClients,
    aiAgentEffectiveness,
    leadSummary: leadSummaryResult.data ?? null,
    workflowIntelligence: workflowIntelligenceResult.data ?? null,
    recentOpportunities,
    recentConversations,
    calendars: dashboardCalendars,
    followUps,
    accessIssues,
    notes: [
      "Opportunity and conversation metrics are based on the latest API sample fetched for this dashboard.",
      "HighLevel did not expose a working location-level Tasks endpoint for this token/API version, so follow-ups are inferred from unread conversations and open opportunities without recent status movement.",
    ],
  };
}

async function loadSource<T>(
  source: MissionControlAccessIssue["source"],
  loader: () => Promise<T>,
): Promise<SourceResult<T>> {
  try {
    return { data: await loader() };
  } catch (error) {
    return { issue: toAccessIssue(source, error) };
  }
}

function toAccessIssue(
  source: MissionControlAccessIssue["source"],
  error: unknown,
): MissionControlAccessIssue {
  if (error instanceof GhlApiError) {
    return {
      source,
      message: error.message,
      status: error.status,
      path: error.path,
    };
  }

  return {
    source,
    message: error instanceof Error ? error.message : "Unknown error",
  };
}

function buildKpis(input: {
  pipelines: GhlRecord[];
  opportunities: GhlRecord[];
  conversations: GhlRecord[];
  calendars: GhlRecord[];
  followUps: MissionControlFollowUp[];
  pipelineStageCount: number;
  activeClients: MissionControlActiveClients | null;
}): MissionControlKpis {
  const openOpportunityCount = input.opportunities.filter(
    (opportunity) => getStatus(opportunity) === "open",
  ).length;
  const wonOpportunityCount = input.opportunities.filter(
    (opportunity) => getStatus(opportunity) === "won",
  ).length;
  const sampledOpportunityValue = input.opportunities.reduce(
    (sum, opportunity) => sum + readNumber(opportunity, ["monetaryValue"], 0),
    0,
  );
  const unreadConversationCount = input.conversations.reduce(
    (sum, conversation) => sum + readNumber(conversation, ["unreadCount"], 0),
    0,
  );
  const activeCalendarCount = input.calendars.filter(
    (calendar) => readBoolean(calendar, ["isActive"], true),
  ).length;

  return {
    pipelineCount: input.pipelines.length,
    pipelineStageCount: input.pipelineStageCount,
    sampledOpportunityCount: input.opportunities.length,
    openOpportunityCount,
    wonOpportunityCount,
    sampledOpportunityValue,
    sampledConversationCount: input.conversations.length,
    unreadConversationCount,
    calendarCount: input.calendars.length,
    activeCalendarCount,
    followUpCandidateCount: input.followUps.length,
    activeClientCount: input.activeClients?.sampledOpportunityCount ?? 0,
    urgentClientCount: input.activeClients?.urgentCount ?? 0,
    pausedClientCount: input.activeClients?.pausedCount ?? 0,
  };
}

function buildStageLookup(pipelines: GhlRecord[]) {
  const stages = new Map<string, StageLookup>();

  for (const pipeline of pipelines) {
    const pipelineId = readString(pipeline, ["id"]) ?? "unknown-pipeline";
    const pipelineName = readString(pipeline, ["name"]) ?? "Unknown pipeline";

    for (const stage of getRecords(pipeline, "stages")) {
      const stageId = readString(stage, ["id"]);

      if (!stageId) {
        continue;
      }

      stages.set(stageId, {
        stageId,
        stageName: readString(stage, ["name"]) ?? "Unnamed stage",
        pipelineId,
        pipelineName,
      });
    }
  }

  return stages;
}

function buildPipelineStageBreakdown(
  opportunities: GhlRecord[],
  stageLookup: Map<string, StageLookup>,
): MissionControlStage[] {
  const breakdown = new Map<string, MissionControlStage>();

  for (const opportunity of opportunities) {
    const stageId =
      readString(opportunity, ["pipelineStageId", "pipelineStageUId"]) ??
      "unknown-stage";
    const pipelineId = readString(opportunity, ["pipelineId"]) ?? "unknown-pipeline";
    const stage = stageLookup.get(stageId);
    const key = `${pipelineId}:${stageId}`;
    const current =
      breakdown.get(key) ??
      ({
        stageId,
        stageName: stage?.stageName ?? "Unknown stage",
        pipelineId,
        pipelineName: stage?.pipelineName ?? "Unknown pipeline",
        count: 0,
        value: 0,
      } satisfies MissionControlStage);

    current.count += 1;
    current.value += readNumber(opportunity, ["monetaryValue"], 0);
    breakdown.set(key, current);
  }

  return Array.from(breakdown.values())
    .sort((a, b) => b.count - a.count || b.value - a.value)
    .slice(0, 12);
}

function buildDashboardOpportunities(
  opportunities: GhlRecord[],
  stageLookup: Map<string, StageLookup>,
): MissionControlOpportunity[] {
  return opportunities
    .map((opportunity, index) => {
      const id = readString(opportunity, ["id"]) ?? `opportunity-${index}`;
      const stageId =
        readString(opportunity, ["pipelineStageId", "pipelineStageUId"]) ??
        "unknown-stage";
      const stage = stageLookup.get(stageId);
      const pipelineId =
        readString(opportunity, ["pipelineId"]) ??
        stage?.pipelineId ??
        "unknown-pipeline";
      const createdAt = readString(opportunity, ["createdAt"]);
      const updatedAt = readString(opportunity, [
        "updatedAt",
        "lastStatusChangeAt",
        "createdAt",
      ]);
      const lastStageChangeAt = readString(opportunity, [
        "lastStageChangeAt",
        "updatedAt",
        "createdAt",
      ]);
      const lastStatusChangeAt = readString(opportunity, [
        "lastStatusChangeAt",
        "lastStageChangeAt",
        "updatedAt",
        "createdAt",
      ]);
      const statusChangedAt = readString(opportunity, [
        "lastStatusChangeAt",
        "lastStageChangeAt",
        "updatedAt",
        "createdAt",
      ]);

      return {
        id,
        contactId: readString(opportunity, ["contactId"]),
        name: readString(opportunity, ["name"]) ?? "Untitled opportunity",
        status: getStatus(opportunity),
        value: readNumber(opportunity, ["monetaryValue"], 0),
        pipelineId,
        pipelineName: stage?.pipelineName ?? "Unknown pipeline",
        stageId,
        stageName: stage?.stageName ?? "Unknown stage",
        contactName: readPathString(opportunity, [
          "contact.name",
          "contact.fullName",
          "contact.contactName",
        ]),
        assignedTo: readString(opportunity, ["assignedTo"]),
        source: readString(opportunity, ["source"]),
        tags: readPathStringArray(opportunity, [
          "contact.tags",
          "tags",
        ]),
        createdAt,
        updatedAt,
        lastStageChangeAt,
        lastStatusChangeAt,
        daysSinceStatusChange: daysSince(statusChangedAt),
        daysSinceStageChange: daysSince(lastStageChangeAt),
      };
    })
    .sort((a, b) => compareDateDesc(a.updatedAt, b.updatedAt));
}

function buildOpportunitiesByStage(opportunities: MissionControlOpportunity[]) {
  return opportunities.reduce<Record<string, MissionControlOpportunity[]>>(
    (byStage, opportunity) => {
      const key = stageKey(opportunity.pipelineId, opportunity.stageId);
      byStage[key] ??= [];

      if (byStage[key].length < 25) {
        byStage[key].push(opportunity);
      }

      return byStage;
    },
    {},
  );
}

function buildActiveClientsSnapshot(
  activeClientPipeline: GhlRecord | undefined,
  opportunities: GhlRecord[],
  stageLookup: Map<string, StageLookup>,
): MissionControlActiveClients | null {
  if (!activeClientPipeline) {
    return null;
  }

  const pipelineId =
    readString(activeClientPipeline, ["id"]) ?? "active-clients-pipeline";
  const pipelineName =
    readString(activeClientPipeline, ["name"]) ?? "Active Clients";
  const dashboardOpportunities = buildDashboardOpportunities(
    opportunities,
    stageLookup,
  );
  const stageRows = getRecords(activeClientPipeline, "stages").map((stage) => {
    const stageId = readString(stage, ["id"]) ?? "unknown-stage";

    return {
      stageId,
      stageName: readString(stage, ["name"]) ?? "Unknown stage",
      pipelineId,
      pipelineName,
      count: 0,
      value: 0,
    } satisfies MissionControlStage;
  });
  const stageRowsById = new Map(stageRows.map((stage) => [stage.stageId, stage]));

  for (const opportunity of dashboardOpportunities) {
    const stage = stageRowsById.get(opportunity.stageId);

    if (!stage) {
      continue;
    }

    stage.count += 1;
    stage.value += opportunity.value;
  }

  const lowerStageCount = (pattern: string) =>
    stageRows
      .filter((stage) => stage.stageName.toLowerCase().includes(pattern))
      .reduce((sum, stage) => sum + stage.count, 0);

  return {
    pipelineId,
    pipelineName,
    sampledOpportunityCount: dashboardOpportunities.length,
    sampledValue: dashboardOpportunities.reduce(
      (sum, opportunity) => sum + opportunity.value,
      0,
    ),
    urgentCount: lowerStageCount("urgent"),
    onboardingCount: lowerStageCount("onboarding"),
    pausedCount: lowerStageCount("paused"),
    exitingOrCancelledCount:
      lowerStageCount("exiting") + lowerStageCount("cancelled"),
    stages: stageRows,
    opportunitiesByStage: buildOpportunitiesByStage(dashboardOpportunities),
    opportunities: dashboardOpportunities,
    recentOpportunities: dashboardOpportunities.slice(0, 8),
  };
}

function buildRecentConversations(
  conversations: GhlRecord[],
): MissionControlConversation[] {
  return conversations
    .map((conversation, index) => ({
      id: readString(conversation, ["id"]) ?? `conversation-${index}`,
      contactName:
        readString(conversation, ["contactName", "fullName", "companyName"]) ??
        "Unknown contact",
      channel: readString(conversation, ["type", "lastMessageType"]),
      direction: readString(conversation, ["lastMessageDirection"]),
      unreadCount: readNumber(conversation, ["unreadCount"], 0),
      lastMessageAt: readDateString(conversation, [
        "lastMessageDate",
        "dateUpdated",
        "dateAdded",
      ]),
    }))
    .sort((a, b) => compareDateDesc(a.lastMessageAt, b.lastMessageAt))
    .slice(0, 10);
}

function buildAiAgentConversationInsight(
  conversation: GhlRecord,
  messageSource: ListConversationMessagesResponse | undefined,
): AiAgentConversationInsight {
  const id = readString(conversation, ["id"]) ?? "unknown-conversation";
  const contactName =
    readString(conversation, ["contactName", "fullName", "companyName"]) ??
    "Unknown contact";
  const channel =
    readString(conversation, ["type", "lastMessageType"]) ?? "Unknown";
  const lastMessageAt = readConversationDate(conversation);
  const tags = readStringArray(conversation, ["tags"]);
  const action = readString(conversation, ["lastOutboundMessageAction"]);
  const messages = buildAiAgentMessages(conversation, messageSource);
  const inboundMessages = messages.filter(
    (message) => message.direction?.toLowerCase() === "inbound",
  );
  const outboundMessages = messages.filter(
    (message) => message.direction?.toLowerCase() === "outbound",
  );
  const automatedOutboundCount = outboundMessages.filter((message) =>
    isAutomatedOutbound(message, action),
  ).length;
  const agentLikeOutboundCount = outboundMessages.filter((message) =>
    isAgentLikeOutbound(message, action, tags),
  ).length;
  const callCount =
    messages.filter((message) => message.messageType === "TYPE_CALL").length ||
    (readString(conversation, ["lastMessageType"]) === "TYPE_CALL" ? 1 : 0);
  const inboundText = inboundMessages.map((message) => message.body).join(" ");
  const allText = [inboundText, tags.join(" ")].filter(Boolean).join(" ");
  const sentimentScore = scoreSentiment(allText);
  const sentiment = sentimentFromScore(sentimentScore);
  const intent = classifyIntent({
    tags,
    text: allText,
    responded: inboundMessages.length > 0,
    sentiment,
    agentLikeOutboundCount,
  });
  const responseQualityScore = scoreConversationQuality({
    responded: inboundMessages.length > 0,
    sentiment,
    intent,
    agentLikeOutboundCount,
  });
  const riskLevel =
    intent === "handoff" || sentiment === "negative"
      ? "high"
      : intent === "no_response"
        ? "medium"
        : "low";
  const evidence = buildEvidence(messages, conversation);
  const signalTags = tags
    .filter((tag) =>
      /ai|appointment|book|repl|kill|stop|respond|nurture/i.test(tag),
    )
    .slice(0, 5);

  return {
    id,
    contactName,
    channel,
    lastMessageAt,
    messagesAnalyzed: messages.length,
    inboundCount: inboundMessages.length,
    outboundCount: outboundMessages.length,
    automatedOutboundCount,
    agentLikeOutboundCount,
    callCount,
    responseQualityScore,
    sentiment,
    sentimentScore,
    intent,
    riskLevel,
    outcome: describeAiAgentOutcome({
      responded: inboundMessages.length > 0,
      intent,
      sentiment,
      callCount,
      agentLikeOutboundCount,
    }),
    evidence,
    tags: signalTags,
  };
}

function buildAiAgentEffectivenessSnapshot(
  conversationsFetched: number,
  conversations: AiAgentConversationInsight[],
  accessIssues: MissionControlAccessIssue[],
): AiAgentEffectivenessSnapshot {
  const agentTouched = conversations.filter(
    (conversation) => conversation.agentLikeOutboundCount > 0,
  );
  const denominator = Math.max(1, agentTouched.length);
  const responded = agentTouched.filter(
    (conversation) => conversation.inboundCount > 0,
  ).length;
  const positive = conversations.filter(
    (conversation) => conversation.sentiment === "positive",
  ).length;
  const neutral = conversations.filter(
    (conversation) => conversation.sentiment === "neutral",
  ).length;
  const negative = conversations.filter(
    (conversation) => conversation.sentiment === "negative",
  ).length;
  const bookingIntentCount = conversations.filter(
    (conversation) => conversation.intent === "booking",
  ).length;
  const objectionCount = conversations.filter(
    (conversation) => conversation.intent === "objection",
  ).length;
  const handoffOrStopCount = conversations.filter(
    (conversation) => conversation.intent === "handoff",
  ).length;
  const noResponseCount = agentTouched.filter(
    (conversation) => conversation.intent === "no_response",
  ).length;
  const responseRate = percentage(responded, denominator);
  const positiveSentimentShare = percentage(positive, conversations.length);
  const negativeSentimentShare = percentage(negative, conversations.length);
  const score = clampScore(
    45 +
      responseRate * 0.25 +
      positiveSentimentShare * 0.2 +
      bookingIntentCount * 4 -
      negativeSentimentShare * 0.35 -
      noResponseCount * 2 -
      handoffOrStopCount * 4,
  );

  return {
    accountName: AI_AGENT_ACCOUNT_NAME,
    generatedAt: new Date().toISOString(),
    score,
    verdict: describeAiAgentVerdict(score, {
      bookingIntentCount,
      negativeSentimentShare,
      responseRate,
    }),
    sample: {
      conversationsFetched,
      conversationsAnalyzed: conversations.length,
      messagesAnalyzed: conversations.reduce(
        (sum, conversation) => sum + conversation.messagesAnalyzed,
        0,
      ),
      agentLikeOutboundMessages: conversations.reduce(
        (sum, conversation) => sum + conversation.agentLikeOutboundCount,
        0,
      ),
      inboundReplies: conversations.reduce(
        (sum, conversation) => sum + conversation.inboundCount,
        0,
      ),
      callMessages: conversations.reduce(
        (sum, conversation) => sum + conversation.callCount,
        0,
      ),
    },
    kpis: {
      responseRate,
      positiveSentimentShare,
      negativeSentimentShare,
      bookingIntentCount,
      objectionCount,
      handoffOrStopCount,
      noResponseCount,
    },
    sentimentBreakdown: {
      positive,
      neutral,
      negative,
    },
    channelBreakdown: buildAiAgentChannelBreakdown(conversations),
    conversations: conversations
      .slice()
      .sort(
        (a, b) =>
          b.responseQualityScore - a.responseQualityScore ||
          compareDateDesc(a.lastMessageAt, b.lastMessageAt),
      ),
    accessIssues,
    notes: [
      "MVP scoring uses recent conversation/message samples from this RT Digital sub-account.",
      "Text, SMS, email, tags, automation/manual markers, and call message metadata are included. Call transcription can be layered in next through HighLevel's transcription endpoint.",
      "Scores are heuristic directional signals, not a substitute for human QA on individual conversations.",
    ],
  };
}

function buildAiAgentChannelBreakdown(
  conversations: AiAgentConversationInsight[],
): AiAgentChannelBreakdown[] {
  const byChannel = new Map<string, AiAgentChannelBreakdown>();

  for (const conversation of conversations) {
    const channel = conversation.channel ?? "Unknown";
    const current =
      byChannel.get(channel) ??
      ({
        channel,
        conversations: 0,
        messages: 0,
        positive: 0,
        neutral: 0,
        negative: 0,
      } satisfies AiAgentChannelBreakdown);

    current.conversations += 1;
    current.messages += conversation.messagesAnalyzed;
    current[conversation.sentiment] += 1;
    byChannel.set(channel, current);
  }

  return Array.from(byChannel.values()).sort(
    (a, b) => b.conversations - a.conversations || b.messages - a.messages,
  );
}

function buildConversationsByContact(conversations: GhlRecord[]) {
  const byContact = new Map<string, GhlRecord[]>();

  for (const conversation of conversations.slice(0, LEAD_ENRICH_LIMIT)) {
    const contactId = readString(conversation, ["contactId"]);

    if (!contactId) {
      continue;
    }

    byContact.set(contactId, [...(byContact.get(contactId) ?? []), conversation]);
  }

  for (const [contactId, rows] of byContact.entries()) {
    byContact.set(
      contactId,
      rows.sort((a, b) =>
        compareDateDesc(readConversationDate(a), readConversationDate(b)),
      ),
    );
  }

  return byContact;
}

function buildLeadSummaryRow(
  contact: GhlRecord,
  conversations: GhlRecord[] = [],
): LeadSummaryRow {
  const firstName = readString(contact, ["firstName", "firstNameRaw"]);
  const lastName = readString(contact, ["lastName", "lastNameRaw"]);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const name =
    readString(contact, ["contactName", "name", "fullName"]) ??
    (fullName || undefined) ??
    readString(contact, ["phone", "email"]) ??
    "Unknown lead";
  const tags = readStringArray(contact, ["tags"]);
  const source = readString(contact, ["source"]);
  const address = formatAddress(contact);
  const conversationSummaries = conversations
    .slice(0, 3)
    .map<LeadConversationSummary>((conversation, index) => ({
      id: readString(conversation, ["id"]) ?? `conversation-${index}`,
      channel: readString(conversation, ["type", "lastMessageType"]),
      direction: readString(conversation, ["lastMessageDirection"]),
      lastMessageAt: readConversationDate(conversation),
      lastMessageSnippet: cleanText(
        readString(conversation, ["lastMessageBody"]) ?? "",
      ),
      unreadCount: readNumber(conversation, ["unreadCount"], 0),
    }));
  const statusSignals = buildLeadStatusSignals(tags, conversationSummaries);
  const customFieldHighlights = buildCustomFieldHighlights(contact);

  return {
    id: readString(contact, ["id"]) ?? "unknown-contact",
    name,
    companyName: readString(contact, ["companyName"]),
    email: readString(contact, ["email"]),
    phone: readString(contact, ["phone"]),
    source,
    address,
    city: readString(contact, ["city"]),
    state: readString(contact, ["state"]),
    country: readString(contact, ["country"]),
    postalCode: readString(contact, ["postalCode"]),
    dateAdded: readDateString(contact, ["dateAdded", "createdAt"]),
    dateUpdated: readDateString(contact, ["dateUpdated", "updatedAt"]),
    tags,
    customFieldHighlights,
    statusSignals,
    summary: describeLeadSummary({
      name,
      source,
      tags,
      address,
      conversations: conversationSummaries,
      customFieldHighlights,
    }),
    conversations: conversationSummaries,
  };
}

function isLeadSince(contact: GhlRecord, sinceIso: string) {
  const createdAt = readDateString(contact, ["dateAdded", "createdAt"]);

  if (!createdAt) {
    return false;
  }

  const createdTime = new Date(createdAt).getTime();
  const sinceTime = new Date(sinceIso).getTime();

  return !Number.isNaN(createdTime) && createdTime >= sinceTime;
}

function formatAddress(contact: GhlRecord) {
  const parts = [
    readString(contact, ["address1"]),
    readString(contact, ["city"]),
    readString(contact, ["state"]),
    readString(contact, ["postalCode"]),
    readString(contact, ["country"]),
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : undefined;
}

function buildLeadStatusSignals(
  tags: string[],
  conversations: LeadConversationSummary[],
) {
  const text = `${tags.join(" ")} ${conversations
    .map((conversation) => conversation.lastMessageSnippet ?? "")
    .join(" ")}`.toLowerCase();
  const signals: string[] = [];

  if (/book|appointment|calendar|meeting/.test(text)) {
    signals.push("Booked/appointment signal");
  }

  if (/replied|reply|responded/.test(text) || conversations.length > 0) {
    signals.push("Conversation activity");
  }

  if (/hot-lead|interested|qualified/.test(text)) {
    signals.push("High-intent lead");
  }

  if (/ai off|kill switch|stop|unsubscribe/.test(text)) {
    signals.push("AI stopped or needs human review");
  }

  if (/source: linkedin|linkedin/.test(text)) {
    signals.push("LinkedIn source");
  }

  if (/referral/.test(text)) {
    signals.push("Referral source");
  }

  return signals.slice(0, 4);
}

function buildCustomFieldHighlights(contact: GhlRecord) {
  const customFields = Array.isArray(contact.customFields)
    ? contact.customFields.filter(isRecord)
    : [];

  return customFields
    .map((field) => {
      const value = field.value ?? field.field_value;

      if (Array.isArray(value)) {
        return value.map(String).join(", ");
      }

      return typeof value === "string" || typeof value === "number"
        ? String(value)
        : "";
    })
    .map((value) => redactSnippet(value))
    .filter((value) => value.length > 0 && !value.includes("unsubscribe"))
    .slice(0, 4);
}

function describeLeadSummary(input: {
  name: string;
  source?: string;
  tags: string[];
  address?: string;
  conversations: LeadConversationSummary[];
  customFieldHighlights: string[];
}) {
  const fragments = [`${input.name} is a recent lead`];

  if (input.source) {
    fragments.push(`from ${input.source}`);
  }

  if (input.address) {
    fragments.push(`with location data on file`);
  }

  if (input.conversations.length > 0) {
    const latest = input.conversations[0];
    fragments.push(
      `latest conversation is ${latest.direction ?? "unknown direction"} via ${
        latest.channel ?? "unknown channel"
      }`,
    );
  }

  const usefulTags = input.tags
    .filter((tag) => /lead|book|reply|source|ai|referral|hot/i.test(tag))
    .slice(0, 3);

  if (usefulTags.length > 0) {
    fragments.push(`key tags: ${usefulTags.join(", ")}`);
  }

  if (input.customFieldHighlights.length > 0) {
    fragments.push(`notes: ${input.customFieldHighlights[0]}`);
  }

  return `${fragments.join("; ")}.`;
}

function buildLeadBreakdown(
  rows: LeadSummaryRow[],
  key: "source" | "country" | "state",
  fallback: string,
) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = row[key] || fallback;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}

function buildTagBreakdown(rows: LeadSummaryRow[]) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const tag of row.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function buildAiAgentMessages(
  conversation: GhlRecord,
  source: ListConversationMessagesResponse | undefined,
): AiAgentMessage[] {
  const messages = getMessageRecords(source)
    .map((message, index) => ({
      id: readString(message, ["id"]) ?? `message-${index}`,
      body: cleanText(readString(message, ["body", "message", "text"]) ?? ""),
      direction: readString(message, ["direction"]),
      source: readString(message, ["source"]),
      status: readString(message, ["status"]),
      messageType: readString(message, ["messageType"]),
      dateAdded: readDateString(message, ["dateAdded", "createdAt"]),
    }))
    .sort((a, b) => compareDateDesc(a.dateAdded, b.dateAdded))
    .slice(0, AI_AGENT_MESSAGE_LIMIT);

  if (messages.length > 0) {
    return messages;
  }

  const fallbackBody = cleanText(
    readString(conversation, ["lastMessageBody"]) ?? "",
  );

  if (!fallbackBody) {
    return [];
  }

  return [
    {
      id: readString(conversation, ["id"]) ?? "last-message",
      body: fallbackBody,
      direction: readString(conversation, ["lastMessageDirection"]),
      source: readString(conversation, ["lastOutboundMessageAction"]),
      status: undefined,
      messageType: readString(conversation, ["lastMessageType"]),
      dateAdded: readConversationDate(conversation),
    },
  ];
}

function getMessageRecords(source: unknown) {
  if (!isRecord(source)) {
    return [];
  }

  if (Array.isArray(source.messages)) {
    return source.messages.filter(isRecord);
  }

  if (isRecord(source.messages)) {
    return getRecords(source.messages, "messages");
  }

  return [];
}

function isAutomatedOutbound(message: AiAgentMessage, action: string | undefined) {
  return (
    message.direction?.toLowerCase() === "outbound" &&
    (message.source === "workflow" ||
      message.source === "bot" ||
      action === "automated")
  );
}

function isAgentLikeOutbound(
  message: AiAgentMessage,
  action: string | undefined,
  tags: string[],
) {
  const text = `${message.body} ${message.source ?? ""} ${tags.join(" ")}`;

  return (
    message.direction?.toLowerCase() === "outbound" &&
    (isAutomatedOutbound(message, action) ||
      /ai|agent|workflow|nurture|tradiephone|respond|missed call|demo/i.test(text))
  );
}

function scoreSentiment(text: string) {
  const normalized = text.toLowerCase();
  let score = 0;

  score += countMatches(normalized, [
    "yes",
    "interested",
    "keen",
    "sounds good",
    "book",
    "booked",
    "appointment",
    "meeting",
    "google meet",
    "thanks",
    "thank you",
    "great",
    "perfect",
    "please send",
    "call me",
  ]);
  score -= countMatches(normalized, [
    "not interested",
    "no thanks",
    "stop",
    "unsubscribe",
    "remove",
    "wrong number",
    "spam",
    "do not",
    "don't",
    "cancel",
    "kill switch",
    "ai off",
    "expensive",
    "already have",
    "too busy",
  ]);

  return Math.max(-5, Math.min(5, score));
}

function countMatches(text: string, phrases: string[]) {
  return phrases.reduce(
    (count, phrase) => count + (text.includes(phrase) ? 1 : 0),
    0,
  );
}

function sentimentFromScore(score: number): AiAgentSentiment {
  if (score > 0) {
    return "positive";
  }

  if (score < 0) {
    return "negative";
  }

  return "neutral";
}

function classifyIntent(input: {
  tags: string[];
  text: string;
  responded: boolean;
  sentiment: AiAgentSentiment;
  agentLikeOutboundCount: number;
}): AiAgentConversationInsight["intent"] {
  const text = `${input.text} ${input.tags.join(" ")}`.toLowerCase();

  if (/appointment|booked|booking|google meet|calendar|meeting/.test(text)) {
    return "booking";
  }

  if (/stop|unsubscribe|remove|kill switch|ai off|human|person/.test(text)) {
    return "handoff";
  }

  if (/not interested|no thanks|wrong number|expensive|already have|spam/.test(text)) {
    return "objection";
  }

  if (input.sentiment === "positive") {
    return "interested";
  }

  if (!input.responded && input.agentLikeOutboundCount > 0) {
    return "no_response";
  }

  return "neutral";
}

function scoreConversationQuality(input: {
  responded: boolean;
  sentiment: AiAgentSentiment;
  intent: AiAgentConversationInsight["intent"];
  agentLikeOutboundCount: number;
}) {
  let score = 50;

  if (input.agentLikeOutboundCount > 0) {
    score += 8;
  }

  score += input.responded ? 22 : -12;

  if (input.sentiment === "positive") {
    score += 15;
  }

  if (input.sentiment === "negative") {
    score -= 22;
  }

  if (input.intent === "booking") {
    score += 18;
  } else if (input.intent === "interested") {
    score += 8;
  } else if (input.intent === "handoff" || input.intent === "objection") {
    score -= 18;
  } else if (input.intent === "no_response") {
    score -= 12;
  }

  return clampScore(score);
}

function describeAiAgentOutcome(input: {
  responded: boolean;
  intent: AiAgentConversationInsight["intent"];
  sentiment: AiAgentSentiment;
  callCount: number;
  agentLikeOutboundCount: number;
}) {
  if (input.intent === "booking") {
    return "Booked or booking-intent signal found";
  }

  if (input.intent === "handoff") {
    return "Needs human review or stop/AI-off signal";
  }

  if (input.intent === "objection") {
    return "Objection or negative buying signal";
  }

  if (input.intent === "interested") {
    return "Positive or interested reply signal";
  }

  if (!input.responded && input.agentLikeOutboundCount > 0) {
    return "Agent touched, no prospect reply in sample";
  }

  if (input.callCount > 0) {
    return "Call activity present, transcript not scored yet";
  }

  return input.sentiment === "negative" ? "Review recommended" : "Neutral";
}

function describeAiAgentVerdict(
  score: number,
  input: {
    bookingIntentCount: number;
    negativeSentimentShare: number;
    responseRate: number;
  },
) {
  if (score >= 75) {
    return "Strong early signal: agents are creating useful replies and booking intent.";
  }

  if (score >= 60) {
    return "Promising: agents are generating engagement, with some conversations worth QA.";
  }

  if (input.bookingIntentCount > 0 && input.negativeSentimentShare < 25) {
    return "Mixed but useful: booking signals exist, but response quality needs review.";
  }

  if (input.responseRate < 15) {
    return "Thin signal: many agent touches have not produced replies in this sample yet.";
  }

  return "Needs QA: enough risk or low-quality signal to inspect conversation examples.";
}

function buildEvidence(messages: AiAgentMessage[], conversation: GhlRecord) {
  const snippets = messages
    .filter((message) => message.body.length > 0)
    .sort((a, b) => {
      if (a.direction !== b.direction) {
        return a.direction === "inbound" ? -1 : 1;
      }
      return compareDateDesc(a.dateAdded, b.dateAdded);
    })
    .map((message) => redactSnippet(message.body));
  const fallback = redactSnippet(readString(conversation, ["lastMessageBody"]) ?? "");

  return Array.from(new Set([...snippets, fallback].filter(Boolean))).slice(0, 3);
}

function redactSnippet(value: string) {
  return cleanText(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .slice(0, 180);
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }

  return Math.round((numerator / denominator) * 100);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildDashboardCalendars(calendars: GhlRecord[]): MissionControlCalendar[] {
  return calendars
    .map((calendar, index) => ({
      id: readString(calendar, ["id"]) ?? `calendar-${index}`,
      name: readString(calendar, ["name", "eventTitle"]) ?? "Untitled calendar",
      type: readString(calendar, ["calendarType", "eventType"]),
      isActive: readBoolean(calendar, ["isActive"], true),
    }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive))
    .slice(0, 12);
}

function buildFollowUps(
  opportunities: MissionControlOpportunity[],
  conversations: MissionControlConversation[],
): MissionControlFollowUp[] {
  const unreadConversationFollowUps = conversations
    .filter((conversation) => conversation.unreadCount > 0)
    .map<MissionControlFollowUp>((conversation) => ({
      id: conversation.id,
      type: "conversation",
      title: conversation.contactName,
      reason: `${conversation.unreadCount} unread message${
        conversation.unreadCount === 1 ? "" : "s"
      }`,
      updatedAt: conversation.lastMessageAt,
      priority: "high",
    }));
  const staleOpportunityFollowUps = opportunities
    .filter(
      (opportunity) =>
        opportunity.status === "open" &&
        (opportunity.daysSinceStatusChange ?? 0) >= STALE_OPPORTUNITY_DAYS,
    )
    .map<MissionControlFollowUp>((opportunity) => ({
      id: opportunity.id,
      type: "opportunity",
      title: opportunity.name,
      reason: `No status movement in ${opportunity.daysSinceStatusChange} days`,
      updatedAt: opportunity.updatedAt,
      priority: "medium",
    }));

  return [...unreadConversationFollowUps, ...staleOpportunityFollowUps]
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === "high" ? -1 : 1;
      }
      return compareDateDesc(a.updatedAt, b.updatedAt);
    })
    .slice(0, 10);
}

function buildContactDetail(source: unknown): ActiveClientDetailContact | null {
  const contact = isRecord(source) && isRecord(source.contact) ? source.contact : null;

  if (!contact) {
    return null;
  }

  const id = readString(contact, ["id", "contactId"]) ?? "unknown-contact";
  const name =
    (readString(contact, ["name", "fullName", "contactName"]) ??
      [readString(contact, ["firstName"]), readString(contact, ["lastName"])]
        .filter(Boolean)
        .join(" ")) ||
    "Unknown contact";

  return {
    id,
    name,
    email: readString(contact, ["email"]),
    phone: readString(contact, ["phone"]),
    source: readString(contact, ["source"]),
    assignedTo: readString(contact, ["assignedTo"]),
    tags: readStringArray(contact, ["tags"]),
    dateAdded: readString(contact, ["dateAdded", "createdAt"]),
    dateUpdated: readString(contact, ["dateUpdated", "updatedAt"]),
  };
}

function buildContactNotes(source: unknown): ActiveClientDetailNote[] {
  return getRecords(source, "notes")
    .map((note, index) => ({
      id: readString(note, ["id"]) ?? `note-${index}`,
      body: cleanText(readString(note, ["bodyText", "body"]) ?? ""),
      dateAdded: readString(note, ["dateAdded", "createdAt"]),
      userId: readString(note, ["userId"]),
      pinned: readBoolean(note, ["pinned"], false),
    }))
    .filter((note) => note.body.length > 0)
    .sort((a, b) => compareDateDesc(a.dateAdded, b.dateAdded))
    .slice(0, DETAIL_LIMIT);
}

function buildContactTasks(source: unknown): ActiveClientDetailTask[] {
  return getRecords(source, "tasks")
    .map((task, index) => ({
      id: readString(task, ["id"]) ?? `task-${index}`,
      title:
        (readString(task, ["title", "name", "subject"]) ??
          cleanText(readString(task, ["body", "description"]) ?? "")) ||
        "Untitled task",
      body: cleanText(readString(task, ["body", "description"]) ?? ""),
      status: readString(task, ["status"]),
      completed: readBoolean(task, ["completed", "isCompleted"], false),
      dueDate: readString(task, ["dueDate", "dueAt"]),
      dateAdded: readString(task, ["dateAdded", "createdAt"]),
      assignedTo: readString(task, ["assignedTo", "userId"]),
    }))
    .sort((a, b) => compareDateDesc(a.dueDate ?? a.dateAdded, b.dueDate ?? b.dateAdded))
    .slice(0, DETAIL_LIMIT);
}

function buildContactAppointments(
  source: unknown,
): ActiveClientDetailAppointment[] {
  return getRecords(source, "events")
    .map((event, index) => ({
      id: readString(event, ["id"]) ?? `appointment-${index}`,
      title: readString(event, ["title"]) ?? "Appointment",
      status: readString(event, ["appointmentStatus", "appoinmentStatus"]),
      startTime: readString(event, ["startTime"]),
      endTime: readString(event, ["endTime"]),
      calendarId: readString(event, ["calendarId"]),
    }))
    .sort((a, b) => compareDateDesc(a.startTime, b.startTime))
    .slice(0, DETAIL_LIMIT);
}

function buildContactConversations(
  source: unknown,
): ActiveClientDetailConversation[] {
  return getRecords(source, "conversations")
    .map((conversation, index) => ({
      id: readString(conversation, ["id"]) ?? `conversation-${index}`,
      contactName:
        readString(conversation, ["contactName", "fullName", "companyName"]) ??
        "Unknown contact",
      channel: readString(conversation, ["type", "lastMessageType"]),
      direction: readString(conversation, ["lastMessageDirection"]),
      unreadCount: readNumber(conversation, ["unreadCount"], 0),
      lastMessageAt: readDateString(conversation, [
        "lastMessageDate",
        "dateUpdated",
        "dateAdded",
      ]),
      lastMessageSnippet: cleanText(
        readString(conversation, ["lastMessageBody"]) ?? "",
      ),
    }))
    .sort((a, b) => compareDateDesc(a.lastMessageAt, b.lastMessageAt))
    .slice(0, DETAIL_LIMIT);
}

function loadCommissionClientConfigs(): CommissionClientConfig[] {
  const localPath = join(process.cwd(), "config", COMMISSION_CONFIG_FILE);

  try {
    const parsed = JSON.parse(readFileSync(localPath, "utf8")) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.filter(isCommissionClientConfig);
    }
  } catch {
    // local override not present — fall through to bundled config
  }

  if (Array.isArray(committedClientConfigs)) {
    return (committedClientConfigs as unknown[]).filter(isCommissionClientConfig);
  }

  return [];
}

function isCommissionClientConfig(
  value: unknown,
): value is CommissionClientConfig {
  if (!isRecord(value)) {
    return false;
  }

  return Boolean(
    readString(value, ["id"]) &&
      readString(value, ["name"]) &&
      readString(value, ["apiKeyEnvVar"]) &&
      typeof value.setupFee === "number" &&
      typeof value.monthlySaasFee === "number" &&
      typeof value.commissionRate === "number",
  );
}

function paymentQuery(locationId: string, contactId: string) {
  return {
    altId: locationId,
    altType: "location",
    contactId,
    limit: 100,
  };
}

function buildPaymentRow(
  record: GhlRecord,
  kind: CommissionPaymentRow["kind"],
): CommissionPaymentRow {
  const amount = readNumber(record, ["amount", "amountPaid", "total"], 0);
  const status = readString(record, ["status", "paymentStatus"]) ?? "unknown";
  const currency =
    readString(record, ["currency"])?.toUpperCase() ?? "AUD";
  const excludedReason = getPaymentExcludedReason(record);

  return {
    id: readString(record, ["id", "_id"]) ?? `${kind}-${status}-${amount}`,
    kind,
    status,
    amount,
    currency,
    createdAt: readDateString(record, ["createdAt", "dateAdded", "updatedAt"]),
    description: excludedReason
      ? "Wallet charge excluded"
      : describePaymentRow(kind, status),
    commissionable: !excludedReason,
    excludedReason,
  };
}

function isCommissionablePayment(record: GhlRecord) {
  return !getPaymentExcludedReason(record);
}

function getPaymentExcludedReason(record: GhlRecord) {
  const sourceSubType = readString(record, ["entitySourceSubType"])?.toLowerCase();
  const sourceName = readString(record, ["entitySourceName"])?.toLowerCase();
  const description = readString(record, [
    "entitySourceMeta",
    "description",
  ])?.toLowerCase();
  const haystack = [sourceSubType, sourceName, description].filter(Boolean).join(" ");

  if (
    sourceSubType === "saas_one_time" ||
    haystack.includes("auto-recharge") ||
    haystack.includes("wallet")
  ) {
    return "HighLevel wallet auto-recharge";
  }

  return undefined;
}

function describePaymentRow(kind: CommissionPaymentRow["kind"], status: string) {
  if (kind === "subscription") {
    return status === "active" ? "Active SaaS subscription" : "Subscription";
  }

  if (kind === "order") {
    return "Setup/order payment";
  }

  if (kind === "invoice") {
    return "Invoice";
  }

  return status === "succeeded" ? "Successful payment" : "Payment attempt";
}

function determineCommissionStatus(input: {
  configuredStatus?: string;
  totalCollected: number;
  failedCount: number;
  activeSubscriptionCount: number;
  setupFee: number;
  monthlySaasFee: number;
}): CommissionClientSnapshot["status"] {
  if (input.configuredStatus === "terms-needed") {
    return "terms-needed";
  }

  if (input.failedCount > 0) {
    return "attention";
  }

  if (input.totalCollected > 0 || input.activeSubscriptionCount > 0) {
    return "active";
  }

  if (input.setupFee === 0 && input.monthlySaasFee === 0) {
    return "terms-needed";
  }

  return "quiet";
}

function buildCommissionLedger(
  transactions: GhlRecord[],
  commissionRate: number,
): CommissionLedgerMonth[] {
  const months = new Map<string, CommissionLedgerMonth>();

  for (const transaction of transactions) {
    const date = readDateString(transaction, ["createdAt", "dateAdded", "updatedAt"]);
    const month = date ? date.slice(0, 7) : "unknown";
    const amount = readNumber(transaction, ["amount", "amountPaid", "total"], 0);
    const row = months.get(month) ?? {
      month,
      collected: 0,
      commission: 0,
      transactionCount: 0,
    };

    row.collected += amount;
    row.commission += amount * commissionRate;
    row.transactionCount += 1;
    months.set(month, row);
  }

  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

function mergeLedger(rows: CommissionLedgerMonth[]) {
  const months = new Map<string, CommissionLedgerMonth>();

  for (const row of rows) {
    const existing = months.get(row.month) ?? {
      month: row.month,
      collected: 0,
      commission: 0,
      transactionCount: 0,
    };

    existing.collected += row.collected;
    existing.commission += row.commission;
    existing.transactionCount += row.transactionCount;
    months.set(row.month, existing);
  }

  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

function sum<T>(rows: T[], key: keyof T) {
  return rows.reduce((total, row) => {
    const value = row[key];

    return total + (typeof value === "number" ? value : 0);
  }, 0);
}

function sumAmounts(records: GhlRecord[]) {
  return records.reduce(
    (total, record) =>
      total + readNumber(record, ["amount", "amountPaid", "total"], 0),
    0,
  );
}

function buildWorkflowIntelligenceRow(
  workflow: GhlRecord,
  index: number,
  leadTags: string[],
): WorkflowIntelligenceRow {
  const id = readString(workflow, ["id"]) ?? `workflow-${index}`;
  const name = readString(workflow, ["name"]) ?? "Untitled workflow";
  const status = (readString(workflow, ["status"]) ?? "unknown").toLowerCase();
  const category = inferWorkflowCategory(name);
  const signals = inferWorkflowSignals(name, status);
  const relatedLeadTags = findRelatedLeadTags(name, leadTags);
  const riskLevel = inferWorkflowRisk(name, status, category, relatedLeadTags);
  const version = readNumber(workflow, ["version"], 0);

  return {
    id,
    name,
    status,
    version: version || undefined,
    category,
    purpose: describeWorkflowPurpose(category, name, status),
    riskLevel,
    signals,
    relatedLeadTags,
    createdAt: readDateString(workflow, ["createdAt"]),
    updatedAt: readDateString(workflow, ["updatedAt"]),
  };
}

function inferWorkflowCategory(name: string): WorkflowCategory {
  const text = name.toLowerCase();

  if (/form|inbound|contact created|incoming call|lead form/.test(text)) {
    return "inbound";
  }

  if (/outbound|campaign/.test(text)) {
    return "outbound";
  }

  if (/nurture|followup|follow up|never replied|replied/.test(text)) {
    return "nurture";
  }

  if (/appointment|booking|booked|calendar|no show|reschedule/.test(text)) {
    return "appointment";
  }

  if (/pipeline|stage|quoted|opportunit/.test(text)) {
    return "pipeline";
  }

  if (/stop|bot|handoff|manual|aggression|remove from nurture/.test(text)) {
    return "handoff";
  }

  if (/estimate|pdf|quote/.test(text)) {
    return "estimate";
  }

  if (/notify|notification|slack|urgent/.test(text)) {
    return "notification";
  }

  return "other";
}

function inferWorkflowSignals(name: string, status: string) {
  const text = name.toLowerCase();
  const signals = new Set<string>();

  if (status === "draft") signals.add("Draft");
  if (status === "published") signals.add("Published");
  if (/ai|aiss|bot/.test(text)) signals.add("AI/automation");
  if (/inbound|form|incoming|contact created/.test(text)) signals.add("Lead entry");
  if (/sms|call|phone/.test(text)) signals.add("Phone/SMS");
  if (/email/.test(text)) signals.add("Email");
  if (/appointment|booking|calendar|no show|reschedule/.test(text)) {
    signals.add("Booking path");
  }
  if (/pipeline|stage|quoted|opportunit/.test(text)) signals.add("Pipeline movement");
  if (/stop|remove|manual|urgent|aggression|handoff/.test(text)) {
    signals.add("Human review");
  }

  return [...signals];
}

function findRelatedLeadTags(name: string, leadTags: string[]) {
  const words = new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((word) => word.length >= 4),
  );

  return leadTags
    .filter((tag) =>
      tag
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .some((part) => words.has(part)),
    )
    .slice(0, 6);
}

function inferWorkflowRisk(
  name: string,
  status: string,
  category: WorkflowCategory,
  relatedLeadTags: string[],
): WorkflowIntelligenceRow["riskLevel"] {
  const text = name.toLowerCase();

  if (
    status === "draft" &&
    ["inbound", "nurture", "appointment", "handoff"].includes(category)
  ) {
    return "high";
  }

  if (/urgent|manual|aggression|stop|no show/.test(text)) {
    return "medium";
  }

  if (relatedLeadTags.some((tag) => /ai off|stop|not-interested/i.test(tag))) {
    return "medium";
  }

  return "low";
}

function describeWorkflowPurpose(
  category: WorkflowCategory,
  name: string,
  status: string,
) {
  const statusText = status === "published" ? "active" : status;
  const cleanName = name.replace(/^\d+[a-z]?\.?\s*/i, "").trim();

  switch (category) {
    case "inbound":
      return `Captures or tags new lead entry points. Currently ${statusText}.`;
    case "outbound":
      return `Starts outbound campaign motion. Currently ${statusText}.`;
    case "nurture":
      return `Handles follow-up when leads have not replied or need more nurture. Currently ${statusText}.`;
    case "appointment":
      return `Manages bookings, reminders, no-shows, or reschedules. Currently ${statusText}.`;
    case "pipeline":
      return `Moves or labels opportunities as the sales pipeline changes. Currently ${statusText}.`;
    case "handoff":
      return `Stops automation or routes edge cases for human review. Currently ${statusText}.`;
    case "estimate":
      return `Supports quote or estimate handling. Currently ${statusText}.`;
    case "notification":
      return `Notifies internal users or channels about lead events. Currently ${statusText}.`;
    default:
      return `${cleanName || "Workflow"} needs review to clarify business purpose.`;
  }
}

function compareWorkflowRows(
  left: WorkflowIntelligenceRow,
  right: WorkflowIntelligenceRow,
) {
  const riskWeight = { high: 0, medium: 1, low: 2 };

  return (
    riskWeight[left.riskLevel] - riskWeight[right.riskLevel] ||
    workflowCategoryOrder.indexOf(left.category) -
      workflowCategoryOrder.indexOf(right.category) ||
    compareDateDesc(left.updatedAt, right.updatedAt) ||
    left.name.localeCompare(right.name)
  );
}

function countBy<T, TKey extends string>(
  rows: T[],
  keyFn: (row: T) => TKey,
) {
  const counts = new Map<TKey, number>();

  for (const row of rows) {
    const key = keyFn(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function getRecords(source: unknown, key: string) {
  if (isRecord(source)) {
    const value = source[key];
    return Array.isArray(value) ? value.filter(isRecord) : [];
  }

  return [];
}

function findPipeline(pipelines: GhlRecord[], nameIncludes: string) {
  const needle = nameIncludes.toLowerCase();

  return pipelines.find((pipeline) =>
    (readString(pipeline, ["name"]) ?? "").toLowerCase().includes(needle),
  );
}

function readString(record: GhlRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function readDateString(record: GhlRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return new Date(value).toISOString();
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const trimmed = value.trim();
      const numeric = Number(trimmed);

      if (Number.isFinite(numeric) && trimmed.length >= 10) {
        return new Date(numeric).toISOString();
      }

      return trimmed;
    }
  }

  return undefined;
}

function readConversationDate(conversation: GhlRecord) {
  return readDateString(conversation, [
    "lastMessageDate",
    "dateUpdated",
    "dateAdded",
  ]);
}

function readPathString(record: GhlRecord, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!isRecord(current)) {
        return undefined;
      }

      return current[key];
    }, record);

    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function readStringArray(record: GhlRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const values = toStringArray(value);

    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

function readPathStringArray(record: GhlRecord, paths: string[]) {
  for (const path of paths) {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!isRecord(current)) {
        return undefined;
      }

      return current[key];
    }, record);
    const values = toStringArray(value);

    if (values.length > 0) {
      return values;
    }
  }

  return [];
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function readNumber(record: GhlRecord, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function readBoolean(record: GhlRecord, keys: string[], fallback: boolean) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return fallback;
}

function cleanText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function getStatus(opportunity: GhlRecord) {
  return (readString(opportunity, ["status"]) ?? "unknown").toLowerCase();
}

function stageKey(pipelineId: string, stageId: string) {
  return `${pipelineId}:${stageId}`;
}

function isRecord(value: unknown): value is GhlRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareDateDesc(left: string | undefined, right: string | undefined) {
  return dateMs(right) - dateMs(left);
}

function daysSince(value: string | undefined) {
  const ms = dateMs(value);

  if (!ms) {
    return undefined;
  }

  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

function dateMs(value: string | undefined) {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampLimit(value: number | undefined, fallback: number) {
  if (!value || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}
