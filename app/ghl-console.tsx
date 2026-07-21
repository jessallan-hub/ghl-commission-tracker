"use client";

import type {
  ActiveBookSnapshot,
  ActiveClientDetail,
  AiAgentEffectivenessSnapshot,
  CommissionClientSnapshot,
  CommissionLedgerMonth,
  CommissionTrackerSnapshot,
  LeadSummarySnapshot,
  MissionControlActiveClients,
  MissionControlCalendar,
  MissionControlConversation,
  MissionControlFollowUp,
  MissionControlOpportunity,
  MissionControlSnapshot,
  MissionControlStage,
  WorkflowCategory,
  WorkflowIntelligenceRow,
  WorkflowIntelligenceSnapshot,
} from "@/lib/ghl";
import type { FormEvent, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import issuedInvoices from "../config/issued-invoices.json";

type ResultState = {
  title: string;
  body: unknown;
};

type ApiEnvelope<T> =
  | { ok: true; data: T }
  | { ok: false; error?: { message?: string; details?: unknown } };

type ModuleId =
  | "home"
  | "active-clients"
  | "ai-agents"
  | "commissions"
  | "pipeline"
  | "activity"
  | "doctor-damp"
  | "doctor-damp-flows"
  | "doctor-damp-workflows"
  | "tools";

type AccountId = "rt-digital" | "doctor-damp";

type AccountConfig = {
  id: AccountId;
  name: string;
  description: string;
  status: string;
  modules: ModuleId[];
};

const accounts: AccountConfig[] = [
  {
    id: "rt-digital",
    name: "RT Digital",
    description:
      "Main operating workspace for active clients, pipeline, conversations, calendars, and test tools.",
    status: "Connected",
    modules: [
      "commissions",
      "active-clients",
      "ai-agents",
      "pipeline",
      "activity",
      "tools",
    ],
  },
  {
    id: "doctor-damp",
    name: "Doctor Damp",
    description:
      "Lead review workspace for the Doctor Damp sub-account and new leads since March 2026.",
    status: "Connected",
    modules: ["doctor-damp-workflows", "doctor-damp-flows", "doctor-damp"],
  },
];

const dashboardModules = new Set<ModuleId>([
  "active-clients",
  "ai-agents",
  "pipeline",
  "activity",
  "doctor-damp",
  "doctor-damp-flows",
  "doctor-damp-workflows",
]);
const commissionModules = new Set<ModuleId>(["commissions"]);

const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});
const moneyFormatter = new Intl.NumberFormat(undefined, {
  currency: "AUD",
  maximumFractionDigits: 0,
  style: "currency",
});
const preciseMoneyFormatter = new Intl.NumberFormat(undefined, {
  currency: "AUD",
  maximumFractionDigits: 2,
  style: "currency",
});
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return response.json() as Promise<unknown>;
}

async function getJson<T>(path: string) {
  const response = await fetch(path, {
    cache: "no-store",
  });

  return response.json() as Promise<ApiEnvelope<T>>;
}

function fields(form: HTMLFormElement) {
  return Object.fromEntries(
    Array.from(new FormData(form).entries())
      .map(([key, value]) => [key, String(value).trim()])
      .filter(([, value]) => value.length > 0),
  );
}

function stageKey(pipelineId: string, stageId: string) {
  return `${pipelineId}:${stageId}`;
}

export default function GhlConsole() {
  const [selectedAccountId, setSelectedAccountId] =
    useState<AccountId | null>("rt-digital");
  const [selectedModule, setSelectedModule] = useState<ModuleId>("commissions");
  const [busy, setBusy] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [commissionBusy, setCommissionBusy] = useState(false);
  const [commissionError, setCommissionError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MissionControlSnapshot | null>(null);
  const [commissionSnapshot, setCommissionSnapshot] =
    useState<CommissionTrackerSnapshot | null>(null);
  const [selectedStageKey, setSelectedStageKey] = useState<string | null>(null);
  const [result, setResult] = useState<ResultState>({
    title: "Ready",
    body: {
      status: "Ready",
    },
  });

  const maxStageCount = useMemo(
    () => Math.max(1, ...(snapshot?.pipelineStages.map((stage) => stage.count) ?? [])),
    [snapshot],
  );
  const selectedStage =
    snapshot?.pipelineStages.find(
      (stage) => stageKey(stage.pipelineId, stage.stageId) === selectedStageKey,
    ) ??
    snapshot?.pipelineStages[0] ??
    null;
  const selectedStageOpportunities =
    selectedStage && snapshot
      ? (snapshot.opportunitiesByStage[
          stageKey(selectedStage.pipelineId, selectedStage.stageId)
        ] ?? [])
      : [];

  const selectedModuleNeedsDashboard = dashboardModules.has(selectedModule);
  const selectedModuleNeedsCommission = commissionModules.has(selectedModule);
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? null;

  function enterAccount(accountId: AccountId) {
    setSelectedAccountId(accountId);
    setSelectedModule("home");
  }

  function returnToFoyer() {
    setSelectedAccountId(null);
    setSelectedModule("home");
  }

  useEffect(() => {
    if (!selectedModuleNeedsDashboard || snapshot || dashboardBusy) {
      return;
    }

    void loadDashboard();
  }, [dashboardBusy, selectedModuleNeedsDashboard, snapshot]);

  useEffect(() => {
    if (!selectedModuleNeedsCommission || commissionSnapshot || commissionBusy) {
      return;
    }

    void loadCommissionTracker();
  }, [commissionBusy, commissionSnapshot, selectedModuleNeedsCommission]);

  async function loadDashboard() {
    setDashboardBusy(true);
    setDashboardError(null);

    try {
      const response = await fetch("/api/ghl/mission-control", {
        cache: "no-store",
      });
      const envelope = (await response.json()) as ApiEnvelope<MissionControlSnapshot>;

      if (!envelope.ok) {
        throw new Error(envelope.error?.message ?? "Dashboard request failed.");
      }

      setSnapshot(envelope.data);
    } catch (error) {
      setDashboardError(
        error instanceof Error ? error.message : "Dashboard request failed.",
      );
    } finally {
      setDashboardBusy(false);
    }
  }

  async function loadCommissionTracker() {
    setCommissionBusy(true);
    setCommissionError(null);

    try {
      const response = await fetch("/api/ghl/commission-tracker", {
        cache: "no-store",
      });
      const envelope = (await response.json()) as ApiEnvelope<CommissionTrackerSnapshot>;

      if (!envelope.ok) {
        throw new Error(envelope.error?.message ?? "Commission request failed.");
      }

      setCommissionSnapshot(envelope.data);
    } catch (error) {
      setCommissionError(
        error instanceof Error ? error.message : "Commission request failed.",
      );
    } finally {
      setCommissionBusy(false);
    }
  }

  async function run(title: string, action: () => Promise<unknown>) {
    setBusy(true);
    setResult({ title, body: { status: "Running..." } });

    try {
      const body = await action();
      setResult({ title, body });
    } catch (error) {
      setResult({
        title,
        body:
          error instanceof Error
            ? { ok: false, error: error.message }
            : { ok: false, error: "Unknown error" },
      });
    } finally {
      setBusy(false);
    }
  }

  async function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = fields(event.currentTarget);
    const params = new URLSearchParams();

    if (data.email) params.set("email", String(data.email));
    if (data.phone) params.set("phone", String(data.phone));

    await run("Search contact", () =>
      fetch(`/api/ghl/search-contact?${params.toString()}`).then((response) =>
        response.json(),
      ),
    );
  }

  async function onCreateContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Create contact", () =>
      postJson("/api/ghl/create-contact", fields(event.currentTarget)),
    );
  }

  async function onAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run("Add contact note", () =>
      postJson("/api/ghl/add-contact-note", fields(event.currentTarget)),
    );
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="title-block">
          <h1>{selectedAccount ? selectedAccount.name : "GHL Test Lab"}</h1>
          <p>
            {selectedAccount
              ? "Choose a module for this sub-account, test one workflow, then come back to the hub."
              : "Choose a sub-account, then open the module you want to test."}
          </p>
        </div>
        <div className="toolbar">
          {selectedAccount ? (
            <button
              className="secondary"
              onClick={returnToFoyer}
              type="button"
            >
              Accounts
            </button>
          ) : null}
          {selectedModule !== "home" ? (
            <button
              className="secondary"
              onClick={() => setSelectedModule("home")}
              type="button"
            >
              Home
            </button>
          ) : null}
          {selectedModuleNeedsDashboard ? (
            <button
              className="secondary"
              data-testid="refresh-dashboard"
              disabled={dashboardBusy}
              onClick={loadDashboard}
              type="button"
            >
              Refresh
            </button>
          ) : null}
          {selectedModuleNeedsCommission ? (
            <button
              className="secondary"
              data-testid="refresh-commission"
              disabled={commissionBusy}
              onClick={loadCommissionTracker}
              type="button"
            >
              Refresh
            </button>
          ) : null}
          <span className="pill ok">Connected locally</span>
        </div>
      </header>

      {!selectedAccount ? (
        <AccountFoyer onSelect={enterAccount} />
      ) : selectedModule === "home" ? (
        <ModuleHome
          account={selectedAccount}
          onSelect={setSelectedModule}
          snapshot={snapshot}
          commissionSnapshot={commissionSnapshot}
        />
      ) : (
        <>
          <ModuleNav
            account={selectedAccount}
            selectedModule={selectedModule}
            onSelect={setSelectedModule}
          />

          <section className="status-strip" aria-label="Integration status">
            <StatusItem label="Base URL" value="services.leadconnectorhq.com" />
            <StatusItem label="Auth" value="Private Integration Token" />
            <StatusItem
              label="Updated"
              value={
                selectedModuleNeedsCommission
                  ? commissionSnapshot
                    ? formatDate(commissionSnapshot.generatedAt)
                    : "Not loaded"
                  : snapshot
                    ? formatDate(snapshot.generatedAt)
                    : "Not loaded"
              }
            />
          </section>

          {commissionError ? (
            <section className="notice danger" data-testid="commission-error">
              {commissionError}
            </section>
          ) : null}

          {dashboardError ? (
            <section className="notice danger" data-testid="dashboard-error">
              {dashboardError}
            </section>
          ) : null}

          {selectedModuleNeedsDashboard && dashboardBusy && !snapshot ? (
            <section className="panel">
              <PanelHeader title="Loading Module" detail="Fetching GHL data" />
              <SkeletonRows count={5} />
            </section>
          ) : null}

          {selectedModuleNeedsCommission && commissionBusy && !commissionSnapshot ? (
            <section className="panel">
              <PanelHeader title="Loading Commission Tracker" detail="Reading GHL payments" />
              <SkeletonRows count={5} />
            </section>
          ) : null}

          {selectedModule === "commissions" ? (
            <CommissionTrackerPanel snapshot={commissionSnapshot} />
          ) : null}

          {selectedModule === "active-clients" ? (
            <ActiveClientsPanel activeClients={snapshot?.activeClients ?? null} />
          ) : null}

          {selectedModule === "ai-agents" ? (
            <AiAgentEffectivenessPanel
              insight={snapshot?.aiAgentEffectiveness ?? null}
            />
          ) : null}

          {selectedModule === "pipeline" ? (
            <PipelineModule
              dashboardBusy={dashboardBusy}
              maxStageCount={maxStageCount}
              onSelectStage={setSelectedStageKey}
              selectedStage={selectedStage}
              selectedStageOpportunities={selectedStageOpportunities}
              snapshot={snapshot}
            />
          ) : null}

          {selectedModule === "activity" ? (
            <ActivityModule snapshot={snapshot} />
          ) : null}

          {selectedModule === "doctor-damp" ? (
            <LeadSummaryPanel leadSummary={snapshot?.leadSummary ?? null} />
          ) : null}

          {selectedModule === "doctor-damp-flows" ? (
            <DoctorDampFlowsPanel leadSummary={snapshot?.leadSummary ?? null} />
          ) : null}

          {selectedModule === "doctor-damp-workflows" ? (
            <WorkflowIntelligencePanel
              workflowIntelligence={snapshot?.workflowIntelligence ?? null}
            />
          ) : null}

          {selectedModule === "tools" ? (
            <ToolsModule
              busy={busy}
              onAddNote={onAddNote}
              onCreateContact={onCreateContact}
              onSearch={onSearch}
              result={result}
            />
          ) : null}

          {snapshot?.accessIssues.length && selectedModuleNeedsDashboard ? (
            <section className="notice">
              <strong>Partial access:</strong>{" "}
              {snapshot.accessIssues
                .map((issue) => `${issue.source}${issue.status ? ` ${issue.status}` : ""}`)
                .join(", ")}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function ModuleHome({
  account,
  onSelect,
  snapshot,
  commissionSnapshot,
}: {
  account: AccountConfig;
  onSelect: (module: ModuleId) => void;
  snapshot: MissionControlSnapshot | null;
  commissionSnapshot: CommissionTrackerSnapshot | null;
}) {
  const moduleCards = getModuleCards(snapshot, commissionSnapshot).filter((card) =>
    account.modules.includes(card.id),
  );

  return (
    <section className="module-home" data-testid="module-home">
      <div className="home-hero">
        <div>
          <h2>{account.name} Modules</h2>
          <p>
            {account.description} Open one module at a time while we keep shaping
            this into a cleaner operating system.
          </p>
        </div>
        <div className="home-hero-meta">
          <span>Last data refresh</span>
          <strong>{snapshot ? formatDate(snapshot.generatedAt) : "Not loaded"}</strong>
        </div>
      </div>

      <div className="module-card-grid">
        {moduleCards.map((card) => (
          <ModuleCard
            detail={card.detail}
            key={card.id}
            metric={card.metric}
            onClick={() => onSelect(card.id)}
            title={card.title}
          />
        ))}
      </div>
    </section>
  );
}

function AccountFoyer({ onSelect }: { onSelect: (account: AccountId) => void }) {
  return (
    <section className="account-foyer" data-testid="account-foyer">
      <div className="home-hero">
        <div>
          <h2>Sub-Account Foyer</h2>
          <p>
            Start here, choose the client workspace, then enter the modules for
            that account. This keeps experiments separated while we figure out
            the final product shape.
          </p>
        </div>
        <div className="home-hero-meta">
          <span>Accounts connected</span>
          <strong>{formatNumber(accounts.length)}</strong>
        </div>
      </div>

      <div className="account-card-grid">
        {accounts.map((account) => (
          <button
            className="account-card"
            key={account.id}
            onClick={() => onSelect(account.id)}
            type="button"
          >
            <span>{account.status}</span>
            <strong>{account.name}</strong>
            <p>{account.description}</p>
            <small>{formatNumber(account.modules.length)} module areas</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function getModuleCards(
  snapshot: MissionControlSnapshot | null,
  commissionSnapshot: CommissionTrackerSnapshot | null,
) {
  return [
    {
      id: "commissions" as const,
      title: "Commission Tracker",
      detail:
        "25% setup and SaaS commission ledger for tracked clients, powered by live GHL payments.",
      metric: commissionSnapshot
        ? formatMoney(commissionSnapshot.totalCommissionEarned)
        : "Finance",
    },
    {
      id: "active-clients" as const,
      title: "Active Clients",
      detail:
        "Client pipeline, stage categories, notes, tasks, appointments, and conversations.",
      metric: snapshot
        ? `${formatNumber(snapshot.kpis.activeClientCount)} clients`
        : "Pipeline",
    },
    {
      id: "ai-agents" as const,
      title: "AI Agent Effectiveness",
      detail:
        "Conversation sentiment, reply quality, booking signals, and AI handoff risks.",
      metric: snapshot
        ? `${formatNumber(snapshot.aiAgentEffectiveness?.sample.messagesAnalyzed)} messages`
        : "Agent QA",
    },
    {
      id: "pipeline" as const,
      title: "Pipeline Overview",
      detail: "Sales stages, recent opportunities, stage drilldown, and follow-up queue.",
      metric: snapshot
        ? `${formatNumber(snapshot.kpis.openOpportunityCount)} open`
        : "Pipeline",
    },
    {
      id: "activity" as const,
      title: "Conversations & Calendars",
      detail: "Recent conversations, calendars, unread messages, and activity signals.",
      metric: snapshot
        ? `${formatNumber(snapshot.kpis.unreadConversationCount)} unread`
        : "Activity",
    },
    {
      id: "doctor-damp-workflows" as const,
      title: "Workflow Intelligence",
      detail:
        "Read-only map of Doctor Damp workflows, draft/published status, categories, and priority reviews.",
      metric: snapshot
        ? `${formatNumber(snapshot.workflowIntelligence?.totalWorkflows)} workflows`
        : "Workflow map",
    },
    {
      id: "doctor-damp-flows" as const,
      title: "Inbound Lead Flows",
      detail:
        "Source-to-outcome view for Doctor Damp inbound leads, conversations, bookings, and stop signals.",
      metric: snapshot
        ? `${formatNumber(snapshot.leadSummary?.sourceBreakdown.length)} sources`
        : "Flow map",
    },
    {
      id: "doctor-damp" as const,
      title: "Doctor Damp Leads",
      detail:
        "Doctor Damp-specific lead review, filtered to new leads since March 1, 2026.",
      metric: snapshot
        ? `${formatNumber(snapshot.leadSummary?.fetchedContacts)} leads`
        : "Lead review",
    },
    {
      id: "tools" as const,
      title: "API Test Tools",
      detail: "Manual test actions for contact search, creating a test contact, and adding notes.",
      metric: "API tools",
    },
  ];
}

function ModuleCard({
  title,
  detail,
  metric,
  onClick,
}: {
  title: string;
  detail: string;
  metric: string;
  onClick: () => void;
}) {
  return (
    <button className="module-card" onClick={onClick} type="button">
      <span>{metric}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </button>
  );
}

function ModuleNav({
  account,
  selectedModule,
  onSelect,
}: {
  account: AccountConfig;
  selectedModule: ModuleId;
  onSelect: (module: ModuleId) => void;
}) {
  const allModules: Array<{ id: ModuleId; label: string }> = [
    { id: "active-clients", label: "Active Clients" },
    { id: "ai-agents", label: "AI Agents" },
    { id: "commissions", label: "Commissions" },
    { id: "pipeline", label: "Pipeline" },
    { id: "activity", label: "Activity" },
    { id: "doctor-damp-workflows", label: "Workflows" },
    { id: "doctor-damp-flows", label: "Lead Flows" },
    { id: "doctor-damp", label: "Leads" },
    { id: "tools", label: "Tools" },
  ];
  const modules = allModules.filter((module) =>
    account.modules.includes(module.id),
  );

  return (
    <nav className="module-nav" aria-label="Testing modules">
      {modules.map((module) => (
        <button
          className={module.id === selectedModule ? "selected" : ""}
          key={module.id}
          onClick={() => onSelect(module.id)}
          type="button"
        >
          {module.label}
        </button>
      ))}
    </nav>
  );
}

function PipelineModule({
  dashboardBusy,
  snapshot,
  maxStageCount,
  selectedStage,
  selectedStageOpportunities,
  onSelectStage,
}: {
  dashboardBusy: boolean;
  snapshot: MissionControlSnapshot | null;
  maxStageCount: number;
  selectedStage: MissionControlStage | null;
  selectedStageOpportunities: MissionControlOpportunity[];
  onSelectStage: (key: string) => void;
}) {
  return (
    <>
      <section
        className="dashboard-grid"
        aria-busy={dashboardBusy}
        data-testid="mission-control"
      >
        <MetricCard
          label="Sales open opps"
          value={snapshot?.kpis.openOpportunityCount}
          detail={`${formatNumber(snapshot?.kpis.sampledOpportunityCount)} sampled`}
        />
        <MetricCard
          label="Pipeline stages"
          value={snapshot?.kpis.pipelineStageCount}
          detail={`${formatNumber(snapshot?.kpis.pipelineCount)} pipelines`}
        />
        <MetricCard
          label="Action queue"
          value={snapshot?.kpis.followUpCandidateCount}
          detail="Unread or stalled"
        />
        <MetricCard
          label="Sampled value"
          value={snapshot?.kpis.sampledOpportunityValue}
          detail="Account currency"
        />
      </section>

      <div className="mission-layout">
        <section className="panel">
          <PanelHeader title="Pipeline Stage Load" detail="Top active stages" />
          <div className="stage-list">
            {dashboardBusy && !snapshot ? <SkeletonRows count={5} /> : null}
            {snapshot?.pipelineStages.length ? (
              snapshot.pipelineStages.map((stage) => (
                <StageRow
                  key={`${stage.pipelineId}:${stage.stageId}`}
                  maxCount={maxStageCount}
                  onSelect={() =>
                    onSelectStage(stageKey(stage.pipelineId, stage.stageId))
                  }
                  selected={
                    selectedStage
                      ? stageKey(stage.pipelineId, stage.stageId) ===
                        stageKey(selectedStage.pipelineId, selectedStage.stageId)
                      : false
                  }
                  stage={stage}
                />
              ))
            ) : !dashboardBusy ? (
              <EmptyState text="No opportunity stage data returned yet." />
            ) : null}
          </div>
        </section>

        <div className="right-stack">
          <StageDrilldown
            opportunities={selectedStageOpportunities}
            stage={selectedStage}
          />

          <section className="panel">
            <PanelHeader title="Follow-Up Lane" detail="Highest signal first" />
            <div className="compact-list">
              {dashboardBusy && !snapshot ? <SkeletonRows count={4} /> : null}
              {snapshot?.followUps.length ? (
                snapshot.followUps.map((followUp) => (
                  <FollowUpRow followUp={followUp} key={followUp.id} />
                ))
              ) : !dashboardBusy ? (
                <EmptyState text="No unread or stalled follow-ups in the current sample." />
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <section className="panel">
        <PanelHeader title="Recent Opportunities" detail="Latest sample" />
        <OpportunityTable opportunities={snapshot?.recentOpportunities ?? []} />
      </section>
    </>
  );
}

function ActivityModule({ snapshot }: { snapshot: MissionControlSnapshot | null }) {
  return (
    <div className="mission-layout">
      <section className="panel">
        <PanelHeader title="Recent Conversations" detail="Latest message activity" />
        <ConversationList conversations={snapshot?.recentConversations ?? []} />
      </section>

      <section className="panel">
        <PanelHeader title="Calendars" detail="First active calendars returned by GHL" />
        <CalendarList calendars={snapshot?.calendars ?? []} />
      </section>
    </div>
  );
}

function CommissionTrackerPanel({
  snapshot,
}: {
  snapshot: CommissionTrackerSnapshot | null;
}) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  if (!snapshot) {
    return (
      <section className="commission-panel" data-testid="commission-tracker">
        <PanelHeader title="Commission Tracker" detail="Loading" />
        <EmptyState text="Commission data is loading from RT Digital payments." />
      </section>
    );
  }

  const selectedClient =
    snapshot.clients.find((client) => client.id === selectedClientId) ??
    snapshot.clients[0] ??
    null;

  return (
    <section className="commission-panel" data-testid="commission-tracker">
      <div className="commission-app-header">
        <div className="commission-brand-lockup">
          <div className="commission-leaf-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <h2>Commission Tracker</h2>
            <p>Agency operations · commissions overview</p>
          </div>
        </div>
        <div className="commission-date-pill">
          <span aria-hidden="true">▣</span>
          {formatMonth(snapshot.generatedAt.slice(0, 7))}
        </div>
      </div>

      <section className="commission-agency-card" aria-label="RT Digital agency summary">
        <div className="commission-agency-identity">
          <div className="commission-agency-mark" aria-hidden="true">RT</div>
          <div>
            <strong>RT Digital</strong>
            <span>Agency account — all client SaaS billing flows through here</span>
          </div>
        </div>
        <div className="commission-agency-figures">
          <div className="commission-agency-figure">
            <span>SaaS Collected · Tracked</span>
            <strong>{formatMoney(snapshot.totalCollected, true)}</strong>
          </div>
          <div className="commission-agency-figure">
            <span>Pooled Commission (25%)</span>
            <strong>{formatMoney(snapshot.totalCommissionEarned, true)}</strong>
          </div>
          <div className="commission-agency-figure">
            <span>Tracked Clients</span>
            <strong>{formatNumber(snapshot.clientCount)}</strong>
          </div>
        </div>
      </section>

      <div className="commission-kpis">
        <CommissionMetric
          detail={`${formatMoney(snapshot.totalExcluded)} wallet charges excluded`}
          icon="↗"
          label="Collected Revenue"
          value={formatMoney(snapshot.totalCollected, true)}
        />
        <CommissionMetric
          detail={`${formatPercent(0.25)} tracked share`}
          icon="25%"
          label="Commission Earned"
          value={formatMoney(snapshot.totalCommissionEarned, true)}
        />
        <CommissionMetric
          detail={`Across ${formatNumber(snapshot.attentionCount)} clients`}
          icon="!"
          label="Outstanding / Attention"
          tone={snapshot.failedPaymentCount ? "warning" : "calm"}
          value={formatMoney(snapshot.failedPaymentAmount, true)}
        />
      </div>

      <div className="commission-dashboard-grid">
        <section className="commission-clients-section" aria-label="Tracked clients">
          <div className="commission-section-title">
            <span aria-hidden="true">⌘</span>
            <h3>Clients</h3>
            <button type="button">+ Add Client</button>
          </div>

          <div className="commission-client-ledger">
            {snapshot.clients.map((client) => (
              <article
                className={`commission-client-row ${
                  selectedClient?.id === client.id ? "selected" : ""
                } ${client.status}`}
                key={client.id}
              >
                <button
                  aria-label={`View commission details for ${client.name}`}
                  className="commission-client-main"
                  onClick={() => setSelectedClientId(client.id)}
                  type="button"
                >
                  <div className="commission-avatar">{getClientInitials(client.name)}</div>
                  <div className="commission-client-identity">
                    <strong>{client.name}</strong>
                    <span>{client.accountName}</span>
                  </div>
                  <CommissionField
                    label="Setup Fee"
                    value={formatMoney(client.setupFee)}
                    detail="One-time"
                  />
                  <CommissionField
                    label="SaaS Recurring"
                    value={client.monthlySaasFee ? `${formatMoney(client.monthlySaasFee)}/mo` : "TBC"}
                    detail={
                      client.expectedMonthlyCommission
                        ? `${formatMoney(client.expectedMonthlyCommission)} share`
                        : "Terms needed"
                    }
                  />
                  <CommissionStatusBadge status={client.status} />
                  <CommissionField
                    label="Live GHL Payments"
                    value={formatMoney(client.totalCollected)}
                    detail="Commissionable"
                  />
                  <span className="commission-row-action" aria-hidden="true">
                    {client.status === "attention" ? "△" : "✓"}
                  </span>
                </button>
                <div className={`commission-client-foot ${client.status}`}>
                  <span>{buildClientFootnote(client)}</span>
                  {client.totalExcluded > 0 ? (
                    <span>{formatMoney(client.totalExcluded)} wallet excluded</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          {selectedClient ? <CommissionClientDetail client={selectedClient} /> : null}
        </section>

        <aside className="commission-side-column">
          <section className="commission-ledger-card">
            <div className="commission-side-title">
              <span aria-hidden="true">▤</span>
              <h3>Revenue Ledger <small>(By Month)</small></h3>
            </div>
          {snapshot.ledger.length ? (
            <div className="commission-month-table">
              <div className="commission-month-heading">
                <span>Month</span>
                <span>Collected Revenue</span>
                <span>Commission</span>
              </div>
              {snapshot.ledger.slice(0, 8).map((month) => (
                <CommissionMonthRow key={month.month} month={month} />
              ))}
            </div>
          ) : (
            <EmptyState text="No successful payment months yet." />
          )}
          </section>

          <section className="sheets-note">
            <strong>Google Sheets Sync</strong>
            <p>
              The sheet remains the backup ledger while this app becomes the
              fast, visual operating view.
            </p>
            <ul>
              <li>Monthly revenue and commission</li>
              <li>Payment status and history</li>
              <li>Wallet charges excluded</li>
            </ul>
            <a href="https://docs.google.com/spreadsheets/d/1i7bVd1q_zUMIVKY8QUgXxZfMjE1cG7xZ3J7STAymKN4/edit" target="_blank">
              Open Google Sheet
            </a>
          </section>
        </aside>
      </div>

      {selectedClient ? (
        <div className="commission-mobile-detail">
          <CommissionClientDetail client={selectedClient} />
        </div>
      ) : null}

      {snapshot.activeBook ? (
        <ActiveBookPanel book={snapshot.activeBook} />
      ) : null}

      <IssuedInvoicesPanel />


      {snapshot.notes.length ? (
        <div className="commission-footnotes">
          {snapshot.notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      ) : null}

      {snapshot.accessIssues.length ? (
        <section className="notice danger">
          <strong>Partial payment access:</strong>{" "}
          {snapshot.accessIssues.map((issue) => issue.source).join(", ")}
        </section>
      ) : null}
    </section>
  );
}

const ACTIVE_BOOK_FLAG_LABELS: Record<string, string> = {
  ok: "",
  "not-in-pipeline": "Not in pipeline",
  "paying-but-marked-inactive": "Paying — exiting (contract run-off)",
  "no-billing": "No billing",
  "paused-billing": "Billing paused",
  "manual-billing": "Off-platform billing (manual)",
};

// Invoices Jesse has issued to Rich's entities. These are NOT sourced from GHL —
// GHL only knows client-side SaaS payments, it has no idea what's been billed out.
// Kept here so the money in and the money out sit in one view. Source of truth is
// config/issued-invoices.json; the PDFs live outside the repo.
function IssuedInvoicesPanel() {
  // A Set, not a single id — Jesse wants to read both invoices side by side
  // rather than losing one every time he opens the other.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (number: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });

  const allOpen = expanded.size === issuedInvoices.length;
  const totalExGst = issuedInvoices.reduce((sum, inv) => sum + inv.exGst, 0);
  const totalIncGst = issuedInvoices.reduce((sum, inv) => sum + inv.total, 0);

  return (
    <section className="issued-invoices" data-testid="issued-invoices">
      <div className="issued-invoices-head">
        <div>
          <h3>Invoices Issued</h3>
          <p>
            Billed out by Jesse — entered manually, not read from GHL. GHL only
            sees client payments in, never what has been invoiced out.
          </p>
        </div>
        <div className="issued-invoices-stats">
          <div className="issued-invoices-stat">
            <span>Total ex GST</span>
            <strong>{formatMoney(totalExGst, true)}</strong>
          </div>
          <div className="issued-invoices-stat">
            <span>Total inc GST</span>
            <strong>{formatMoney(totalIncGst, true)}</strong>
          </div>
          <button
            type="button"
            className="issued-invoices-expand-all"
            onClick={() =>
              setExpanded(
                allOpen
                  ? new Set()
                  : new Set(issuedInvoices.map((inv) => inv.number)),
              )
            }
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      <div className="issued-invoices-table-wrap">
        <table className="issued-invoices-table">
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Billed to</th>
              <th>Description</th>
              <th className="num">Ex GST</th>
              <th className="num">GST</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {issuedInvoices.map((inv) => {
              const open = expanded.has(inv.number);
              return (
                <Fragment key={inv.number}>
                  <tr
                    className={open ? "is-open" : undefined}
                    onClick={() => toggle(inv.number)}
                  >
                    <td>
                      <button
                        type="button"
                        className="issued-invoices-toggle"
                        aria-expanded={open}
                        aria-label={
                          open
                            ? `Hide full ${inv.number}`
                            : `Show full ${inv.number}`
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(inv.number);
                        }}
                      >
                        <svg
                          width="7"
                          height="7"
                          viewBox="0 0 10 10"
                          className={open ? "is-open" : undefined}
                          style={{ fill: "currentColor" }}
                        >
                          <path d="M1 0.5L9 5L1 9.5V0.5Z" />
                        </svg>
                        <span>
                          <strong>{inv.number}</strong>
                          <small>{inv.issued}</small>
                        </span>
                      </button>
                    </td>
                    <td>{inv.billedTo}</td>
                    <td>{inv.description}</td>
                    <td className="num">{formatMoney(inv.exGst, true)}</td>
                    <td className="num">{formatMoney(inv.gst, true)}</td>
                    <td className="num">{formatMoney(inv.total, true)}</td>
                  </tr>

                  {open ? (
                    <tr className="issued-invoice-detail-row">
                      <td colSpan={6}>
                        <div className="issued-invoice-detail">
                          <div className="issued-invoice-doc">
                            <div className="issued-invoice-doc-head">
                              <div>
                                <span>Tax Invoice</span>
                                <strong>{inv.from.name}</strong>
                                <small>ABN: {inv.from.abn}</small>
                              </div>
                              <div className="issued-invoice-doc-meta">
                                <span>Invoice No.</span>
                                <strong>{inv.number}</strong>
                                <small>{inv.issued}</small>
                              </div>
                            </div>

                            <div className="issued-invoice-body">
                              <div>
                                <div className="issued-invoice-billto">
                                  <span>Bill to</span>
                                  <strong>{inv.billedTo}</strong>
                                </div>

                                <table className="issued-invoice-lines">
                                  <tbody>
                                    {inv.lineItems.map((item) => (
                                      <tr key={item.label}>
                                        <td>{item.label}</td>
                                        <td className="num">
                                          {formatMoney(item.amount, true)}
                                        </td>
                                      </tr>
                                    ))}
                                    <tr>
                                      <td>Subtotal</td>
                                      <td className="num">
                                        {formatMoney(inv.exGst, true)}
                                      </td>
                                    </tr>
                                    <tr>
                                      <td>GST (10%)</td>
                                      <td className="num">
                                        {formatMoney(inv.gst, true)}
                                      </td>
                                    </tr>
                                    <tr className="grand">
                                      <td>Total</td>
                                      <td className="num">
                                        {formatMoney(inv.total, true)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>

                                {inv.note ? (
                                  <p className="issued-invoice-note">
                                    {inv.note}
                                  </p>
                                ) : null}

                                <div className="issued-invoice-payment">
                                  <span>Payment details</span>
                                  <dl>
                                    <div>
                                      <dt>Account name</dt>
                                      <dd>{inv.payment.accountName}</dd>
                                    </div>
                                    <div>
                                      <dt>Bank</dt>
                                      <dd>{inv.payment.bank}</dd>
                                    </div>
                                    <div>
                                      <dt>BSB</dt>
                                      <dd>{inv.payment.bsb}</dd>
                                    </div>
                                    <div>
                                      <dt>Account number</dt>
                                      <dd>{inv.payment.accountNumber}</dd>
                                    </div>
                                  </dl>
                                </div>
                              </div>

                              {inv.basis.length ? (
                                <div className="issued-invoice-basis">
                                  <span>Basis of settlement</span>
                                  <table>
                                    <tbody>
                                      {inv.basis.map((row) => (
                                        <tr
                                          key={row.label}
                                          className={
                                            row.subtotal ? "sum" : undefined
                                          }
                                        >
                                          <td>{row.label}</td>
                                          <td className="num">
                                            {formatMoney(row.amount, true)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                  {inv.basisNote ? <p>{inv.basisNote}</p> : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActiveBookPanel({ book }: { book: ActiveBookSnapshot }) {
  return (
    <section className="active-book" aria-label="Active clients live revenue">
      <div className="active-book-head">
        <div>
          <h3>Active Clients — Live Revenue</h3>
          <p>
            From the “{book.pipelineName}” pipeline + live GHL subscriptions.
            Cancelled/Exiting excluded.
          </p>
        </div>
        <div className="active-book-stats">
          <div className="active-book-stat">
            <span>Real MRR</span>
            <strong>{formatMoney(book.realMrr)}/mo</strong>
          </div>
          <div className="active-book-stat">
            <span>Paused MRR</span>
            <strong>{formatMoney(book.pausedMrr)}/mo</strong>
          </div>
          <div className="active-book-stat">
            <span>Paying clients</span>
            <strong>{formatNumber(book.payingClientCount)}</strong>
          </div>
          <div className="active-book-stat warning">
            <span>Phantom subs excluded</span>
            <strong>
              {formatNumber(book.phantomCount)} · {formatMoney(book.phantomMrr)}/mo
            </strong>
          </div>
        </div>
      </div>
      <div className="active-book-table-wrap">
        <table className="active-book-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Stage</th>
              <th className="num">MRR</th>
              <th>Since</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {book.clients.map((client) => (
              <tr
                key={`${client.contactId}-${client.flag}`}
                className={client.flag && client.flag !== "ok" ? `flag-${client.flag}` : ""}
              >
                <td>
                  {client.name}
                  {client.company ? <small> · {client.company}</small> : null}
                </td>
                <td>{client.stage ?? "—"}</td>
                <td className="num">
                  {client.mrr > 0 ? `${formatMoney(client.mrr)}/mo` : "—"}
                </td>
                <td>{client.subscriptionSince ? formatDate(client.subscriptionSince).split(",")[0] : "—"}</td>
                <td>{ACTIVE_BOOK_FLAG_LABELS[client.flag ?? "ok"]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {book.notes.length ? (
        <div className="active-book-notes">
          {book.notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CommissionClientDetail({ client }: { client: CommissionClientSnapshot }) {
  return (
    <section className={`commission-detail ${client.status}`}>
      <div className="commission-detail-head">
        <div>
          <span>{client.accountName}</span>
          <h3>{client.name}</h3>
          <p>
            Latest payment {formatDate(client.latestPaymentAt)} /{" "}
            {formatNumber(client.activeSubscriptionCount)} active subscription
          </p>
        </div>
        <span className={`commission-status ${client.status}`}>
          {formatCommissionStatus(client.status)}
        </span>
      </div>

      <div className="commission-split-grid">
        <CommissionSplit
          label="Setup fee"
          primary={formatMoney(client.setupCollected)}
          secondary={`${formatMoney(client.setupCommissionEarned)} share`}
          target={formatMoney(client.setupFee)}
        />
        <CommissionSplit
          label="SaaS / recurring"
          primary={formatMoney(client.recurringCollected)}
          secondary={`${formatMoney(client.recurringCommissionEarned)} share`}
          target={
            client.monthlySaasFee
              ? `${formatMoney(client.monthlySaasFee)} monthly`
              : "terms needed"
          }
        />
        <CommissionSplit
          label="Failed attempts"
          primary={formatMoney(client.totalFailed)}
          secondary={`${formatNumber(client.failedTransactionCount)} failed`}
          target="watch"
        />
      </div>

      <div className="commission-payment-list">
        <PanelHeader
          title="Payment Record"
          detail={`${formatNumber(client.payments.length)} recent rows`}
        />
        {client.payments.length ? (
          client.payments.map((payment) => (
            <article
              className={`commission-payment-row ${payment.status} ${
                payment.commissionable ? "" : "excluded"
              }`}
              key={payment.id}
            >
              <div>
                <strong>{payment.description}</strong>
                <span>
                  {payment.kind} / {payment.status} / {formatDate(payment.createdAt)}
                  {payment.excludedReason ? ` / ${payment.excludedReason}` : ""}
                </span>
              </div>
              <strong>{formatMoney(payment.amount, payment.amount < 1000)}</strong>
            </article>
          ))
        ) : (
          <EmptyState text="No GHL payment records found for this contact yet." />
        )}
      </div>

      {client.notes.length ? (
        <div className="commission-note-list">
          {client.notes.map((note) => (
            <span key={note}>{note}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function CommissionMetric({
  label,
  value,
  detail,
  icon,
  tone = "calm",
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
  tone?: "calm" | "warning";
}) {
  return (
    <article className={`commission-metric ${tone}`}>
      <div className="commission-metric-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function CommissionField({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="commission-field">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function CommissionStatusBadge({
  status,
}: {
  status: CommissionClientSnapshot["status"];
}) {
  return (
    <div className={`commission-paid-status ${status}`}>
      <span>Paid Status</span>
      <strong>{formatCommissionStatus(status)}</strong>
      <small>{status === "attention" ? "Review now" : "Up to date"}</small>
    </div>
  );
}

function CommissionSplit({
  label,
  primary,
  secondary,
  target,
}: {
  label: string;
  primary: string;
  secondary: string;
  target: string;
}) {
  return (
    <article className="commission-split">
      <span>{label}</span>
      <strong>{primary}</strong>
      <p>{secondary}</p>
      <small>{target}</small>
    </article>
  );
}

function CommissionMonthRow({ month }: { month: CommissionLedgerMonth }) {
  return (
    <article className="commission-month-row">
      <strong>{formatMonth(month.month)}</strong>
      <span>{formatMoney(month.collected, true)}</span>
      <span>{formatMoney(month.commission, true)}</span>
    </article>
  );
}

function ToolsModule({
  busy,
  result,
  onSearch,
  onCreateContact,
  onAddNote,
}: {
  busy: boolean;
  result: ResultState;
  onSearch: (event: FormEvent<HTMLFormElement>) => void;
  onCreateContact: (event: FormEvent<HTMLFormElement>) => void;
  onAddNote: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="utility-layout">
      <section className="stack">
        <div className="card">
          <h2>Search Contact</h2>
          <form className="form-grid" onSubmit={onSearch}>
            <label>
              Email
              <input
                data-testid="search-email"
                name="email"
                type="email"
                placeholder="name@example.com"
              />
            </label>
            <label>
              Phone
              <input
                data-testid="search-phone"
                name="phone"
                type="tel"
                placeholder="+15555550123"
              />
            </label>
            <div className="actions full">
              <button data-testid="search-submit" disabled={busy} type="submit">
                Search
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <h2>Create Test Contact</h2>
          <form className="form-grid" onSubmit={onCreateContact}>
            <label>
              First name
              <input name="firstName" defaultValue="Test" />
            </label>
            <label>
              Last name
              <input name="lastName" defaultValue="Test" />
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                defaultValue="test@example.com"
              />
            </label>
            <label>
              Phone
              <input name="phone" type="tel" placeholder="+15555550123" />
            </label>
            <label className="full">
              Source
              <input name="source" defaultValue="AgencyOS local console" />
            </label>
            <div className="actions full">
              <button
                data-testid="create-contact-submit"
                disabled={busy}
                type="submit"
              >
                Create Contact
              </button>
              <span className="pill warn">Writes to GHL</span>
            </div>
          </form>
        </div>

        <div className="card">
          <h2>Add Contact Note</h2>
          <form className="form-grid" onSubmit={onAddNote}>
            <label>
              Contact ID
              <input name="contactId" placeholder="GHL contact id" />
            </label>
            <label className="full">
              Note
              <textarea
                name="body"
                defaultValue="Test note from AgencyOS local console."
              />
            </label>
            <div className="actions full">
              <button data-testid="add-note-submit" disabled={busy} type="submit">
                Add Note
              </button>
              <span className="pill warn">Writes to GHL</span>
            </div>
          </form>
        </div>
      </section>

      <aside className="card result-card">
        <h2>{result.title}</h2>
        <pre className="result" data-testid="result-panel">
          {pretty(result.body)}
        </pre>
      </aside>
    </div>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-item">
      <strong>{label}</strong>
      <p>{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | undefined;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value === undefined ? "..." : formatNumber(value)}</strong>
      <p>{detail}</p>
    </article>
  );
}

function PanelHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <span>{detail}</span>
    </div>
  );
}

function StageRow({
  stage,
  maxCount,
  selected,
  onSelect,
}: {
  stage: MissionControlStage;
  maxCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`stage-row stage-button ${selected ? "selected" : ""}`}
      data-testid={`stage-row-${stage.stageId}`}
      onClick={onSelect}
      type="button"
    >
      <div className="row-heading">
        <strong>{stage.stageName}</strong>
        <span>{stage.pipelineName}</span>
      </div>
      <div className="bar-track" aria-hidden="true">
        <div
          className="bar-fill"
          style={{
            width: `${Math.max(8, (stage.count / maxCount) * 100)}%`,
          }}
        />
      </div>
      <div className="row-meta">
        <span>{formatNumber(stage.count)} opps</span>
        <span>{formatNumber(stage.value)} value</span>
      </div>
    </button>
  );
}

function StageDrilldown({
  stage,
  opportunities,
}: {
  stage: MissionControlStage | null;
  opportunities: MissionControlOpportunity[];
}) {
  return (
    <section className="panel" data-testid="stage-drilldown">
      <PanelHeader
        title={stage ? stage.stageName : "Stage Drilldown"}
        detail={stage ? stage.pipelineName : "Select a stage"}
      />
      <div className="drilldown-summary">
        <MetricMini label="Opps" value={stage?.count} />
        <MetricMini label="Value" value={stage?.value} />
      </div>
      <OpportunityMiniList
        emptyText="No opportunities returned for this stage in the current sample."
        opportunities={opportunities}
      />
    </section>
  );
}

function AiAgentEffectivenessPanel({
  insight,
}: {
  insight: AiAgentEffectivenessSnapshot | null;
}) {
  if (!insight) {
    return (
      <section className="panel">
        <PanelHeader title="AI Agent Effectiveness" detail="RT Digital" />
        <EmptyState text="Conversation analysis is loading." />
      </section>
    );
  }

  const sentimentTotal = Math.max(
    1,
    insight.sentimentBreakdown.positive +
      insight.sentimentBreakdown.neutral +
      insight.sentimentBreakdown.negative,
  );
  const topConversations = insight.conversations.slice(0, 8);

  return (
    <section className="ai-agent-panel" data-testid="ai-agent-effectiveness">
      <div className="active-client-command-header">
        <div className="title-block compact-title">
          <h2>AI Agent Effectiveness</h2>
          <p>{insight.accountName}</p>
        </div>
        <div className="command-focus">
          <span>Analysis sample</span>
          <strong>{formatNumber(insight.sample.messagesAnalyzed)} messages</strong>
        </div>
      </div>

      <div className="ai-agent-layout">
        <section className="ai-score-card">
          <span>Agent score</span>
          <strong>{formatNumber(insight.score)}</strong>
          <p>{insight.verdict}</p>
        </section>

        <div className="ai-agent-metrics">
          <AiStat
            label="Response rate"
            value={`${formatNumber(insight.kpis.responseRate)}%`}
            detail={`${formatNumber(insight.sample.inboundReplies)} inbound replies`}
          />
          <AiStat
            label="Positive share"
            value={`${formatNumber(insight.kpis.positiveSentimentShare)}%`}
            detail={`${formatNumber(insight.sentimentBreakdown.positive)} positive threads`}
          />
          <AiStat
            label="Booking signals"
            value={formatNumber(insight.kpis.bookingIntentCount)}
            detail="Appointments or booking intent"
          />
          <AiStat
            label="Needs review"
            value={formatNumber(
              insight.kpis.handoffOrStopCount + insight.kpis.objectionCount,
            )}
            detail="Stop, handoff, or objection"
          />
        </div>
      </div>

      <div className="ai-agent-workbench">
        <section className="ai-signal-card">
          <PanelHeader title="Sentiment Mix" detail="Recent conversations" />
          <div className="sentiment-bars">
            <SentimentBar
              count={insight.sentimentBreakdown.positive}
              label="Positive"
              tone="positive"
              total={sentimentTotal}
            />
            <SentimentBar
              count={insight.sentimentBreakdown.neutral}
              label="Neutral"
              tone="neutral"
              total={sentimentTotal}
            />
            <SentimentBar
              count={insight.sentimentBreakdown.negative}
              label="Negative"
              tone="negative"
              total={sentimentTotal}
            />
          </div>

          <div className="channel-breakdown">
            {insight.channelBreakdown.map((channel) => (
              <article className="channel-row" key={channel.channel}>
                <strong>{formatChannel(channel.channel)}</strong>
                <span>
                  {formatNumber(channel.conversations)} threads /{" "}
                  {formatNumber(channel.messages)} messages
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="ai-conversation-card">
          <PanelHeader
            title="Conversation Signals"
            detail={`${formatNumber(topConversations.length)} shown`}
          />
          <div className="ai-conversation-list">
            {topConversations.map((conversation) => (
              <article
                className={`ai-conversation-row risk-${conversation.riskLevel}`}
                key={conversation.id}
              >
                <div>
                  <div className="ai-row-heading">
                    <strong>{conversation.contactName}</strong>
                    <span>{formatDate(conversation.lastMessageAt)}</span>
                  </div>
                  <p>{conversation.outcome}</p>
                  <div className="ai-row-pills">
                    <span>{conversation.sentiment}</span>
                    <span>{conversation.intent.replace("_", " ")}</span>
                    <span>{formatNumber(conversation.responseQualityScore)} score</span>
                    <span>{formatNumber(conversation.messagesAnalyzed)} msgs</span>
                  </div>
                  <TagList tags={conversation.tags} />
                </div>
                <div className="evidence-list">
                  {conversation.evidence.map((evidence) => (
                    <blockquote key={evidence}>{evidence}</blockquote>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-note-row">
        {insight.notes.map((note) => (
          <span key={note}>{note}</span>
        ))}
      </div>
    </section>
  );
}

function AiStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="ai-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function SentimentBar({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: "positive" | "neutral" | "negative";
}) {
  return (
    <div className={`sentiment-bar tone-${tone}`}>
      <div>
        <strong>{label}</strong>
        <span>{formatNumber(count)}</span>
      </div>
      <div className="bar-track" aria-hidden="true">
        <div
          className="bar-fill"
          style={{ width: `${Math.max(count ? 8 : 0, (count / total) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ActiveClientsPanel({
  activeClients,
}: {
  activeClients: MissionControlActiveClients | null;
}) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(
    null,
  );
  const [detail, setDetail] = useState<ActiveClientDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectedStage =
    activeClients?.stages.find((stage) => stage.stageId === selectedStageId) ??
    null;
  const selectedStageKey =
    activeClients && selectedStage
      ? stageKey(activeClients.pipelineId, selectedStage.stageId)
      : null;
  const stageOpportunities =
    activeClients && selectedStageKey
      ? (activeClients.opportunitiesByStage[selectedStageKey] ?? [])
      : [];
  const selectedOpportunity =
    stageOpportunities.find((opportunity) => opportunity.id === selectedOpportunityId) ??
    stageOpportunities[0] ??
    null;
  const maxClientStageCount = Math.max(
    1,
    ...(activeClients?.stages.map((stage) => stage.count) ?? []),
  );

  useEffect(() => {
    if (!activeClients) {
      return;
    }

    if (
      selectedStageId &&
      activeClients.stages.some((stage) => stage.stageId === selectedStageId)
    ) {
      return;
    }

    setSelectedStageId(defaultActiveClientStageId(activeClients.stages));
  }, [activeClients, selectedStageId]);

  useEffect(() => {
    if (
      selectedOpportunityId &&
      stageOpportunities.some(
        (opportunity) => opportunity.id === selectedOpportunityId,
      )
    ) {
      return;
    }

    setSelectedOpportunityId(stageOpportunities[0]?.id ?? null);
  }, [selectedOpportunityId, stageOpportunities]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!selectedOpportunity?.contactId) {
        setDetail(null);
        setDetailError(null);
        setDetailBusy(false);
        return;
      }

      setDetailBusy(true);
      setDetailError(null);

      try {
        const params = new URLSearchParams({
          contactId: selectedOpportunity.contactId,
          opportunityId: selectedOpportunity.id,
        });
        const envelope = await getJson<ActiveClientDetail>(
          `/api/ghl/active-client-detail?${params.toString()}`,
        );

        if (!envelope.ok) {
          throw new Error(envelope.error?.message ?? "Client detail failed.");
        }

        if (!cancelled) {
          setDetail(envelope.data);
        }
      } catch (error) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(
            error instanceof Error ? error.message : "Client detail failed.",
          );
        }
      } finally {
        if (!cancelled) {
          setDetailBusy(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedOpportunity]);

  if (!activeClients) {
    return (
      <section className="panel">
        <PanelHeader title="Active Clients" detail="Pipeline not found" />
        <EmptyState text="No Active Clients pipeline was returned by GHL." />
      </section>
    );
  }

  return (
    <section className="active-clients-panel" data-testid="active-clients">
      <div className="active-client-command-header">
        <div className="title-block compact-title">
          <h2>Active Clients</h2>
          <p>{activeClients.pipelineName}</p>
        </div>
        <div className="command-focus">
          <span>Focused category</span>
          <strong>{selectedStage?.stageName ?? "Loading"}</strong>
        </div>
      </div>

      <div className="client-health-grid primary-client-health">
        <MetricMini
          label="Clients"
          value={activeClients.sampledOpportunityCount}
        />
        <MetricMini label="Urgent" value={activeClients.urgentCount} />
        <MetricMini label="Onboarding" value={activeClients.onboardingCount} />
        <MetricMini label="Paused" value={activeClients.pausedCount} />
        <MetricMini
          label="Exiting/cancelled"
          value={activeClients.exitingOrCancelledCount}
        />
        <MetricMini label="Value" value={activeClients.sampledValue} />
      </div>

      <div className="active-client-workbench">
        <aside className="client-stage-rail" aria-label="Active client categories">
          <div className="lane-header">
            <div>
              <span>Categories</span>
              <strong>{formatNumber(activeClients.stages.length)}</strong>
            </div>
          </div>
          <div className="client-stage-stack">
            {activeClients.stages.map((stage) => {
              const selected = stage.stageId === selectedStage?.stageId;
              const tone = clientStageTone(stage.stageName);

              return (
                <button
                  className={`client-stage-button tone-${tone} ${
                    selected ? "selected" : ""
                  }`}
                  key={stage.stageId}
                  onClick={() => setSelectedStageId(stage.stageId)}
                  type="button"
                >
                  <span className="stage-dot" aria-hidden="true" />
                  <span className="stage-button-main">
                    <strong>{stage.stageName}</strong>
                    <span>{formatNumber(stage.value)} value</span>
                  </span>
                  <span className="stage-button-count">
                    {formatNumber(stage.count)}
                  </span>
                  <span className="stage-button-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.max(
                          stage.count ? 8 : 0,
                          (stage.count / maxClientStageCount) * 100,
                        )}%`,
                      }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="client-list-panel" aria-label="Clients in selected category">
          <div className="lane-header">
            <div>
              <span>Clients</span>
              <strong>{selectedStage?.stageName ?? "Select a category"}</strong>
            </div>
            <div className="lane-meta">
              <span>{formatNumber(stageOpportunities.length)} shown</span>
              <span>{formatNumber(selectedStage?.value)} value</span>
            </div>
          </div>

          <div className="active-client-list">
            {stageOpportunities.length ? (
              stageOpportunities.map((opportunity) => (
                <button
                  className={`active-client-row ${
                    selectedOpportunity?.id === opportunity.id ? "selected" : ""
                  }`}
                  key={opportunity.id}
                  onClick={() => setSelectedOpportunityId(opportunity.id)}
                  type="button"
                >
                  <div className="client-row-main">
                    <strong>{opportunity.name}</strong>
                    <p>
                      {opportunity.contactName ??
                        opportunity.source ??
                        "No contact name"}
                    </p>
                    <div className="client-row-signals">
                      <span>{formatDate(opportunity.updatedAt)}</span>
                      <span>{formatDays(opportunity.daysSinceStageChange)}</span>
                    </div>
                    <TagList tags={opportunity.tags.slice(0, 3)} />
                  </div>
                  <div className="client-row-meta">
                    <span className="status-pill">{opportunity.status}</span>
                    <span>{formatNumber(opportunity.value)}</span>
                  </div>
                </button>
              ))
            ) : (
              <EmptyState text="No clients returned for this stage." />
            )}
          </div>
        </section>

        <ClientDetailInspector
          busy={detailBusy}
          detail={detail}
          error={detailError}
          opportunity={selectedOpportunity}
        />
      </div>
    </section>
  );
}

function ClientDetailInspector({
  opportunity,
  detail,
  busy,
  error,
}: {
  opportunity: MissionControlOpportunity | null;
  detail: ActiveClientDetail | null;
  busy: boolean;
  error: string | null;
}) {
  if (!opportunity) {
    return (
      <section className="client-detail-panel">
        <PanelHeader title="Client Detail" detail="No client selected" />
        <EmptyState text="Select a client row to see details." />
      </section>
    );
  }

  return (
    <section className="client-detail-panel" data-testid="active-client-detail">
      <PanelHeader
        title={detail?.contact?.name ?? opportunity.name}
        detail={opportunity.stageName}
      />
      <div className="client-detail-content">
        <div className="detail-kpi-grid">
          <MetricMini label="Value" value={opportunity.value} />
          <MetricMini
            label="Days in stage"
            value={opportunity.daysSinceStageChange}
          />
          <MetricMini
            label="Notes"
            value={busy ? undefined : detail?.notes.length ?? 0}
          />
          <MetricMini
            label="Tasks"
            value={busy ? undefined : detail?.tasks.length ?? 0}
          />
        </div>
        {error ? <p className="detail-error">{error}</p> : null}
        {busy ? <SkeletonRows count={4} /> : null}
        {!busy ? (
          <>
          <div className="detail-facts">
            <span>Status: {opportunity.status}</span>
            <span>Source: {opportunity.source ?? detail?.contact?.source ?? "n/a"}</span>
            <span>Updated: {formatDate(opportunity.updatedAt)}</span>
            <span>Created: {formatDate(opportunity.createdAt)}</span>
          </div>
          <TagList tags={(detail?.contact?.tags.length ? detail.contact.tags : opportunity.tags).slice(0, 10)} />
          <DetailSection
            emptyText="No notes returned for this contact."
            items={detail?.notes ?? []}
            title="Latest Notes"
            renderItem={(note) => (
              <>
                <strong>{formatDate(note.dateAdded)}</strong>
                <p>{note.body}</p>
              </>
            )}
          />
          <DetailSection
            emptyText="No tasks returned for this contact."
            items={detail?.tasks ?? []}
            title="Tasks"
            renderItem={(task) => (
              <>
                <strong>{task.title}</strong>
                <p>
                  {task.status ?? (task.completed ? "completed" : "open")} /{" "}
                  {formatDate(task.dueDate ?? task.dateAdded)}
                </p>
              </>
            )}
          />
          <DetailSection
            emptyText="No appointments returned for this contact."
            items={detail?.appointments ?? []}
            title="Appointments"
            renderItem={(appointment) => (
              <>
                <strong>{appointment.title}</strong>
                <p>
                  {appointment.status ?? "appointment"} /{" "}
                  {formatDate(appointment.startTime)}
                </p>
              </>
            )}
          />
          <DetailSection
            emptyText="No conversations returned for this contact."
            items={detail?.conversations ?? []}
            title="Conversations"
            renderItem={(conversation) => (
              <>
                <strong>
                  {conversation.direction ?? "message"} /{" "}
                  {formatDate(conversation.lastMessageAt)}
                </strong>
                <p>{conversation.lastMessageSnippet || conversation.channel || "Thread"}</p>
              </>
            )}
          />
          </>
        ) : null}
      </div>
    </section>
  );
}

function LeadSummaryPanel({
  leadSummary,
}: {
  leadSummary: LeadSummarySnapshot | null;
}) {
  if (!leadSummary) {
    return (
      <section className="panel lead-summary-panel" data-testid="lead-summary">
        <PanelHeader title="Doctor Damp Lead Summary" detail="Loading" />
        <EmptyState text="Lead summary is loading." />
      </section>
    );
  }

  return (
    <section className="panel lead-summary-panel" data-testid="lead-summary">
      <div className="panel-header">
        <div>
          <h2>Doctor Damp Lead Summary</h2>
          <span>
            Location PkoELbKfvhIzmaYMsV4r / new leads since March 1, 2026 /
            showing {formatNumber(leadSummary.fetchedContacts)}
          </span>
        </div>
        <span className="section-badge">Updated {formatDate(leadSummary.generatedAt)}</span>
      </div>

      {leadSummary.possibleLocationMismatch ? (
        <div className="lead-warning" role="alert">
          <strong>This does not look like Doctor Damp yet.</strong>
          <span>
            Doctor Damp should have about 20 leads, but the current
            Doctor Damp location reports {formatNumber(leadSummary.totalContacts)} total contacts.
            This panel is filtered to leads added since March 1, 2026.
          </span>
        </div>
      ) : null}

      {leadSummary.accessIssues.length ? (
        <div className="lead-warning" role="alert">
          <strong>Doctor Damp is not accessible with the current token.</strong>
          <span>
            HighLevel rejected this token for location PkoELbKfvhIzmaYMsV4r.
            Create or install a Private Integration token for the Doctor Damp
            sub-account, then update GHL_API_KEY or use a dedicated Doctor Damp token.
          </span>
        </div>
      ) : null}

      <div className="lead-summary-metrics">
        <MetricMini label="Total in location" value={leadSummary.totalContacts} />
        <MetricMini label="New since Mar 1" value={leadSummary.fetchedContacts} />
        <MetricMini label="With conversations" value={leadSummary.enrichedContacts} />
        <MetricMini label="Sources" value={leadSummary.sourceBreakdown.length} />
      </div>

      <div className="lead-summary-grid">
        <section className="lead-breakdown-card">
          <PanelHeader title="Lead Sources" detail="Latest sample" />
          <div className="lead-breakdown-list">
            {leadSummary.sourceBreakdown.map((source) => (
              <article className="channel-row" key={source.source}>
                <strong>{source.source}</strong>
                <span>{formatNumber(source.count)}</span>
              </article>
            ))}
          </div>

          <PanelHeader title="Top Tags" detail="Signals" />
          <div className="lead-tag-cloud">
            {leadSummary.tagBreakdown.map((tag) => (
              <span className="tag" key={tag.tag}>
                {tag.tag} / {formatNumber(tag.count)}
              </span>
            ))}
          </div>
        </section>

        <section className="lead-list-card lead-list-card-primary">
          <PanelHeader
            title={
              leadSummary.possibleLocationMismatch
                ? "Loaded Leads From Current Location"
                : "Doctor Damp Leads"
            }
            detail={`${formatNumber(leadSummary.leads.length)} lead records`}
          />
          <div className="lead-list">
            {leadSummary.leads.map((lead) => (
              <article className="lead-row" key={lead.id}>
                <div className="lead-row-main">
                  <div className="ai-row-heading">
                    <strong>{lead.name}</strong>
                    <span>{formatDate(lead.dateAdded)}</span>
                  </div>
                  <p>{lead.summary}</p>
                  <div className="lead-contact-grid">
                    <span>{lead.companyName ?? "No company"}</span>
                    <span>{lead.email ?? "No email"}</span>
                    <span>{lead.phone ?? "No phone"}</span>
                    <span>{lead.address ?? "No address on file"}</span>
                  </div>
                  <div className="ai-row-pills">
                    {lead.statusSignals.map((signal) => (
                      <span key={signal}>{signal}</span>
                    ))}
                  </div>
                  <TagList tags={lead.tags.slice(0, 6)} />
                </div>

                <div className="lead-evidence">
                  {lead.conversations.length ? (
                    lead.conversations.map((conversation) => (
                      <blockquote key={conversation.id}>
                        <strong>
                          {formatChannel(conversation.channel)} /{" "}
                          {conversation.direction ?? "message"} /{" "}
                          {formatDate(conversation.lastMessageAt)}
                        </strong>
                        <span>
                          {conversation.lastMessageSnippet || "No message preview"}
                        </span>
                      </blockquote>
                    ))
                  ) : (
                    <span className="empty-state">No recent conversation in sample.</span>
                  )}
                  {lead.customFieldHighlights.map((highlight, index) => (
                    <blockquote key={`${lead.id}-field-${index}`}>
                      <strong>Field note</strong>
                      <span>{highlight}</span>
                    </blockquote>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="dashboard-note-row">
        {leadSummary.notes.map((note) => (
          <span key={note}>{note}</span>
        ))}
      </div>
    </section>
  );
}

function DoctorDampFlowsPanel({
  leadSummary,
}: {
  leadSummary: LeadSummarySnapshot | null;
}) {
  if (!leadSummary) {
    return (
      <section className="panel lead-flow-panel" data-testid="doctor-damp-flows">
        <PanelHeader title="Doctor Damp Inbound Lead Flows" detail="Loading" />
        <EmptyState text="Inbound lead flow data is loading." />
      </section>
    );
  }

  const flows = buildLeadFlows(leadSummary);
  const maxSourceCount = Math.max(1, ...flows.map((flow) => flow.count));
  const totals = flows.reduce(
    (summary, flow) => ({
      leads: summary.leads + flow.count,
      conversations: summary.conversations + flow.conversations,
      booked: summary.booked + flow.booked,
      highIntent: summary.highIntent + flow.highIntent,
      stopped: summary.stopped + flow.stopped,
    }),
    { leads: 0, conversations: 0, booked: 0, highIntent: 0, stopped: 0 },
  );

  return (
    <section className="panel lead-flow-panel" data-testid="doctor-damp-flows">
      <div className="panel-header">
        <div>
          <h2>Doctor Damp Inbound Lead Flows</h2>
          <span>
            Source-to-outcome view / new leads since March 1, 2026 /{" "}
            {formatNumber(totals.leads)} leads
          </span>
        </div>
        <span className="section-badge">Updated {formatDate(leadSummary.generatedAt)}</span>
      </div>

      {leadSummary.accessIssues.length ? (
        <div className="lead-warning" role="alert">
          <strong>Doctor Damp lead flow is blocked.</strong>
          <span>
            The Dr. Damp token could not read one or more required GHL endpoints.
          </span>
        </div>
      ) : null}

      <div className="lead-flow-kpis">
        <MetricMini label="Inbound leads" value={totals.leads} />
        <MetricMini label="Conversation activity" value={totals.conversations} />
        <MetricMini label="Booking signals" value={totals.booked} />
        <MetricMini label="Needs review" value={totals.stopped} />
      </div>

      <div className="lead-flow-grid">
        <section className="lead-flow-map">
          <PanelHeader title="Source Flow" detail={`${formatNumber(flows.length)} sources`} />
          <div className="lead-flow-list">
            {flows.map((flow) => (
              <article className="lead-flow-row" key={flow.source}>
                <div className="lead-flow-row-head">
                  <strong>{flow.source}</strong>
                  <span>{formatNumber(flow.count)} leads</span>
                </div>
                <div className="lead-flow-track" aria-hidden="true">
                  <span
                    className="lead-flow-total"
                    style={{ width: `${Math.max(10, (flow.count / maxSourceCount) * 100)}%` }}
                  />
                  <span
                    className="lead-flow-conversation"
                    style={{
                      width: `${flow.count ? Math.max(6, (flow.conversations / flow.count) * 100) : 0}%`,
                    }}
                  />
                </div>
                <div className="lead-flow-outcomes">
                  <span>{formatNumber(flow.conversations)} active</span>
                  <span>{formatNumber(flow.booked)} booked</span>
                  <span>{formatNumber(flow.highIntent)} high intent</span>
                  <span>{formatNumber(flow.stopped)} review</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="lead-flow-actions">
          <PanelHeader title="Operating Readout" detail="What the flow suggests" />
          <FlowInsight
            detail="Leads with at least one recent message or conversation preview."
            label="Conversation coverage"
            value={`${formatNumber(percentage(totals.conversations, totals.leads))}%`}
          />
          <FlowInsight
            detail="Tags or signals that mention booked appointments or booking intent."
            label="Booking signal rate"
            value={`${formatNumber(percentage(totals.booked, totals.leads))}%`}
          />
          <FlowInsight
            detail="Leads tagged hot, interested, qualified, or equivalent."
            label="High-intent share"
            value={`${formatNumber(percentage(totals.highIntent, totals.leads))}%`}
          />
          <FlowInsight
            detail="AI off, stop, unsubscribe, or other human-review signals."
            label="Review load"
            value={`${formatNumber(percentage(totals.stopped, totals.leads))}%`}
          />
        </section>
      </div>
    </section>
  );
}

function WorkflowIntelligencePanel({
  workflowIntelligence,
}: {
  workflowIntelligence: WorkflowIntelligenceSnapshot | null;
}) {
  const [selectedCategory, setSelectedCategory] = useState<WorkflowCategory | "all">(
    "all",
  );

  if (!workflowIntelligence) {
    return (
      <section
        className="panel workflow-intelligence-panel"
        data-testid="workflow-intelligence"
      >
        <PanelHeader title="Doctor Damp Workflow Intelligence" detail="Loading" />
        <EmptyState text="Workflow intelligence data is loading." />
      </section>
    );
  }

  const filteredWorkflows =
    selectedCategory === "all"
      ? workflowIntelligence.workflows
      : workflowIntelligence.workflows.filter(
          (workflow) => workflow.category === selectedCategory,
        );

  return (
    <section
      className="panel workflow-intelligence-panel"
      data-testid="workflow-intelligence"
    >
      <div className="panel-header">
        <div>
          <h2>Doctor Damp Workflow Intelligence</h2>
          <span>
            Read-only workflow map / {formatNumber(workflowIntelligence.totalWorkflows)}{" "}
            workflows / {formatNumber(workflowIntelligence.publishedCount)} published
          </span>
        </div>
        <span className="section-badge">
          Updated {formatDate(workflowIntelligence.generatedAt)}
        </span>
      </div>

      {workflowIntelligence.accessIssues.length ? (
        <div className="lead-warning" role="alert">
          <strong>Workflow data is blocked.</strong>
          <span>
            The Doctor Damp token could not read workflows. Check the Private
            Integration scopes for this sub-account.
          </span>
        </div>
      ) : null}

      <div className="workflow-kpis">
        <MetricMini label="Total workflows" value={workflowIntelligence.totalWorkflows} />
        <MetricMini label="Published" value={workflowIntelligence.publishedCount} />
        <MetricMini label="Draft" value={workflowIntelligence.draftCount} />
        <MetricMini
          label="Updated 30d"
          value={workflowIntelligence.recentlyUpdatedCount}
        />
      </div>

      <div className="workflow-layout">
        <section className="workflow-priority">
          <PanelHeader
            title="Priority Review"
            detail={`${formatNumber(workflowIntelligence.priorityReviews.length)} items`}
          />
          {workflowIntelligence.priorityReviews.length ? (
            <div className="workflow-priority-list">
              {workflowIntelligence.priorityReviews.map((workflow) => (
                <WorkflowReviewCard key={workflow.id} workflow={workflow} />
              ))}
            </div>
          ) : (
            <EmptyState text="No medium or high review workflows detected." />
          )}
        </section>

        <aside className="workflow-sidebar">
          <PanelHeader title="Categories" detail="Click to filter" />
          <div className="workflow-filter-list">
            <button
              className={selectedCategory === "all" ? "selected" : ""}
              onClick={() => setSelectedCategory("all")}
              type="button"
            >
              <span>All workflows</span>
              <strong>{formatNumber(workflowIntelligence.totalWorkflows)}</strong>
            </button>
            {workflowIntelligence.categoryBreakdown.map((category) => (
              <button
                className={
                  selectedCategory === category.category ? "selected" : ""
                }
                key={category.category}
                onClick={() => setSelectedCategory(category.category)}
                type="button"
              >
                <span>{formatWorkflowCategory(category.category)}</span>
                <strong>{formatNumber(category.count)}</strong>
              </button>
            ))}
          </div>

          <PanelHeader title="Status" detail="Published vs draft" />
          <div className="workflow-status-list">
            {workflowIntelligence.statusBreakdown.map((status) => (
              <span key={status.status}>
                <strong>{formatNumber(status.count)}</strong>
                {status.status}
              </span>
            ))}
          </div>
        </aside>
      </div>

      <section className="workflow-table-section">
        <PanelHeader
          title="Workflow Map"
          detail={`${formatNumber(filteredWorkflows.length)} shown`}
        />
        <div className="workflow-table">
          {filteredWorkflows.map((workflow) => (
            <article className="workflow-row" key={workflow.id}>
              <div className="workflow-row-main">
                <div>
                  <strong>{workflow.name}</strong>
                  <p>{workflow.purpose}</p>
                </div>
                <span className={`risk-pill ${workflow.riskLevel}`}>
                  {workflow.riskLevel}
                </span>
              </div>
              <div className="workflow-row-meta">
                <span>{formatWorkflowCategory(workflow.category)}</span>
                <span>{workflow.status}</span>
                <span>v{workflow.version ?? "?"}</span>
                <span>{formatDate(workflow.updatedAt)}</span>
              </div>
              <TagList tags={[...workflow.signals, ...workflow.relatedLeadTags].slice(0, 8)} />
            </article>
          ))}
        </div>
      </section>

      <div className="dashboard-note-row">
        {workflowIntelligence.notes.map((note) => (
          <span key={note}>{note}</span>
        ))}
      </div>
    </section>
  );
}

function WorkflowReviewCard({ workflow }: { workflow: WorkflowIntelligenceRow }) {
  return (
    <article className={`workflow-review-card ${workflow.riskLevel}`}>
      <div>
        <strong>{workflow.name}</strong>
        <p>{workflow.purpose}</p>
      </div>
      <div className="workflow-review-meta">
        <span>{formatWorkflowCategory(workflow.category)}</span>
        <span>{workflow.status}</span>
        <span>{formatDate(workflow.updatedAt)}</span>
      </div>
    </article>
  );
}

function FlowInsight({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="flow-insight">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function buildLeadFlows(leadSummary: LeadSummarySnapshot) {
  const bySource = new Map<
    string,
    {
      source: string;
      count: number;
      conversations: number;
      booked: number;
      highIntent: number;
      stopped: number;
    }
  >();

  for (const lead of leadSummary.leads) {
    const source = lead.source ?? "Unknown source";
    const flow =
      bySource.get(source) ??
      {
        source,
        count: 0,
        conversations: 0,
        booked: 0,
        highIntent: 0,
        stopped: 0,
      };
    const signalText = `${lead.tags.join(" ")} ${lead.statusSignals.join(" ")}`.toLowerCase();

    flow.count += 1;
    flow.conversations += lead.conversations.length > 0 ? 1 : 0;
    flow.booked += /book|appointment|calendar|meeting/.test(signalText) ? 1 : 0;
    flow.highIntent += /hot|interested|qualified|high-intent/.test(signalText) ? 1 : 0;
    flow.stopped += /ai off|stop|unsubscribe|review/.test(signalText) ? 1 : 0;
    bySource.set(source, flow);
  }

  return Array.from(bySource.values()).sort(
    (a, b) => b.count - a.count || a.source.localeCompare(b.source),
  );
}

function DetailSection<T>({
  title,
  items,
  emptyText,
  renderItem,
}: {
  title: string;
  items: T[];
  emptyText: string;
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <div className="detail-section">
      <h3>{title}</h3>
      {items.length ? (
        <div className="detail-list">
          {items.map((item, index) => (
            <article className="detail-list-item" key={index}>
              {renderItem(item)}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState text={emptyText} />
      )}
    </div>
  );
}

function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) {
    return null;
  }

  return (
    <div className="tag-list">
      {tags.map((tag, index) => (
        <span className="tag" key={`${tag}-${index}`}>
          {tag}
        </span>
      ))}
    </div>
  );
}

function defaultActiveClientStageId(stages: MissionControlStage[]) {
  const preferred =
    stages.find((stage) => stage.count > 0 && stage.stageName === "Urgent") ??
    stages.find(
      (stage) =>
        stage.count > 0 &&
        !["cancelled", "exiting"].some((term) =>
          stage.stageName.toLowerCase().includes(term),
        ),
    ) ??
    stages.find((stage) => stage.count > 0) ??
    stages[0];

  return preferred?.stageId ?? null;
}

function clientStageTone(stageName: string) {
  const name = stageName.toLowerCase();

  if (
    name.includes("urgent") ||
    name.includes("exiting") ||
    name.includes("cancel")
  ) {
    return "risk";
  }

  if (name.includes("paused")) {
    return "pause";
  }

  if (name.includes("onboarding") || name.includes("building")) {
    return "build";
  }

  if (name.includes("active") || name.includes("live")) {
    return "active";
  }

  return "neutral";
}

function MetricMini({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="mini-metric">
      <span>{label}</span>
      <strong>{value === undefined ? "..." : formatNumber(value)}</strong>
    </div>
  );
}

function OpportunityMiniList({
  opportunities,
  emptyText,
}: {
  opportunities: MissionControlOpportunity[];
  emptyText: string;
}) {
  if (!opportunities.length) {
    return <EmptyState text={emptyText} />;
  }

  return (
    <div className="mini-opportunity-list">
      {opportunities.slice(0, 12).map((opportunity) => (
        <article className="mini-opportunity" key={opportunity.id}>
          <div>
            <strong>{opportunity.name}</strong>
            <p>{opportunity.contactName ?? opportunity.stageName}</p>
          </div>
          <div className="mini-opportunity-meta">
            <span className="status-pill">{opportunity.status}</span>
            <span>{formatNumber(opportunity.value)}</span>
            <span>{formatDate(opportunity.updatedAt)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function FollowUpRow({ followUp }: { followUp: MissionControlFollowUp }) {
  return (
    <article className="list-row">
      <div>
        <strong>{followUp.title}</strong>
        <p>{followUp.reason}</p>
      </div>
      <span className={`priority ${followUp.priority}`}>{followUp.type}</span>
    </article>
  );
}

function OpportunityTable({
  opportunities,
}: {
  opportunities: MissionControlOpportunity[];
}) {
  if (!opportunities.length) {
    return <EmptyState text="No recent opportunities returned." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Opportunity</th>
            <th>Stage</th>
            <th>Status</th>
            <th>Value</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((opportunity) => (
            <tr key={opportunity.id}>
              <td>
                <strong>{opportunity.name}</strong>
                <span>{opportunity.contactName ?? opportunity.pipelineName}</span>
              </td>
              <td>{opportunity.stageName}</td>
              <td>
                <span className="status-pill">{opportunity.status}</span>
              </td>
              <td>{formatNumber(opportunity.value)}</td>
              <td>{formatDate(opportunity.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConversationList({
  conversations,
}: {
  conversations: MissionControlConversation[];
}) {
  if (!conversations.length) {
    return <EmptyState text="No recent conversations returned." />;
  }

  return (
    <div className="compact-list">
      {conversations.map((conversation) => (
        <article className="list-row" key={conversation.id}>
          <div>
            <strong>{conversation.contactName}</strong>
            <p>
              {conversation.direction ?? "Message"} /{" "}
              {formatDate(conversation.lastMessageAt)}
            </p>
          </div>
          <span className={conversation.unreadCount ? "priority high" : "priority"}>
            {conversation.unreadCount
              ? `${conversation.unreadCount} unread`
              : conversation.channel ?? "thread"}
          </span>
        </article>
      ))}
    </div>
  );
}

function CalendarList({ calendars }: { calendars: MissionControlCalendar[] }) {
  if (!calendars.length) {
    return <EmptyState text="No calendars returned." />;
  }

  return (
    <div className="calendar-grid">
      {calendars.map((calendar) => (
        <article className="calendar-item" key={calendar.id}>
          <strong>{calendar.name}</strong>
          <span>{calendar.type ?? "Calendar"}</span>
          <p>{calendar.isActive ? "Active" : "Inactive"}</p>
        </article>
      ))}
    </div>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return Array.from({ length: count }, (_, index) => (
    <div className="skeleton-row" key={index} />
  ));
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function formatNumber(value: number | undefined) {
  if (value === undefined) {
    return "0";
  }

  return numberFormatter.format(value);
}

function formatMoney(value: number | undefined, precise = false) {
  if (value === undefined) {
    return "$0";
  }

  return (precise ? preciseMoneyFormatter : moneyFormatter).format(value);
}

function formatPercent(value: number | undefined) {
  if (value === undefined) {
    return "0%";
  }

  return `${Math.round(value * 100)}%`;
}

function formatDays(value: number | undefined) {
  if (value === undefined) {
    return "n/a";
  }

  return `${formatNumber(value)}d in stage`;
}

function percentage(value: number, total: number) {
  if (!total) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function formatChannel(value: string | undefined) {
  if (!value) {
    return "Unknown";
  }

  return value.replace(/^TYPE_/, "").replace(/_/g, " ");
}

function formatCommissionStatus(value: CommissionClientSnapshot["status"]) {
  if (value === "terms-needed") {
    return "Terms needed";
  }

  if (value === "attention") {
    return "Needs attention";
  }

  if (value === "quiet") {
    return "No payments";
  }

  return "Tracking";
}

function getClientInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function buildClientFootnote(client: CommissionClientSnapshot) {
  if (client.failedTransactionCount > 0) {
    return `${formatNumber(client.failedTransactionCount)} failed payment attempt in GHL.`;
  }

  if (client.status === "terms-needed") {
    return "Terms need confirming before commission can be trusted.";
  }

  if (client.totalCollected > 0) {
    return "Commissionable payments are flowing from live GHL records.";
  }

  return "No commissionable payments found yet.";
}

function formatMonth(value: string) {
  if (value === "unknown") {
    return "Unknown";
  }

  const date = new Date(`${value}-01T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatWorkflowCategory(value: WorkflowCategory) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string | undefined) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return dateFormatter.format(date);
}
