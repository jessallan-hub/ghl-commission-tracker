export type JsonObject = Record<string, unknown>;

export type GhlCustomFieldValue = {
  id?: string;
  key?: string;
  field_value?: unknown;
  value?: unknown;
};

export type CreateContactInput = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  customFields?: GhlCustomFieldValue[];
} & JsonObject;

export type UpdateContactInput = Partial<CreateContactInput>;

export type SearchContactInput = {
  email?: string;
  phone?: string;
  limit?: number;
};

export type GhlRecord = Record<string, unknown>;

export type ListOpportunitiesInput = {
  limit?: number;
  pipelineId?: string;
  pipelineStageId?: string;
  status?: string;
  assignedTo?: string;
};

export type ListConversationsInput = {
  limit?: number;
};

export type ListContactsInput = {
  apiKey?: string;
  locationId?: string;
  limit?: number;
  startAfter?: number;
  startAfterId?: string;
};

export type ListContactsResponse = {
  contacts?: GhlRecord[];
  meta?: {
    total?: number;
    startAfter?: number;
    startAfterId?: string;
    nextPage?: number;
    currentPage?: number;
    nextPageUrl?: string;
  } & JsonObject;
  traceId?: string;
} & JsonObject;

export type ListPipelinesResponse = {
  pipelines?: GhlRecord[];
  traceId?: string;
} & JsonObject;

export type ListOpportunitiesResponse = {
  opportunities?: GhlRecord[];
  meta?: GhlRecord;
  traceId?: string;
} & JsonObject;

export type ListConversationsResponse = {
  conversations?: GhlRecord[];
  total?: number;
  traceId?: string;
} & JsonObject;

export type ListConversationMessagesResponse = {
  messages?:
    | GhlRecord[]
    | ({
        messages?: GhlRecord[];
        lastMessageId?: string;
        nextPage?: boolean;
      } & JsonObject);
  traceId?: string;
} & JsonObject;

export type ListCalendarsResponse = {
  calendars?: GhlRecord[];
  traceId?: string;
} & JsonObject;

export type MissionControlKpis = {
  pipelineCount: number;
  pipelineStageCount: number;
  sampledOpportunityCount: number;
  openOpportunityCount: number;
  wonOpportunityCount: number;
  sampledOpportunityValue: number;
  sampledConversationCount: number;
  unreadConversationCount: number;
  calendarCount: number;
  activeCalendarCount: number;
  followUpCandidateCount: number;
  activeClientCount: number;
  urgentClientCount: number;
  pausedClientCount: number;
};

export type MissionControlStage = {
  stageId: string;
  stageName: string;
  pipelineId: string;
  pipelineName: string;
  count: number;
  value: number;
};

export type MissionControlOpportunity = {
  id: string;
  name: string;
  contactId?: string;
  status: string;
  value: number;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  contactName?: string;
  assignedTo?: string;
  source?: string;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  lastStageChangeAt?: string;
  lastStatusChangeAt?: string;
  daysSinceStatusChange?: number;
  daysSinceStageChange?: number;
};

export type MissionControlActiveClients = {
  pipelineId: string;
  pipelineName: string;
  sampledOpportunityCount: number;
  sampledValue: number;
  urgentCount: number;
  onboardingCount: number;
  pausedCount: number;
  exitingOrCancelledCount: number;
  stages: MissionControlStage[];
  opportunitiesByStage: Record<string, MissionControlOpportunity[]>;
  opportunities: MissionControlOpportunity[];
  recentOpportunities: MissionControlOpportunity[];
};

export type ActiveClientDetailInput = {
  contactId: string;
  opportunityId?: string;
};

export type ActiveClientDetailContact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  assignedTo?: string;
  tags: string[];
  dateAdded?: string;
  dateUpdated?: string;
};

export type ActiveClientDetailNote = {
  id: string;
  body: string;
  dateAdded?: string;
  userId?: string;
  pinned: boolean;
};

export type ActiveClientDetailTask = {
  id: string;
  title: string;
  body?: string;
  status?: string;
  completed?: boolean;
  dueDate?: string;
  dateAdded?: string;
  assignedTo?: string;
};

export type ActiveClientDetailAppointment = {
  id: string;
  title: string;
  status?: string;
  startTime?: string;
  endTime?: string;
  calendarId?: string;
};

export type ActiveClientDetailConversation = {
  id: string;
  contactName: string;
  channel?: string;
  direction?: string;
  unreadCount: number;
  lastMessageAt?: string;
  lastMessageSnippet?: string;
};

export type ActiveClientDetail = {
  contactId: string;
  opportunityId?: string;
  contact: ActiveClientDetailContact | null;
  notes: ActiveClientDetailNote[];
  tasks: ActiveClientDetailTask[];
  appointments: ActiveClientDetailAppointment[];
  conversations: ActiveClientDetailConversation[];
  accessIssues: MissionControlAccessIssue[];
};

export type MissionControlConversation = {
  id: string;
  contactName: string;
  channel?: string;
  direction?: string;
  unreadCount: number;
  lastMessageAt?: string;
};

export type MissionControlCalendar = {
  id: string;
  name: string;
  type?: string;
  isActive: boolean;
};

export type MissionControlFollowUp = {
  id: string;
  type: "conversation" | "opportunity";
  title: string;
  reason: string;
  updatedAt?: string;
  priority: "high" | "medium";
};

export type AiAgentSentiment = "positive" | "neutral" | "negative";

export type AiAgentConversationInsight = {
  id: string;
  contactName: string;
  channel?: string;
  lastMessageAt?: string;
  messagesAnalyzed: number;
  inboundCount: number;
  outboundCount: number;
  automatedOutboundCount: number;
  agentLikeOutboundCount: number;
  callCount: number;
  responseQualityScore: number;
  sentiment: AiAgentSentiment;
  sentimentScore: number;
  intent:
    | "booking"
    | "interested"
    | "objection"
    | "handoff"
    | "no_response"
    | "neutral";
  riskLevel: "low" | "medium" | "high";
  outcome: string;
  evidence: string[];
  tags: string[];
};

export type AiAgentChannelBreakdown = {
  channel: string;
  conversations: number;
  messages: number;
  positive: number;
  neutral: number;
  negative: number;
};

export type AiAgentEffectivenessSnapshot = {
  accountName: string;
  generatedAt: string;
  score: number;
  verdict: string;
  sample: {
    conversationsFetched: number;
    conversationsAnalyzed: number;
    messagesAnalyzed: number;
    agentLikeOutboundMessages: number;
    inboundReplies: number;
    callMessages: number;
  };
  kpis: {
    responseRate: number;
    positiveSentimentShare: number;
    negativeSentimentShare: number;
    bookingIntentCount: number;
    objectionCount: number;
    handoffOrStopCount: number;
    noResponseCount: number;
  };
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  channelBreakdown: AiAgentChannelBreakdown[];
  conversations: AiAgentConversationInsight[];
  accessIssues: MissionControlAccessIssue[];
  notes: string[];
};

export type LeadConversationSummary = {
  id: string;
  channel?: string;
  direction?: string;
  lastMessageAt?: string;
  lastMessageSnippet?: string;
  unreadCount: number;
};

export type LeadSummaryRow = {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  source?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  dateAdded?: string;
  dateUpdated?: string;
  tags: string[];
  customFieldHighlights: string[];
  statusSignals: string[];
  summary: string;
  conversations: LeadConversationSummary[];
};

export type LeadSummarySnapshot = {
  accountName: string;
  generatedAt: string;
  totalContacts: number;
  fetchedContacts: number;
  enrichedContacts: number;
  possibleLocationMismatch: boolean;
  newestLeadAt?: string;
  sourceBreakdown: Array<{ source: string; count: number }>;
  tagBreakdown: Array<{ tag: string; count: number }>;
  leads: LeadSummaryRow[];
  accessIssues: MissionControlAccessIssue[];
  notes: string[];
};

export type WorkflowCategory =
  | "inbound"
  | "outbound"
  | "nurture"
  | "appointment"
  | "pipeline"
  | "handoff"
  | "estimate"
  | "notification"
  | "other";

export type WorkflowIntelligenceRow = {
  id: string;
  name: string;
  status: string;
  version?: number;
  category: WorkflowCategory;
  purpose: string;
  riskLevel: "low" | "medium" | "high";
  signals: string[];
  relatedLeadTags: string[];
  updatedAt?: string;
  createdAt?: string;
};

export type WorkflowIntelligenceSnapshot = {
  accountName: string;
  generatedAt: string;
  totalWorkflows: number;
  publishedCount: number;
  draftCount: number;
  recentlyUpdatedCount: number;
  categoryBreakdown: Array<{ category: WorkflowCategory; count: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  workflows: WorkflowIntelligenceRow[];
  priorityReviews: WorkflowIntelligenceRow[];
  notes: string[];
  accessIssues: MissionControlAccessIssue[];
};

export type CommissionClientConfig = {
  id: string;
  name: string;
  accountName?: string;
  locationId: string;
  apiKeyEnvVar: string;
  contactId?: string;
  setupFee: number;
  monthlySaasFee: number;
  commissionRate: number;
  status?: "active" | "watch" | "attention" | "terms-needed" | string;
  notes?: string[];
};

export type CommissionPaymentRow = {
  id: string;
  kind: "transaction" | "order" | "subscription" | "invoice";
  status: string;
  amount: number;
  currency: string;
  createdAt?: string;
  description: string;
  commissionable: boolean;
  excludedReason?: string;
};

export type CommissionLedgerMonth = {
  month: string;
  collected: number;
  commission: number;
  transactionCount: number;
};

export type CommissionClientSnapshot = {
  id: string;
  name: string;
  accountName: string;
  locationId: string;
  status: "active" | "attention" | "quiet" | "terms-needed";
  commissionRate: number;
  setupFee: number;
  monthlySaasFee: number;
  expectedSetupCommission: number;
  expectedMonthlyCommission: number;
  setupCollected: number;
  recurringCollected: number;
  totalCollected: number;
  totalExcluded: number;
  totalFailed: number;
  commissionEarned: number;
  setupCommissionEarned: number;
  recurringCommissionEarned: number;
  outstandingSetupCommission: number;
  transactionCount: number;
  successfulTransactionCount: number;
  excludedTransactionCount: number;
  failedTransactionCount: number;
  orderCount: number;
  activeSubscriptionCount: number;
  invoiceCount: number;
  latestPaymentAt?: string;
  payments: CommissionPaymentRow[];
  ledger: CommissionLedgerMonth[];
  notes: string[];
  accessIssues: MissionControlAccessIssue[];
};

export type CommissionTrackerSnapshot = {
  accountName: string;
  generatedAt: string;
  clientCount: number;
  totalCollected: number;
  totalExcluded: number;
  totalCommissionEarned: number;
  setupCommissionEarned: number;
  recurringCommissionEarned: number;
  outstandingSetupCommission: number;
  failedPaymentAmount: number;
  failedPaymentCount: number;
  attentionCount: number;
  activeSubscriptionCount: number;
  clients: CommissionClientSnapshot[];
  ledger: CommissionLedgerMonth[];
  notes: string[];
  accessIssues: MissionControlAccessIssue[];
};

export type MissionControlAccessIssue = {
  source: string;
  message: string;
  status?: number;
  path?: string;
};

export type MissionControlSnapshot = {
  generatedAt: string;
  kpis: MissionControlKpis;
  pipelineStages: MissionControlStage[];
  opportunitiesByStage: Record<string, MissionControlOpportunity[]>;
  activeClients: MissionControlActiveClients | null;
  aiAgentEffectiveness: AiAgentEffectivenessSnapshot | null;
  leadSummary: LeadSummarySnapshot | null;
  workflowIntelligence: WorkflowIntelligenceSnapshot | null;
  recentOpportunities: MissionControlOpportunity[];
  recentConversations: MissionControlConversation[];
  calendars: MissionControlCalendar[];
  followUps: MissionControlFollowUp[];
  accessIssues: MissionControlAccessIssue[];
  notes: string[];
};

export type CreateOpportunityInput = {
  contactId: string;
  pipelineId: string;
  pipelineStageId: string;
  name: string;
  status?: "open" | "won" | "lost" | "abandoned" | string;
  monetaryValue?: number;
  assignedTo?: string;
} & JsonObject;

export type AddContactNoteInput = {
  contactId: string;
  body: string;
  userId?: string;
};

export type SendSmsOrConversationMessageInput = {
  contactId: string;
  message: string;
  type?: "SMS" | "Email" | "WhatsApp" | "GMB" | "IG" | "FB" | string;
  attachments?: string[];
  conversationId?: string;
  phone?: string;
  subject?: string;
  html?: string;
} & JsonObject;

export type CreateCalendarAppointmentInput = {
  calendarId: string;
  contactId: string;
  startTime: string;
  endTime: string;
  title?: string;
  appointmentStatus?: "new" | "confirmed" | "cancelled" | "showed" | string;
  assignedUserId?: string;
  address?: string;
  ignoreDateRange?: boolean;
  toNotify?: boolean;
} & JsonObject;

export type TriggerInboundWebhookInput = {
  webhookUrl: string;
  payload: JsonObject;
  headers?: Record<string, string>;
};
