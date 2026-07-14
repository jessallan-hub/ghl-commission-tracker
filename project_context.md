# Project Context — GHL Commission Tracker

*Last updated: 2026-07-13 (evening — active book discovery + Rich offer)*

## What this is

A Next.js dashboard that shows RT Digital's **25% commission** on client SaaS payments,
read live from the GoHighLevel API.

- **Correct root:** `~/Master/Labs/ghl-commission-tracker` (per [[Session_Root_Protocol]])
- **Old root (retired):** Google Drive `Codex GHL`
- **Live:** https://ghl-commission-tracker.vercel.app
- **Repo:** https://github.com/jessallan-hub/ghl-commission-tracker

## The one architectural fact that matters

**All client SaaS billing lives in the RT Digital agency account — NOT in the client
sub-accounts.** Querying Doctor Damp or Strategize with their own API keys returns **zero**
payments. Each client's payments are pulled from RT Digital's `/payments/*` endpoints
filtered by that client's **`contactId`**.

Consequence: the single RT Digital Private Integration Token (`GHL_API_KEY`) powers the
entire tracker. **Per-sub-account API keys are not needed for commissions.** Don't go
looking for payment data in the client subs — it isn't there.

RT Digital location ID: `NJGocUVoS8R3rPaNX21j`

## Clients

| Client | Sub-account | contactId (in RT Digital) |
|---|---|---|
| Scott Lambert | Doctor Damp | `y8eh1WsBLGM10kzXkm4D` |
| Chris McBreen | Strategize | `WAUuVZR2osEi6PcHL1Br` |
| Ben Baker | Awarepreneur Tribe | *none yet — terms not confirmed, shows $0* |

Config lives in `config/commission-clients.json` (committed — this is the prod source of
truth). `config/commission-clients.local.json` is a gitignored local override and is also
`.vercelignore`d so it can't shadow prod config.

## Commission rules (non-negotiable)

- **Only `succeeded` transactions count.** Never pending, never failed.
- **HighLevel wallet auto-recharges are excluded** (small "manual" charges — ~$762 of
  Scott's). Handled by `isCommissionablePayment`.
- Chris's **pending $8,250 V2 setup fee must NOT be counted** until it actually succeeds.
- Amounts from the GHL API are in **dollars, not cents**.

## Verified figures (as of 2026-07-13)

| | Collected | Commission (25%) |
|---|---|---|
| Scott Lambert | $12,650 | $3,162.50 |
| Chris McBreen | $6,200 | $1,550.00 |
| **Total** | **$18,850** | **$4,712.50** |

Chris also has **6 failed payment attempts totalling $22,650** — surfaced as
"Outstanding / Attention", correctly excluded from commission.

## Gotchas that have already burned hours

1. **`echo "key" | vercel env add` appends a trailing newline** that corrupts the token →
   403/401 on Vercel while local works fine. Use `printf` (no newline).
2. **Empty `contactId` → the `/payments/*` endpoints return the ENTIRE agency history**,
   misattributed to that client (Ben once showed a phantom $40k). `buildCommissionClientSnapshot`
   now skips the fetch entirely when `contactId` is empty.
3. **`"unpaid".includes("paid")` is `true`.** Order paid-status was checked with a substring
   match, so unpaid/pending orders counted as paid. Now uses exact-token matching.
4. **JSON config must be bundled with a static `require()`**, not `readFileSync` on a dynamic
   path — Next.js won't trace the latter into the Vercel serverless function.

## Tracker vs. invoice: gross vs. net (important)

The **tracker** computes 25% of **gross** amounts actually collected in GHL
(e.g. Scott's setup reads $8,250 → $2,062.50).

The **invoice to Rich** bills 25% of the **net** figures he defines, which are different:

- Scott (Dr. Damp): setup net **$5,000**; monthly net **$2,000**
- Chris (Strategize): setup net **$4,000**; monthly net **$2,000**
- Monthlies are net of GST (clients pay $2,200 inc-GST → $2,000 net)

So the tracker's total will legitimately differ from the invoice total. **This is by design,
not a bug.** GHL only ever knows gross; it cannot see Rich's overheads.

Invoices are billed to **eighteen network Pty Ltd** (the AT Network entity), bundled, plus a
flat $500 AT onboarding fee.

## Env vars

Read by the code (`lib/ghl/config.ts`):

- `GHL_API_KEY` — RT Digital PIT. **Powers everything.**
- `GHL_LOCATION_ID` — RT Digital location.
- `GHL_DOCTOR_DAMP_API_KEY` / `GHL_DOCTOR_DAMP_LOCATION_ID` — used only by the Lead Summary
  and Workflow Intelligence panels, *not* by the commission tracker.

There is **no** `GHL_STRATEGIZE_API_KEY` — it was added during a wrong turn and removed.

**Token history:** the original RT Digital PIT was rotated 2026-07-13 (Jesse rotated it in
GHL, briefly taking prod to $0/401s). Current token `pit-50989c25-…` has Payments,
Opportunities/Pipelines, Contacts, Conversations, Calendars scopes. If prod suddenly 401s
everywhere, suspect token rotation first, code second.

## Active Book panel (added 2026-07-13)

The tracker now has an **"Active Clients — Live Revenue"** section (`activeBook` on the
commission-tracker API response; `getActiveBookSnapshot` in `lib/ghl/dashboard.ts`). It joins
the **"4. Active Clients" pipeline** (id `84gykXPzp3q3F6EQe2lo`) with **all location
subscriptions** (paginated), resolves unmatched contacts, and classifies:

- `ok` — active sub + active pipeline stage
- `paying-but-marked-inactive` — live billing while in Cancelled/Exiting stage
  (label: "Paying — exiting (contract run-off)")
- `not-in-pipeline` — real named contact paying, but no opportunity in the pipeline
- `no-billing` / `paused-billing` — pipeline-active client with no/paused subscription
- **phantom** — active subs on deleted/test contacts, counted + excluded from Real MRR

## The hidden-revenue discoveries (why pipeline ≠ money)

Confirmed 2026-07-13 by sweeping the full RT Digital ledger (773 transactions, 148 subs,
31 invoices). The pipeline alone showed ~$5,000/mo; **real active MRR is ~$10,750/mo**:

1. **Duplicate contact cards** — "David and Evan" opp links contact `ngnjjmNWQSXYsk2sTj1q`
   ($13,750), but David Mahoney's **$2,500/mo sub + $19,250** sit on a second card
   `9p7tnTMtUcexupErJv5t`. Always sweep the whole ledger; never trust per-contact lookups alone.
2. **Different payer, same company** — Jennifer Bell's card shows $0, but her company
   (LV Solar & Renewable) pays via **Alf Privitera: $1,500/mo** since Sep 2025 ($29k lifetime).
3. **Contract run-off** — Patrick Franzini ($1,000/mo), Emily Scothern ($500/mo), Melissa
   Arlitsch ($250/mo) are **exiting clients paying out contracts** while staged Cancelled.
   Per Jesse this is expected, NOT mismanagement — but it means ~$1,750/mo of MRR is
   time-limited; durable book ≈ **$9,000/mo**.
4. **~14 phantom test subs** (~$3,500/mo fake MRR), batch-created 2026-04-21/22 on
   deleted/test contacts ("hot buyer" etc.). Excluded from Real MRR; should be cancelled in
   GHL. Note: "hot buyer" resolves with a name so it sneaks into Real MRR (+$250) — known
   cosmetic issue.

Recovery pools: Scott's **paused $2,000/mo** sub, **$26,500 failed payments** (mostly Chris
$22,650), **$46,200 sent-but-unpaid invoices** (Martin Speiser alone 9 × $3,300).
Cancelled stage holds 30 opps (~$168,600 lifetime value) vs 15 active — the churn story.

**No-billing clients, resolved per Jesse (2026-07-13):**
- **Bear Olive & Ben Baker — don't chase.** Known situations (Ben = AT, terms pending);
  not revenue leaks, leave them alone.
- **Jennifer Bell = LV Solar = Alf Privitera's $1,500/mo sub.** Accounted for.
- **Veronica Jones / Anstey Homes — open question.** Zero billing footprint in GHL across
  all 4 Anstey contact cards (Veronica, Phil Anstey, Cristina, company card) — no
  transactions, subs, or invoices. Either pays outside GHL or unbilled; ask Jesse/Rich.
  Possible future enhancement: `manualMrr` config field for off-platform billers.

## Commercial state (as of 2026-07-13)

- **Invoice INV-0001 to eighteen network Pty Ltd: $4,675 inc GST** ($4,250 + $425).
  Lines: Scott setup 25%×$5,000 net = $1,250; Scott monthlies 2×(25%×$2,000) = $1,000;
  Chris setup 25%×$4,000 = $1,000; Chris monthly 25%×$2,000 = $500; AT onboarding $500.
  Basis: **Rich defines the net** (Scott $7,500 gross → $5,000 net); monthlies net of GST.
  Jesse **is GST registered**. Artifact: claude.ai/code/artifact/7598105e-…
- **CSM offer to Rich (drafted, not yet sent): $1,750/mo base + 25% of collected
  active-book MRR net of GST** ≈ $4,440/mo ≈ $1,024/wk at today's book. Replaces per-client
  monthly commissions going forward; INV-0001 stands; 30-day exit. Negotiation notes: at 25%,
  run-off completion costs Jesse ~$437/mo (self-underwritten churn risk — use as counter);
  fallback structure $1,000 base + 30%. Artifact: claude.ai/code/artifact/c17e41aa-…
- Separate AT deal: $250/mo CSM retainer + "Cooker Burr's Clan" mentoring access
  (valued $777/mo) once AT ads go live.
