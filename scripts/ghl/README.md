# GHL Python Toolkit

Small read-only Python tools for auditing HighLevel sub-accounts from the command line.

These scripts use only Python's standard library. They read `.env.local` by default
and never print token values.

## Accounts

The default account config is built from:

```bash
GHL_API_KEY
GHL_LOCATION_ID
GHL_DOCTOR_DAMP_API_KEY
GHL_DOCTOR_DAMP_LOCATION_ID
GHL_API_BASE_URL
GHL_API_VERSION
```

RT Digital uses `GHL_API_KEY` / `GHL_LOCATION_ID`.
Doctor Damp uses `GHL_DOCTOR_DAMP_API_KEY` / `GHL_DOCTOR_DAMP_LOCATION_ID`.

## Commands

List configured accounts:

```bash
python3 scripts/ghl/ghl_audit.py accounts
```

Run a safe read-only audit for one account:

```bash
python3 scripts/ghl/ghl_audit.py audit --account doctor-damp
```

Run all configured accounts:

```bash
python3 scripts/ghl/ghl_audit.py audit --all
```

Probe likely workflow endpoints for an account:

```bash
python3 scripts/ghl/ghl_audit.py workflows --account rt-digital
```

Reports are written to `reports/ghl/`.

## Safety

The current toolkit is read-only. It does not update contacts, workflows,
automations, AI agent settings, or messages.

Before adding write tools, use a dry-run plan and save a before/after backup.
