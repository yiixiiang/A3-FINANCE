"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./financial-control.module.css";

type Tab = "readiness" | "periods" | "permissions" | "audit" | "backup";
type Company = { id: number; name: string; status: string; base_currency?: string | null };
type Module = { phase: number; name: string; href: string; status: string };
type Period = { id: number; company_id: number; period_no?: string | null; period_name: string; period_from: string; period_to: string; status: "open" | "closed"; close_notes?: string | null; closed_at?: string | null; reopened_reason?: string | null };
type Permission = { id: number; role_name: "administrator" | "finance" | "viewer" | "user"; module_name: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_approve: boolean };
type AuditEvent = { id: number; company_id?: number | null; event_type: string; module_name: string; target_table?: string | null; target_id?: string | null; description: string; details?: Record<string, unknown>; created_at: string };
type Check = { key: string; title: string; status: "pass" | "warning" | "error" | "info"; value: string | number; description: string; href?: string };
type Health = {
  checks: Check[];
  balance_sheet: { summary: { total_assets: number; total_liabilities: number; total_equity: number; variance: number }; warnings: string[] };
  cash_flow: { summary: { opening_cash: number; net_cash_change: number; closing_cash: number; reconciliation_difference: number }; warnings: string[] };
};
type Payload = { companies: Company[]; periods: Period[]; permissions: Permission[]; audit_events: AuditEvent[]; modules: Module[]; health: Health | null };

function monthRange(reference = new Date()) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}
const currentRange = monthRange();
const roleLabels: Record<string, string> = { administrator: "Administrator", finance: "Finance User", viewer: "Viewer", user: "General User" };
const moduleLabels: Record<string, string> = { dashboard: "Dashboard", invoices: "Invoices", receivables: "Receivables", payables: "Payables", bank_reconciliation: "Bank Reconciliation", gst_reports: "GST Reports", profit_loss: "Profit & Loss", balance_sheet: "Balance Sheet", cash_flow: "Cash Flow", financial_control: "Financial Control", driver_network: "Driver Network" };

function money(currency: string, amount: number) {
  const absolute = Math.abs(Number(amount || 0));
  const formatted = absolute.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Number(amount || 0) < 0 ? `(${currency} ${formatted})` : `${currency} ${formatted}`;
}

export default function FinancialControlPage() {
  const [data, setData] = useState<Payload>({ companies: [], periods: [], permissions: [], audit_events: [], modules: [], health: null });
  const [companyId, setCompanyId] = useState(0);
  const [from, setFrom] = useState(currentRange.from);
  const [to, setTo] = useState(currentRange.to);
  const [tab, setTab] = useState<Tab>("readiness");
  const [periodName, setPeriodName] = useState(new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date()));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedCompany = useMemo(() => data.companies.find((company) => company.id === companyId) ?? null, [companyId, data.companies]);
  const currency = selectedCompany?.base_currency || "SGD";
  const companyPeriods = useMemo(() => data.periods.filter((period) => period.company_id === companyId), [companyId, data.periods]);
  const readinessScore = useMemo(() => {
    const checks = data.health?.checks ?? [];
    if (checks.length === 0) return 0;
    const score = checks.reduce((total, check) => total + (check.status === "pass" ? 1 : check.status === "info" ? .75 : check.status === "warning" ? .5 : 0), 0);
    return Math.round((score / checks.length) * 100);
  }, [data.health]);
  const criticalCount = data.health?.checks.filter((check) => check.status === "error").length ?? 0;

  const load = useCallback(async (preferredCompanyId?: number) => {
    setLoading(true);
    setErrorMessage("");
    try {
      const targetCompanyId = preferredCompanyId || companyId;
      const params = new URLSearchParams();
      if (targetCompanyId) {
        params.set("company_id", String(targetCompanyId));
        params.set("from", from);
        params.set("to", to);
      }
      const response = await fetch(`/api/admin/financial-control?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load Financial Control.");
      setData(payload);
      const firstId = Number(payload.companies?.[0]?.id ?? 0);
      if (!companyId && firstId) setCompanyId(firstId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load Financial Control.");
    } finally {
      setLoading(false);
    }
  }, [companyId, from, to]);

  useEffect(() => { void load(); }, []);  
  useEffect(() => { if (companyId) void load(companyId); }, [companyId, from, to]);  

  async function post(payload: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/financial-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 && result.blockers) {
          const blockerText = (result.blockers as Check[]).map((check) => `• ${check.title}: ${check.description}`).join("\n");
          const force = window.confirm(`${result.error}\n\n${blockerText}\n\nClose with a controlled override?`);
          if (force) {
            const reason = window.prompt("Enter the controlled override reason:");
            if (reason) return await post({ ...payload, force: true, reason }, "Financial period closed with controlled override.");
          }
          throw new Error(result.error);
        }
        throw new Error(result.error || "Unable to update Financial Control.");
      }
      setMessage(successMessage);
      await load(companyId);
      return result;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update Financial Control.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createPeriod() {
    await post({ action: "create_period", company_id: companyId, period_name: periodName, period_from: from, period_to: to }, "Financial period created.");
  }

  async function closePeriod(period: Period) {
    const notes = window.prompt(`Close ${period.period_name}. Optional closing notes:`) ?? "";
    await post({ action: "close_period", id: period.id, notes }, "Financial period closed. Transactions inside the period are now locked.");
  }

  async function reopenPeriod(period: Period) {
    const reason = window.prompt(`Reopen ${period.period_name}. Enter the reason:`);
    if (!reason) return;
    await post({ action: "reopen_period", id: period.id, reason }, "Financial period reopened.");
  }

  async function updatePermission(permission: Permission, key: "can_view" | "can_create" | "can_edit" | "can_approve", value: boolean) {
    await post({ action: "save_permission", ...permission, [key]: value }, "Module permission updated.");
  }

  async function downloadBackup() {
    if (!companyId) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/admin/financial-control?mode=backup&company_id=${companyId}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Unable to prepare the backup.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] || `A3-Finance-Backup-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Company backup downloaded.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare the backup.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && data.companies.length === 0) return <main className={styles.message}>Loading Financial Control...</main>;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>PHASE 10 · FINAL CONSOLIDATION</p><h1>Financial Control Centre</h1><p>Close periods, validate all finance modules, manage permissions, review audit events and export company backups.</p></div>
        <div className={styles.heroScore}><span>Readiness Score</span><strong>{readinessScore}%</strong><small>{criticalCount === 0 ? "No critical blockers" : `${criticalCount} critical blocker${criticalCount === 1 ? "" : "s"}`}</small></div>
      </header>

      {message ? <div className={styles.success}>{message}</div> : null}
      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

      <section className={styles.controls}>
        <label><span>Company</span><select value={companyId} onChange={(event) => setCompanyId(Number(event.target.value))}>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label><span>Period from</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span>Period to</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <button type="button" className={styles.refreshButton} onClick={() => void load(companyId)} disabled={loading}>Run All Checks</button>
      </section>

      <section className={styles.moduleStrip}>{data.modules.map((module) => <Link key={module.phase} href={module.href}><span>{String(module.phase).padStart(2, "0")}</span><strong>{module.name}</strong><em>Complete</em></Link>)}</section>

      <nav className={styles.tabs}>{(["readiness", "periods", "permissions", "audit", "backup"] as Tab[]).map((item) => <button key={item} type="button" className={tab === item ? styles.activeTab : ""} onClick={() => setTab(item)}>{item === "readiness" ? "Readiness & Health" : item === "periods" ? "Period Close" : item === "permissions" ? "Permissions" : item === "audit" ? "Audit Trail" : "Backup & Deployment"}</button>)}</nav>

      {tab === "readiness" ? (
        <>
          {data.health ? <section className={styles.executiveGrid}><article><span>Total Assets</span><strong>{money(currency, data.health.balance_sheet.summary.total_assets)}</strong></article><article><span>Total Liabilities</span><strong>{money(currency, data.health.balance_sheet.summary.total_liabilities)}</strong></article><article><span>Total Equity</span><strong>{money(currency, data.health.balance_sheet.summary.total_equity)}</strong></article><article><span>Balance Variance</span><strong>{money(currency, data.health.balance_sheet.summary.variance)}</strong></article><article><span>Opening Cash</span><strong>{money(currency, data.health.cash_flow.summary.opening_cash)}</strong></article><article><span>Net Cash Change</span><strong>{money(currency, data.health.cash_flow.summary.net_cash_change)}</strong></article><article><span>Closing Cash</span><strong>{money(currency, data.health.cash_flow.summary.closing_cash)}</strong></article><article><span>Cash Flow Difference</span><strong>{money(currency, data.health.cash_flow.summary.reconciliation_difference)}</strong></article></section> : null}
          <section className={styles.checkGrid}>{(data.health?.checks ?? []).map((check) => <article key={check.key} className={styles[check.status]}><div><span className={styles.statusIcon}>{check.status === "pass" ? "✓" : check.status === "error" ? "!" : check.status === "warning" ? "△" : "i"}</span><div><h3>{check.title}</h3><p>{check.description}</p></div></div><strong>{typeof check.value === "number" ? Number(check.value).toLocaleString("en-SG", { maximumFractionDigits: 2 }) : check.value}</strong>{check.href ? <Link href={check.href}>Open Module →</Link> : null}</article>)}</section>
        </>
      ) : null}

      {tab === "periods" ? (
        <section className={styles.periodLayout}>
          <section className={styles.formPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>NEW FINANCIAL PERIOD</p><h2>Create Period</h2><span>Run readiness checks before closing.</span></div></div><div className={styles.formGrid}><label><span>Period name</span><input value={periodName} onChange={(event) => setPeriodName(event.target.value)} /></label><label><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button type="button" className={styles.primaryButton} onClick={() => void createPeriod()} disabled={saving}>Create Period</button></div></section>
          <section className={styles.listPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>PERIOD REGISTER</p><h2>{companyPeriods.length} Periods</h2></div></div><div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Period</th><th>Range</th><th>Status</th><th>Closed</th><th>Notes</th><th /></tr></thead><tbody>{companyPeriods.length === 0 ? <tr><td colSpan={6} className={styles.empty}>No financial periods created.</td></tr> : companyPeriods.map((period) => <tr key={period.id}><td><strong>{period.period_name}</strong><small>{period.period_no}</small></td><td>{formatDate(period.period_from)} – {formatDate(period.period_to)}</td><td><span className={period.status === "closed" ? styles.closed : styles.open}>{period.status}</span></td><td>{period.closed_at ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(period.closed_at)) : "—"}</td><td>{period.close_notes || period.reopened_reason || "—"}</td><td>{period.status === "open" ? <button type="button" className={styles.closeButton} onClick={() => void closePeriod(period)}>Close Period</button> : <button type="button" className={styles.reopenButton} onClick={() => void reopenPeriod(period)}>Reopen</button>}</td></tr>)}</tbody></table></div></section>
        </section>
      ) : null}

      {tab === "permissions" ? (
        <section className={styles.listPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>ROLE-BASED ACCESS</p><h2>Finance Module Permissions</h2><span>Administrator access is permanently unrestricted.</span></div></div><div className={styles.tableWrap}><table className={styles.permissionTable}><thead><tr><th>Role</th><th>Module</th><th>View</th><th>Create</th><th>Edit</th><th>Approve / Close</th></tr></thead><tbody>{data.permissions.map((permission) => <tr key={permission.id}><td><strong>{roleLabels[permission.role_name]}</strong></td><td>{moduleLabels[permission.module_name] ?? permission.module_name}</td>{(["can_view", "can_create", "can_edit", "can_approve"] as const).map((key) => <td key={key}><input type="checkbox" checked={permission[key]} disabled={permission.role_name === "administrator" || saving} onChange={(event) => void updatePermission(permission, key, event.target.checked)} /></td>)}</tr>)}</tbody></table></div></section>
      ) : null}

      {tab === "audit" ? (
        <section className={styles.listPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>SYSTEM AUDIT</p><h2>Recent Finance Events</h2><span>Period close, report finalisation, classifications and permission changes.</span></div></div><div className={styles.auditList}>{data.audit_events.filter((event) => !event.company_id || event.company_id === companyId).map((event) => <article key={event.id}><div className={styles.auditIcon}>{event.event_type.slice(0, 1).toUpperCase()}</div><div><strong>{event.description}</strong><span>{event.module_name.replaceAll("_", " ")} · {event.target_table || "system"}{event.target_id ? ` #${event.target_id}` : ""}</span><small>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</small></div></article>)}</div></section>
      ) : null}

      {tab === "backup" ? (
        <section className={styles.backupGrid}>
          <article className={styles.backupCard}><div className={styles.backupIcon}>⇩</div><h2>Company Data Backup</h2><p>Export the selected company’s finance records, accounts, reports, rates, customers, suppliers and audit data as one structured JSON file.</p><button type="button" className={styles.primaryButton} onClick={() => void downloadBackup()} disabled={saving || !companyId}>Download Backup</button></article>
          <article className={styles.backupCard}><div className={styles.backupIcon}>✓</div><h2>Deployment Verification</h2><p>Run the included final verifier before deployment. It checks migrations, routes, CSS Modules, Suspense boundaries, required environment variables and project structure.</p><pre>npm run verify</pre><Link className={styles.secondaryDarkButton} href="/dashboard">Open Final Dashboard</Link></article>
          <article className={styles.backupCard}><div className={styles.backupIcon}>↻</div><h2>Recovery Checklist</h2><p>Keep the source ZIP, migrations 000–019, environment variables and a recent company JSON backup. Re-run migrations in order on a clean Supabase project.</p><ul><li>Source and package lock</li><li>Supabase environment keys</li><li>Migration history</li><li>Company data backup</li></ul></article>
          <article className={styles.backupCard}><div className={styles.backupIcon}>▣</div><h2>Production Commands</h2><pre>npm ci{`\n`}npm run verify{`\n`}npm run build{`\n`}npm start</pre><p>Use Node.js 20 or later and configure all variables from <code>.env.example</code>.</p></article>
        </section>
      ) : null}
    </main>
  );
}
