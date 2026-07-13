import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.env.COMMISSION_PROJECT_ROOT ?? process.cwd();
const outputDir = "/private/tmp/codex-commission-sheet";
const outputPath = path.join(outputDir, "rt-digital-commission-tracker.xlsx");
const previewPath = path.join(outputDir, "dashboard-preview.png");

const env = await readDotEnv(path.join(root, ".env.local"));
const config = JSON.parse(
  await fs.readFile(path.join(root, "config", "commission-clients.local.json"), "utf8"),
);

const locationId = env.GHL_LOCATION_ID;
const apiKey = env.GHL_API_KEY;
const baseUrl = env.GHL_API_BASE_URL ?? "https://services.leadconnectorhq.com";
const version = env.GHL_API_VERSION ?? "2021-07-28";

if (!locationId || !apiKey) {
  throw new Error("Missing RT Digital GHL env vars.");
}

const clients = [];
const payments = [];

for (const client of config) {
  const [transactions, orders, subscriptions, invoices] = await Promise.all([
    ghlCollection("/payments/transactions", client.contactId, "data"),
    ghlCollection("/payments/orders", client.contactId, "data"),
    ghlCollection("/payments/subscriptions", client.contactId, "data"),
    ghlCollection("/invoices/", client.contactId, "invoices", { offset: "0" }),
  ]);
  const successfulTransactions = transactions.filter(
    (row) => String(row.status ?? "").toLowerCase() === "succeeded",
  );
  const failedTransactions = transactions.filter(
    (row) => String(row.status ?? "").toLowerCase() === "failed",
  );
  const paidOrders = orders.filter((row) =>
    `${row.paymentStatus ?? ""} ${row.status ?? ""}`
      .toLowerCase()
      .match(/paid|completed|succeeded/),
  );
  const activeSubscriptions = subscriptions.filter(
    (row) => String(row.status ?? "").toLowerCase() === "active",
  );

  for (const row of transactions) {
    payments.push(paymentRow(client, row, "Transaction"));
  }

  for (const row of paidOrders) {
    payments.push(paymentRow(client, row, "Order"));
  }

  for (const row of activeSubscriptions) {
    payments.push(paymentRow(client, row, "Subscription"));
  }

  for (const row of invoices) {
    payments.push(paymentRow(client, row, "Invoice"));
  }

  clients.push({
    ...client,
    totalCollected: sumAmounts(successfulTransactions),
    totalFailed: sumAmounts(failedTransactions),
    successfulTransactions: successfulTransactions.length,
    failedTransactions: failedTransactions.length,
    activeSubscriptions: activeSubscriptions.length,
    invoices: invoices.length,
  });
}

payments.sort((a, b) => String(b.date).localeCompare(String(a.date)));

const workbook = Workbook.create();
const dashboard = workbook.worksheets.add("Dashboard");
const clientsSheet = workbook.worksheets.add("Clients");
const paymentsSheet = workbook.worksheets.add("Payments");
const ledgerSheet = workbook.worksheets.add("Monthly Ledger");
const notesSheet = workbook.worksheets.add("Notes");

for (const sheet of [dashboard, clientsSheet, paymentsSheet, ledgerSheet, notesSheet]) {
  sheet.showGridLines = false;
}

writeClientsSheet(clientsSheet, clients);
writePaymentsSheet(paymentsSheet, payments);
writeLedgerSheet(ledgerSheet, payments);
writeDashboard(dashboard, clients.length);
writeNotes(notesSheet);

const inspection = await workbook.inspect({
  kind: "sheet,table",
  maxChars: 4000,
  tableMaxRows: 8,
  tableMaxCols: 8,
});
console.log(inspection.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "Dashboard",
  range: "A1:J22",
  scale: 1,
  format: "png",
});
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(JSON.stringify({ outputPath, previewPath }, null, 2));

async function readDotEnv(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  const out = {};

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    out[key.trim()] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
  }

  return out;
}

async function ghlCollection(endpoint, contactId, collectionKey, extra = {}) {
  const url = new URL(endpoint, `${baseUrl}/`);
  const query = {
    altId: locationId,
    altType: "location",
    contactId,
    limit: 100,
    ...extra,
  };

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Version: version,
      "User-Agent": "Codex-GHL-Commission-Sheet/1.0",
    },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${endpoint} failed ${response.status}: ${JSON.stringify(body)}`);
  }

  return Array.isArray(body?.[collectionKey]) ? body[collectionKey] : [];
}

function paymentRow(client, row, kind) {
  const status = String(row.status ?? row.paymentStatus ?? "unknown");
  const date = row.createdAt ? new Date(row.createdAt) : row.updatedAt ? new Date(row.updatedAt) : null;

  return {
    client: client.name,
    account: client.accountName ?? client.name,
    contactId: client.contactId,
    kind,
    status,
    amount: Number(row.amount ?? row.amountPaid ?? row.total ?? 0),
    currency: String(row.currency ?? "AUD").toUpperCase(),
    date,
    month: date ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}` : "unknown",
    commissionRate: Number(client.commissionRate ?? 0),
    commissionEligible: status.toLowerCase() === "succeeded" || status.toLowerCase() === "completed" || status.toLowerCase() === "active",
  };
}

function sumAmounts(rows) {
  return rows.reduce((total, row) => total + Number(row.amount ?? row.amountPaid ?? row.total ?? 0), 0);
}

function writeClientsSheet(sheet, rows) {
  const headers = [
    "Client",
    "Account",
    "GHL Contact ID",
    "Setup Fee",
    "Monthly SaaS Fee",
    "Commission %",
    "Status",
    "GHL Collected",
    "Failed Attempts",
    "Active Subs",
    "Notes",
  ];
  const values = [
    headers,
    ...rows.map((row) => [
      row.name,
      row.accountName ?? row.name,
      row.contactId,
      row.setupFee,
      row.monthlySaasFee,
      row.commissionRate,
      row.status,
      row.totalCollected,
      row.failedTransactions,
      row.activeSubscriptions,
      (row.notes ?? []).join(" | "),
    ]),
  ];

  sheet.getRangeByIndexes(0, 0, values.length, headers.length).values = values;
  styleTable(sheet, `A1:K${values.length}`);
  sheet.getRange("D:G").format.columnWidthPx = 118;
  sheet.getRange("K:K").format.columnWidthPx = 420;
  sheet.getRange(`D2:E${values.length}`).setNumberFormat('"$"#,##0.00');
  sheet.getRange(`F2:F${values.length}`).setNumberFormat("0%");
  sheet.getRange(`H2:H${values.length}`).setNumberFormat('"$"#,##0.00');
  sheet.freezePanes.freezeRows(1);
}

function writePaymentsSheet(sheet, rows) {
  const headers = [
    "Date",
    "Month",
    "Client",
    "Account",
    "Kind",
    "Status",
    "Amount",
    "Currency",
    "Commission %",
    "Commission Amount",
    "GHL Contact ID",
  ];
  const values = [
    headers,
    ...rows.map((row) => [
      row.date,
      row.month,
      row.client,
      row.account,
      row.kind,
      row.status,
      row.amount,
      row.currency,
      row.commissionRate,
      null,
      row.contactId,
    ]),
  ];

  sheet.getRangeByIndexes(0, 0, values.length, headers.length).values = values;
  if (rows.length) {
    sheet.getRange(`J2:J${values.length}`).formulas = rows.map((_, index) => {
      const row = index + 2;

      return [
        `=IF(AND(E${row}="Transaction",F${row}="succeeded"),G${row}*I${row},0)`,
      ];
    });
  }
  styleTable(sheet, `A1:K${values.length}`);
  sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd");
  sheet.getRange(`G2:G${values.length}`).setNumberFormat('"$"#,##0.00');
  sheet.getRange(`I2:I${values.length}`).setNumberFormat("0%");
  sheet.getRange(`J2:J${values.length}`).setNumberFormat('"$"#,##0.00');
  sheet.getRange("K:K").format.columnWidthPx = 170;
  sheet.freezePanes.freezeRows(1);
}

function writeLedgerSheet(sheet, rows) {
  const months = [
    ...new Set(
      rows
        .filter((row) => row.kind === "Transaction" && row.status.toLowerCase() === "succeeded")
        .map((row) => row.month),
    ),
  ]
    .sort()
    .reverse();
  const values = [
    ["Month", "Collected", "Commission", "Payment Count"],
    ...months.map((month) => [month, null, null, null]),
  ];

  sheet.getRangeByIndexes(0, 0, values.length, 4).values = values;
  if (months.length) {
    sheet.getRange(`B2:B${values.length}`).formulas = months.map((_, index) => {
      const row = index + 2;

      return [
        `=SUMIFS(Payments!$G$2:$G$200,Payments!$B$2:$B$200,A${row},Payments!$J$2:$J$200,">0")`,
      ];
    });
    sheet.getRange(`C2:C${values.length}`).formulas = months.map((_, index) => {
      const row = index + 2;

      return [`=SUMIFS(Payments!$J$2:$J$200,Payments!$B$2:$B$200,A${row})`];
    });
    sheet.getRange(`D2:D${values.length}`).formulas = months.map((_, index) => {
      const row = index + 2;

      return [
        `=COUNTIFS(Payments!$B$2:$B$200,A${row},Payments!$J$2:$J$200,">0")`,
      ];
    });
  }
  styleTable(sheet, `A1:D${values.length}`);
  sheet.getRange(`B2:C${values.length}`).setNumberFormat('"$"#,##0.00');
  sheet.getRange(`D2:D${values.length}`).setNumberFormat("#,##0");
  sheet.freezePanes.freezeRows(1);
}

function writeDashboard(sheet, clientCount) {
  sheet.getRange("A1:J1").merge();
  sheet.getRange("A1").values = [["RT Digital Commission Tracker"]];
  sheet.getRange("A2:J2").merge();
  sheet.getRange("A2").values = [["Setup and SaaS commission ledger. Edit terms on the Clients tab; live GHL payment rows are captured on Payments."]];

  sheet.getRange("A4:B7").values = [
    ["Collected", null],
    ["25% Share Earned", null],
    ["Setup Share", null],
    ["SaaS / Recurring Share", null],
  ];
  sheet.getRange("B4:B7").formulas = [
    ['=SUMIFS(Payments!G:G,Payments!J:J,">0")'],
    ["=SUM(Payments!J:J)"],
    ["=MIN(B5,SUMPRODUCT(Clients!D2:D100,Clients!F2:F100))"],
    ["=B5-B6"],
  ];

  sheet.getRange("D4:E7").values = [
    ["Failed Attempts", null],
    ["Active Subscriptions", null],
    ["Tracked Clients", clientCount],
    ["Last Updated", new Date()],
  ];
  sheet.getRange("E4:E5").formulas = [
    ['=SUMIFS(Payments!G:G,Payments!F:F,"failed")'],
    ['=COUNTIFS(Payments!E:E,"Subscription",Payments!F:F,"active")'],
  ];

  sheet.getRange("A10:E10").values = [["Client", "Account", "Collected", "Commission", "Status"]];
  sheet.getRange(`A11:E${10 + clientCount}`).formulas = Array.from({ length: clientCount }, (_, index) => {
    const row = index + 2;
    const outRow = index + 11;

    return [
      `=Clients!A${row}`,
      `=Clients!B${row}`,
      `=SUMIFS(Payments!$G$2:$G$200,Payments!$C$2:$C$200,A${outRow},Payments!$J$2:$J$200,">0")`,
      `=SUMIFS(Payments!$J$2:$J$200,Payments!$C$2:$C$200,A${outRow})`,
      `=Clients!G${row}`,
    ];
  });

  sheet.getRange("G4:J4").values = [["Month", "Collected", "Commission", "Payments"]];
  sheet.getRange("G5:J12").formulas = Array.from({ length: 8 }, (_, index) => {
    const row = index + 2;

    return [
      `=IF('Monthly Ledger'!A${row}="","",'Monthly Ledger'!A${row})`,
      `=IF(G${index + 5}="","",'Monthly Ledger'!B${row})`,
      `=IF(G${index + 5}="","",'Monthly Ledger'!C${row})`,
      `=IF(G${index + 5}="","",'Monthly Ledger'!D${row})`,
    ];
  });

  sheet.getRange("A1:J2").format.fill.color = "#F3EBDD";
  sheet.getRange("A1").format.font = { bold: true, size: 20, color: "#17342F" };
  sheet.getRange("A2").format.font = { color: "#657068", size: 11 };
  sheet.getRange("A1:A2").format.rowHeightPx = 30;
  styleCard(sheet.getRange("A4:B7"));
  styleCard(sheet.getRange("D4:E7"));
  styleTable(sheet, `A10:E${10 + clientCount}`);
  styleTable(sheet, "G4:J12");
  sheet.getRange("B4:B7").setNumberFormat('"$"#,##0.00');
  sheet.getRange("E4:E4").setNumberFormat('"$"#,##0.00');
  sheet.getRange("E7:E7").setNumberFormat("yyyy-mm-dd hh:mm");
  sheet.getRange(`C11:D${10 + clientCount}`).setNumberFormat('"$"#,##0.00');
  sheet.getRange("H5:I12").setNumberFormat('"$"#,##0.00');
  sheet.getRange("A:A").format.columnWidthPx = 165;
  sheet.getRange("B:B").format.columnWidthPx = 165;
  sheet.getRange("C:C").format.columnWidthPx = 85;
  sheet.getRange("D:D").format.columnWidthPx = 140;
  sheet.getRange("E:E").format.columnWidthPx = 130;
  sheet.getRange("G:G").format.columnWidthPx = 86;
  sheet.getRange("H:H").format.columnWidthPx = 110;
  sheet.getRange("I:I").format.columnWidthPx = 110;
  sheet.getRange("J:J").format.columnWidthPx = 82;
}

function writeNotes(sheet) {
  const values = [
    ["Purpose", "Track 25% setup and SaaS commissions for RT Digital client payments."],
    ["Editable source of truth", "Clients tab: setup fee, monthly SaaS fee, commission %, status, notes."],
    ["Payment source", "Payments tab: pulled from GHL payment transaction/order/subscription/invoice endpoints."],
    ["Next app step", "Replace local config with this Google Sheet as the dashboard source of truth."],
    ["Caution", "This workbook tracks commission earned, not whether the commission has been paid out to you."],
  ];
  sheet.getRangeByIndexes(0, 0, values.length, 2).values = values;
  styleTable(sheet, `A1:B${values.length}`);
  sheet.getRange("B:B").format.columnWidthPx = 620;
}

function styleTable(sheet, address) {
  const range = sheet.getRange(address);
  range.format.borders = { preset: "inside", style: "thin", color: "#E2DED4" };
  const header = range.getRow(0);
  header.format.fill.color = "#EDE5D5";
  header.format.font = { bold: true, color: "#17342F" };
  header.format.wrapText = true;
  range.format.font.name = "Arial";
  range.format.font.size = 10;
  range.format.autofitColumns();
}

function styleCard(range) {
  range.format.fill.color = "#FBF8EF";
  range.format.borders = { preset: "outside", style: "thin", color: "#D7CAB2" };
  range.format.font.name = "Arial";
  range.format.font.size = 11;
  range.getColumn(0).format.font = { bold: true, color: "#657068" };
  range.getColumn(1).format.font = { bold: true, color: "#17342F" };
}
