"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./cash-flow.module.css";

type Activity = "operating" | "investing" | "financing" | "excluded";
type Tab = "statement" | "transactions" | "mappings" | "snapshots";
type Company = { id: number; name: string; status: string; base_currency?: string | null };
type Mapping = { id: number; company_id: number; source_type: string; entry_type: string; activity: Activity; line_name: string; priority: number; is_active: boolean; notes?: string | null };
type Entry = { id: number; entry_no: string; entry_date: string; entry_type: string; source_type: string; reference: string; description: string; amount: number; bank_account_name: string; activity: Activity; line_name: string; explicit_classification: boolean };
type Snapshot = { id: number; company_id: number; snapshot_no?: string | null; period_from: string; period_to: string; status: "draft" | "final"; operating_cash: number; investing_cash: number; financing_cash: number; net_cash_change: number; opening_cash: number; closing_cash: number; reconciliation_difference: number };
type Summary = { opening_cash: number; operating_cash: number; investing_cash: number; financing_cash: number; net_cash_change: number; excluded_cash_movements: number; closing_cash: number; calculated_closing_cash: number; reconciliation_difference: number };
type Report = {
  company: Company & Record<string, unknown>;
  period: { from: string; to: string };
  comparison_period: { from: string; to: string };
  mappings: Mapping[];
  snapshots: Snapshot[];
  entries: Entry[];
  comparison_entries: Entry[];
  lines: Array<{ activity: Exclude<Activity, "excluded">; line_name: string; current: number; comparison: number }>;
  monthly: Array<{ month: string; operating: number; investing: number; financing: number; net_change: number }>;
  summary: Summary;
  comparison_summary: Summary;
  warnings: string[];
};

function monthRange(reference = new Date()) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  const previousFrom = new Date(year, month - 1, 1);
  const previousTo = new Date(year, month, 0);
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to), comparisonFrom: iso(previousFrom), comparisonTo: iso(previousTo) };
}
const initialRange = monthRange();

const activityLabels: Record<Activity, string> = { operating: "Operating Activities", investing: "Investing Activities", financing: "Financing Activities", excluded: "Excluded / Internal Transfers" };
const includedActivities: Array<Exclude<Activity, "excluded">> = ["operating", "investing", "financing"];

function money(currency: string, amount: number) {
  const absolute = Math.abs(Number(amount || 0));
  const formatted = absolute.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Number(amount || 0) < 0 ? `(${currency} ${formatted})` : `${currency} ${formatted}`;
}

function mappingEmpty(companyId = 0) {
  return { id: null as number | null, company_id: companyId, source_type: "*", entry_type: "*", activity: "operating" as Activity, line_name: "", priority: "100", is_active: true, notes: "" };
}

export default function CashFlowPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState(0);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [comparisonFrom, setComparisonFrom] = useState(initialRange.comparisonFrom);
  const [comparisonTo, setComparisonTo] = useState(initialRange.comparisonTo);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<Tab>("statement");
  const [mappingForm, setMappingForm] = useState(mappingEmpty());
  const [classificationEntry, setClassificationEntry] = useState<Entry | null>(null);
  const [classificationActivity, setClassificationActivity] = useState<Activity>("operating");
  const [classificationLine, setClassificationLine] = useState("");
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState<Activity | "all">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedCompany = useMemo(() => companies.find((company) => company.id === companyId) ?? null, [companies, companyId]);
  const currency = selectedCompany?.base_currency || "SGD";
  const companyMappings = useMemo(() => mappings.filter((mapping) => mapping.company_id === companyId), [mappings, companyId]);
  const companySnapshots = useMemo(() => snapshots.filter((snapshot) => snapshot.company_id === companyId), [snapshots, companyId]);
  const filteredEntries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (report?.entries ?? []).filter((entry) => {
      const activityMatch = activityFilter === "all" || entry.activity === activityFilter;
      const textMatch = !term || [entry.entry_no, entry.reference, entry.description, entry.bank_account_name, entry.line_name].join(" ").toLowerCase().includes(term);
      return activityMatch && textMatch;
    });
  }, [activityFilter, report, search]);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/cash-flow", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load Cash Flow settings.");
      setCompanies(payload.companies ?? []);
      setMappings(payload.mappings ?? []);
      setSnapshots(payload.snapshots ?? []);
      const firstId = Number(payload.companies?.[0]?.id ?? 0);
      setCompanyId((current) => current || firstId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load Cash Flow settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    if (!companyId || !from || !to || !comparisonFrom || !comparisonTo) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({ company_id: String(companyId), from, to, comparison_from: comparisonFrom, comparison_to: comparisonTo });
      const response = await fetch(`/api/admin/cash-flow?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to prepare the Cash Flow Statement.");
      setReport(payload.report);
      setMappings((current) => [...current.filter((row) => row.company_id !== companyId), ...(payload.report?.mappings ?? [])]);
      setSnapshots((current) => [...current.filter((row) => row.company_id !== companyId), ...(payload.report?.snapshots ?? [])]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare the Cash Flow Statement.");
    } finally {
      setLoading(false);
    }
  }, [companyId, comparisonFrom, comparisonTo, from, to]);

  useEffect(() => void loadSetup(), [loadSetup]);
  useEffect(() => {
    if (companyId) {
      setMappingForm(mappingEmpty(companyId));
      void loadReport();
    }
  }, [companyId, loadReport]);

  async function post(payload: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/cash-flow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update Cash Flow.");
      setMessage(successMessage);
      await loadSetup();
      await loadReport();
      return result;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update Cash Flow.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveMapping() {
    const result = await post({ action: "save_mapping", ...mappingForm, company_id: companyId, priority: Number(mappingForm.priority) }, mappingForm.id ? "Cash-flow mapping updated." : "Cash-flow mapping created.");
    if (result) setMappingForm(mappingEmpty(companyId));
  }

  async function deleteMapping(mapping: Mapping) {
    if (!window.confirm(`Delete mapping "${mapping.line_name}"?`)) return;
    await post({ action: "delete_mapping", id: mapping.id, company_id: companyId }, "Cash-flow mapping deleted.");
  }

  function editMapping(mapping: Mapping) {
    setMappingForm({ id: mapping.id, company_id: mapping.company_id, source_type: mapping.source_type, entry_type: mapping.entry_type, activity: mapping.activity, line_name: mapping.line_name, priority: String(mapping.priority), is_active: mapping.is_active, notes: mapping.notes ?? "" });
    setTab("mappings");
  }

  function startClassification(entry: Entry) {
    setClassificationEntry(entry);
    setClassificationActivity(entry.activity);
    setClassificationLine(entry.line_name);
    setTab("transactions");
  }

  async function saveClassification() {
    if (!classificationEntry) return;
    const result = await post({ action: "classify_entry", id: classificationEntry.id, company_id: companyId, activity: classificationActivity, line_name: classificationLine }, "Cash-book entry classified.");
    if (result) setClassificationEntry(null);
  }

  async function clearClassification(entry: Entry) {
    await post({ action: "clear_classification", id: entry.id, company_id: companyId }, "Explicit classification cleared; default mapping is now used.");
  }

  async function snapshot(final: boolean) {
    await post({ action: final ? "finalise_snapshot" : "save_snapshot", company_id: companyId, from, to, comparison_from: comparisonFrom, comparison_to: comparisonTo }, final ? "Cash Flow snapshot finalised." : "Cash Flow snapshot saved as draft.");
  }

  async function reopenSnapshot(snapshotRow: Snapshot) {
    const reason = window.prompt(`Reopen ${snapshotRow.snapshot_no ?? "this snapshot"}. Enter the reason:`);
    if (!reason) return;
    await post({ action: "reopen_snapshot", id: snapshotRow.id, reason }, "Cash Flow snapshot reopened.");
  }

  if (loading && companies.length === 0) return <main className={styles.message}>Loading Cash Flow...</main>;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>PHASE 9 · CASH MOVEMENT</p><h1>Cash Flow Statement</h1><p>Operating, investing and financing cash movements reconciled to the bank and cash-book closing balance.</p></div>
        <div className={styles.heroActions}>
          <Link className={styles.secondaryButton} href={`/cash-flow/print?company_id=${companyId}&from=${from}&to=${to}&comparison_from=${comparisonFrom}&comparison_to=${comparisonTo}`} target="_blank">Print / PDF</Link>
          <button type="button" className={styles.secondaryButton} onClick={() => void snapshot(false)} disabled={saving || !report}>Save Snapshot</button>
          <button type="button" className={styles.primaryButton} onClick={() => void snapshot(true)} disabled={saving || !report || Math.abs(report.summary.reconciliation_difference) > .01}>Finalise</button>
        </div>
      </header>

      {message ? <div className={styles.success}>{message}</div> : null}
      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

      <section className={styles.controls}>
        <label><span>Company</span><select value={companyId} onChange={(event) => setCompanyId(Number(event.target.value))}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label><span>From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span>To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label><span>Comparison from</span><input type="date" value={comparisonFrom} onChange={(event) => setComparisonFrom(event.target.value)} /></label>
        <label><span>Comparison to</span><input type="date" value={comparisonTo} onChange={(event) => setComparisonTo(event.target.value)} /></label>
        <button type="button" className={styles.refreshButton} onClick={() => void loadReport()} disabled={loading}>Refresh</button>
      </section>

      {report ? (
        <>
          <section className={styles.metrics}>
            <article><span>Opening Cash</span><strong>{money(currency, report.summary.opening_cash)}</strong><small>{formatDate(from)}</small></article>
            <article className={report.summary.operating_cash >= 0 ? styles.goodMetric : styles.badMetric}><span>Operating Cash</span><strong>{money(currency, report.summary.operating_cash)}</strong><small>Core business activities</small></article>
            <article><span>Investing Cash</span><strong>{money(currency, report.summary.investing_cash)}</strong><small>Assets and investments</small></article>
            <article><span>Financing Cash</span><strong>{money(currency, report.summary.financing_cash)}</strong><small>Capital, loans and distributions</small></article>
            <article><span>Net Cash Change</span><strong>{money(currency, report.summary.net_cash_change)}</strong><small>Included activities</small></article>
            <article className={Math.abs(report.summary.reconciliation_difference) <= .01 ? styles.goodMetric : styles.badMetric}><span>Closing Cash</span><strong>{money(currency, report.summary.closing_cash)}</strong><small>Difference {money(currency, report.summary.reconciliation_difference)}</small></article>
          </section>

          {report.warnings.length > 0 ? <section className={styles.warningBox}>{report.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section> : null}

          <nav className={styles.tabs}>{(["statement", "transactions", "mappings", "snapshots"] as Tab[]).map((item) => <button key={item} type="button" className={tab === item ? styles.activeTab : ""} onClick={() => setTab(item)}>{item === "statement" ? "Statement" : item === "transactions" ? "Transactions" : item === "mappings" ? "Mappings" : "Snapshots"}</button>)}</nav>

          {tab === "statement" ? (
            <>
              <section className={styles.statementPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>STATEMENT OF CASH FLOWS</p><h2>{selectedCompany?.name}</h2><span>{formatDate(from)} – {formatDate(to)} · Comparison {formatDate(comparisonFrom)} – {formatDate(comparisonTo)}</span></div><span className={Math.abs(report.summary.reconciliation_difference) <= .01 ? styles.reconciledBadge : styles.reviewBadge}>{Math.abs(report.summary.reconciliation_difference) <= .01 ? "RECONCILED" : "REVIEW REQUIRED"}</span></div><div className={styles.tableWrap}><table className={styles.statementTable}><thead><tr><th>Cash Flow Line</th><th>Current Period</th><th>Comparison</th><th>Variance</th></tr></thead><tbody>{includedActivities.map((activity) => { const lines = report.lines.filter((line) => line.activity === activity); const current = lines.reduce((sum, line) => sum + line.current, 0); const comparison = lines.reduce((sum, line) => sum + line.comparison, 0); return [<tr className={styles.groupRow} key={`${activity}-heading`}><td colSpan={4}>{activityLabels[activity]}</td></tr>, ...lines.map((line) => <tr key={`${activity}-${line.line_name}`}><td>{line.line_name}</td><td>{money(currency, line.current)}</td><td>{money(currency, line.comparison)}</td><td className={line.current - line.comparison >= 0 ? styles.positive : styles.negative}>{money(currency, line.current - line.comparison)}</td></tr>), <tr className={styles.subtotalRow} key={`${activity}-total`}><td>Net Cash from {activityLabels[activity]}</td><td>{money(currency, current)}</td><td>{money(currency, comparison)}</td><td>{money(currency, current - comparison)}</td></tr>]; })}<tr className={styles.totalRow}><td>Net Increase / (Decrease) in Cash</td><td>{money(currency, report.summary.net_cash_change)}</td><td>{money(currency, report.comparison_summary.net_cash_change)}</td><td>{money(currency, report.summary.net_cash_change - report.comparison_summary.net_cash_change)}</td></tr><tr className={styles.totalRow}><td>Cash and Cash Equivalents at End of Period</td><td>{money(currency, report.summary.closing_cash)}</td><td>{money(currency, report.comparison_summary.closing_cash)}</td><td>{money(currency, report.summary.closing_cash - report.comparison_summary.closing_cash)}</td></tr></tbody></table></div></section>
              <section className={styles.trendPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>MONTHLY MOVEMENT</p><h2>Cash Flow Trend</h2></div></div><div className={styles.trendGrid}>{report.monthly.map((month) => { const scale = Math.max(...report.monthly.map((item) => Math.abs(item.net_change)), 1); const height = Math.max(Math.round((Math.abs(month.net_change) / scale) * 100), 5); return <article key={month.month}><span>{new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(`${month.month}-01T00:00:00`))}</span><div className={styles.barTrack}><div className={month.net_change >= 0 ? styles.positiveBar : styles.negativeBar} style={{ height: `${height}%` }} /></div><strong className={month.net_change >= 0 ? styles.positive : styles.negative}>{money(currency, month.net_change)}</strong></article>; })}</div></section>
            </>
          ) : null}

          {tab === "transactions" ? (
            <section className={styles.transactionLayout}>
              <section className={styles.statementPanel}><div className={styles.toolbar}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reference, description or account" /><select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as Activity | "all")}><option value="all">All activities</option>{Object.entries(activityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Date</th><th>Entry</th><th>Account</th><th>Classification</th><th>Amount</th><th /></tr></thead><tbody>{filteredEntries.length === 0 ? <tr><td colSpan={6} className={styles.empty}>No transactions for the selected filters.</td></tr> : filteredEntries.map((entry) => <tr key={entry.id}><td>{formatDate(entry.entry_date)}</td><td><strong>{entry.entry_no}</strong><small>{entry.description}</small><small>{entry.reference || ""}</small></td><td>{entry.bank_account_name}</td><td><span className={`${styles.activityBadge} ${styles[entry.activity]}`}>{activityLabels[entry.activity]}</span><small>{entry.line_name}</small><small>{entry.explicit_classification ? "Explicit" : "Default mapping"}</small></td><td className={entry.amount >= 0 ? styles.positive : styles.negative}>{money(currency, entry.amount)}</td><td><button type="button" className={styles.textButton} onClick={() => startClassification(entry)}>Classify</button>{entry.explicit_classification ? <button type="button" className={styles.dangerButton} onClick={() => void clearClassification(entry)}>Clear</button> : null}</td></tr>)}</tbody></table></div></section>
              <aside className={styles.classificationPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>EXPLICIT CLASSIFICATION</p><h2>{classificationEntry ? classificationEntry.entry_no : "Select a Transaction"}</h2></div></div>{classificationEntry ? <div className={styles.formGrid}><div className={styles.classificationSummary}><strong>{classificationEntry.description}</strong><span>{formatDate(classificationEntry.entry_date)} · {money(currency, classificationEntry.amount)}</span></div><label><span>Activity</span><select value={classificationActivity} onChange={(event) => setClassificationActivity(event.target.value as Activity)}>{Object.entries(activityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Cash-flow line</span><input value={classificationLine} onChange={(event) => setClassificationLine(event.target.value)} /></label><button type="button" className={styles.primaryButton} onClick={() => void saveClassification()} disabled={saving}>Save Classification</button></div> : <div className={styles.empty}>Choose a cash-book transaction to override the default mapping.</div>}</aside>
            </section>
          ) : null}

          {tab === "mappings" ? (
            <section className={styles.twoColumn}><section className={styles.formPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>CLASSIFICATION RULES</p><h2>{mappingForm.id ? "Edit Mapping" : "New Mapping"}</h2></div>{mappingForm.id ? <button type="button" className={styles.textButton} onClick={() => setMappingForm(mappingEmpty(companyId))}>New</button> : null}</div><div className={styles.formGrid}><label><span>Source type</span><input value={mappingForm.source_type} onChange={(event) => setMappingForm((current) => ({ ...current, source_type: event.target.value }))} placeholder="customer_payment or *" /></label><label><span>Entry type</span><input value={mappingForm.entry_type} onChange={(event) => setMappingForm((current) => ({ ...current, entry_type: event.target.value }))} placeholder="receipt, payment or *" /></label><label><span>Activity</span><select value={mappingForm.activity} onChange={(event) => setMappingForm((current) => ({ ...current, activity: event.target.value as Activity }))}>{Object.entries(activityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Priority</span><input type="number" value={mappingForm.priority} onChange={(event) => setMappingForm((current) => ({ ...current, priority: event.target.value }))} /></label><label className={styles.full}><span>Cash-flow line</span><input value={mappingForm.line_name} onChange={(event) => setMappingForm((current) => ({ ...current, line_name: event.target.value }))} /></label><label className={styles.checkbox}><input type="checkbox" checked={mappingForm.is_active} onChange={(event) => setMappingForm((current) => ({ ...current, is_active: event.target.checked }))} /><span>Active</span></label><label className={styles.full}><span>Notes</span><textarea value={mappingForm.notes} onChange={(event) => setMappingForm((current) => ({ ...current, notes: event.target.value }))} /></label></div><div className={styles.formActions}><button type="button" className={styles.primaryButton} onClick={() => void saveMapping()} disabled={saving}>Save Mapping</button></div></section><section className={styles.listPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>MAPPING DIRECTORY</p><h2>{companyMappings.length} Rules</h2></div></div><div className={styles.mappingList}>{companyMappings.map((mapping) => <article key={mapping.id}><button type="button" onClick={() => editMapping(mapping)}><strong>{mapping.line_name}</strong><span>{mapping.source_type} · {mapping.entry_type}</span><span>{activityLabels[mapping.activity]} · Priority {mapping.priority}</span></button><button type="button" className={styles.dangerButton} onClick={() => void deleteMapping(mapping)}>Delete</button></article>)}</div></section></section>
          ) : null}

          {tab === "snapshots" ? <section className={styles.statementPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>PERIOD RECORDS</p><h2>Cash Flow Snapshots</h2><span>Final snapshots are used by Financial Control during period close.</span></div></div><div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Snapshot</th><th>Period</th><th>Operating</th><th>Investing</th><th>Financing</th><th>Net Change</th><th>Closing Cash</th><th>Difference</th><th>Status</th><th /></tr></thead><tbody>{companySnapshots.length === 0 ? <tr><td colSpan={10} className={styles.empty}>No snapshots yet.</td></tr> : companySnapshots.map((snapshotRow) => <tr key={snapshotRow.id}><td>{snapshotRow.snapshot_no}</td><td>{formatDate(snapshotRow.period_from)} – {formatDate(snapshotRow.period_to)}</td><td>{money(currency, snapshotRow.operating_cash)}</td><td>{money(currency, snapshotRow.investing_cash)}</td><td>{money(currency, snapshotRow.financing_cash)}</td><td>{money(currency, snapshotRow.net_cash_change)}</td><td>{money(currency, snapshotRow.closing_cash)}</td><td>{money(currency, snapshotRow.reconciliation_difference)}</td><td><span className={snapshotRow.status === "final" ? styles.final : styles.draft}>{snapshotRow.status}</span></td><td>{snapshotRow.status === "final" ? <button type="button" className={styles.textButton} onClick={() => void reopenSnapshot(snapshotRow)}>Reopen</button> : null}</td></tr>)}</tbody></table></div></section> : null}
        </>
      ) : <section className={styles.message}>Select a company and refresh the report.</section>}
    </main>
  );
}
