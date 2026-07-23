"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./balance-sheet.module.css";

type Group = "current_asset" | "non_current_asset" | "current_liability" | "non_current_liability" | "equity";
type Tab = "statement" | "details" | "accounts" | "entries" | "snapshots";
type Company = { id: number; name: string; status: string; base_currency?: string | null };
type Account = {
  id: number;
  company_id: number;
  account_code: string;
  account_name: string;
  account_group: Group;
  normal_side: "debit" | "credit";
  is_contra: boolean;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  description?: string | null;
};
type Entry = {
  id: number;
  company_id: number;
  account_id: number;
  entry_no?: string | null;
  entry_date: string;
  description: string;
  reference?: string | null;
  entry_side: "debit" | "credit";
  amount: number;
  status: "posted" | "void";
  notes?: string | null;
  void_reason?: string | null;
};
type Detail = { key: string; label: string; reference?: string | null; date?: string | null; amount: number; source_type: string };
type Row = Account & { balance: number; comparison_balance?: number; movement?: number; details: Detail[] };
type Snapshot = {
  id: number;
  company_id: number;
  snapshot_no?: string | null;
  as_of_date: string;
  status: "draft" | "final";
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  variance: number;
  finalised_at?: string | null;
};
type Summary = {
  current_assets: number;
  non_current_assets: number;
  total_assets: number;
  current_liabilities: number;
  non_current_liabilities: number;
  total_liabilities: number;
  total_equity: number;
  liabilities_and_equity: number;
  variance: number;
  working_capital: number;
  current_ratio: number | null;
};
type Report = {
  company: Company & Record<string, unknown>;
  as_of_date: string;
  comparison_as_of_date?: string;
  accounts: Account[];
  manual_entries: Entry[];
  snapshots: Snapshot[];
  rows: Row[];
  summary: Summary;
  comparison_summary?: Summary;
  warnings: string[];
};

const today = new Date().toISOString().slice(0, 10);
const yearAgo = (() => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString().slice(0, 10);
})();

const groupLabels: Record<Group, string> = {
  current_asset: "Current Assets",
  non_current_asset: "Non-Current Assets",
  current_liability: "Current Liabilities",
  non_current_liability: "Non-Current Liabilities",
  equity: "Equity",
};

const groupOrder: Group[] = ["current_asset", "non_current_asset", "current_liability", "non_current_liability", "equity"];

function money(currency: string, amount: number) {
  const absolute = Math.abs(Number(amount || 0));
  const text = absolute.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Number(amount || 0) < 0 ? `(${currency} ${text})` : `${currency} ${text}`;
}

function accountEmpty(companyId = 0) {
  return {
    id: null as number | null,
    company_id: companyId,
    account_code: "",
    account_name: "",
    account_group: "current_asset" as Group,
    is_contra: false,
    is_active: true,
    sort_order: "100",
    description: "",
  };
}

function entryEmpty(companyId = 0) {
  return {
    company_id: companyId,
    account_id: "",
    entry_date: today,
    description: "",
    reference: "",
    entry_side: "debit" as "debit" | "credit",
    amount: "0.00",
    notes: "",
  };
}

export default function BalanceSheetPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState(0);
  const [asOfDate, setAsOfDate] = useState(today);
  const [comparisonDate, setComparisonDate] = useState(yearAgo);
  const [report, setReport] = useState<Report | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [tab, setTab] = useState<Tab>("statement");
  const [selectedRowCode, setSelectedRowCode] = useState<string>("1000");
  const [accountForm, setAccountForm] = useState(accountEmpty());
  const [entryForm, setEntryForm] = useState(entryEmpty());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedCompany = useMemo(() => companies.find((company) => company.id === companyId) ?? null, [companies, companyId]);
  const currency = selectedCompany?.base_currency || "SGD";
  const companyAccounts = useMemo(() => accounts.filter((account) => account.company_id === companyId), [accounts, companyId]);
  const companyEntries = useMemo(() => entries.filter((entry) => entry.company_id === companyId), [entries, companyId]);
  const companySnapshots = useMemo(() => snapshots.filter((snapshot) => snapshot.company_id === companyId), [snapshots, companyId]);
  const selectedRow = useMemo(() => report?.rows.find((row) => row.account_code === selectedRowCode) ?? report?.rows[0] ?? null, [report, selectedRowCode]);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/balance-sheet", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load Balance Sheet settings.");
      setCompanies(payload.companies ?? []);
      setAccounts(payload.accounts ?? []);
      setEntries(payload.manual_entries ?? []);
      setSnapshots(payload.snapshots ?? []);
      const firstId = Number(payload.companies?.[0]?.id ?? 0);
      setCompanyId((current) => current || firstId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load Balance Sheet settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    if (!companyId || !asOfDate) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({ company_id: String(companyId), as_of: asOfDate });
      if (comparisonDate) params.set("comparison_as_of", comparisonDate);
      const response = await fetch(`/api/admin/balance-sheet?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to prepare the Balance Sheet.");
      setReport(payload.report);
      setAccounts((current) => [...current.filter((row) => row.company_id !== companyId), ...(payload.report?.accounts ?? [])]);
      setEntries((current) => [...current.filter((row) => row.company_id !== companyId), ...(payload.report?.manual_entries ?? [])]);
      setSnapshots((current) => [...current.filter((row) => row.company_id !== companyId), ...(payload.report?.snapshots ?? [])]);
      if (!payload.report?.rows?.some((row: Row) => row.account_code === selectedRowCode)) {
        setSelectedRowCode(payload.report?.rows?.[0]?.account_code ?? "1000");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare the Balance Sheet.");
    } finally {
      setLoading(false);
    }
  }, [asOfDate, companyId, comparisonDate, selectedRowCode]);

  useEffect(() => void loadSetup(), [loadSetup]);
  useEffect(() => {
    if (companyId) {
      setAccountForm(accountEmpty(companyId));
      setEntryForm(entryEmpty(companyId));
      void loadReport();
    }
  }, [companyId, loadReport]);

  async function post(payload: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setErrorMessage("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/balance-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update the Balance Sheet.");
      setMessage(successMessage);
      await loadSetup();
      await loadReport();
      return result;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update the Balance Sheet.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount() {
    const result = await post({ action: "save_account", ...accountForm, company_id: companyId }, accountForm.id ? "Balance Sheet account updated." : "Balance Sheet account created.");
    if (result) setAccountForm(accountEmpty(companyId));
  }

  async function saveEntry() {
    const result = await post({ action: "save_entry", ...entryForm, company_id: companyId, account_id: Number(entryForm.account_id), amount: Number(entryForm.amount) }, "Balance Sheet entry posted.");
    if (result) setEntryForm(entryEmpty(companyId));
  }

  async function voidEntry(entry: Entry) {
    const reason = window.prompt(`Void ${entry.entry_no ?? "this entry"}. Enter the reason:`);
    if (!reason) return;
    await post({ action: "void_entry", id: entry.id, reason }, "Balance Sheet entry voided.");
  }

  async function snapshot(final: boolean) {
    await post({ action: final ? "finalise_snapshot" : "save_snapshot", company_id: companyId, as_of_date: asOfDate }, final ? "Balance Sheet snapshot finalised." : "Balance Sheet snapshot saved as draft.");
  }

  async function reopenSnapshot(snapshotRow: Snapshot) {
    const reason = window.prompt(`Reopen ${snapshotRow.snapshot_no ?? "this snapshot"}. Enter the reason:`);
    if (!reason) return;
    await post({ action: "reopen_snapshot", id: snapshotRow.id, reason }, "Balance Sheet snapshot reopened.");
  }

  function editAccount(account: Account) {
    setAccountForm({
      id: account.id,
      company_id: account.company_id,
      account_code: account.account_code,
      account_name: account.account_name,
      account_group: account.account_group,
      is_contra: account.is_contra,
      is_active: account.is_active,
      sort_order: String(account.sort_order),
      description: account.description ?? "",
    });
    setTab("accounts");
  }

  if (loading && companies.length === 0) return <main className={styles.message}>Loading Balance Sheet...</main>;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>PHASE 8 · FINANCIAL POSITION</p>
          <h1>Balance Sheet</h1>
          <p>Assets, liabilities and equity with live receivables, payables, bank balances, GST and retained earnings.</p>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.secondaryButton} href={`/balance-sheet/print?company_id=${companyId}&as_of=${asOfDate}&comparison_as_of=${comparisonDate}`} target="_blank">Print / PDF</Link>
          <button type="button" className={styles.secondaryButton} onClick={() => void snapshot(false)} disabled={saving || !report}>Save Snapshot</button>
          <button type="button" className={styles.primaryButton} onClick={() => void snapshot(true)} disabled={saving || !report || Math.abs(report.summary.variance) > 0.01}>Finalise</button>
        </div>
      </header>

      {message ? <div className={styles.success}>{message}</div> : null}
      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

      <section className={styles.controls}>
        <label><span>Company</span><select value={companyId} onChange={(event) => setCompanyId(Number(event.target.value))}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <label><span>As at</span><input type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} /></label>
        <label><span>Compare with</span><input type="date" value={comparisonDate} onChange={(event) => setComparisonDate(event.target.value)} /></label>
        <button type="button" className={styles.refreshButton} onClick={() => void loadReport()} disabled={loading}>Refresh Report</button>
      </section>

      {report ? (
        <>
          <section className={styles.metrics}>
            <article><span>Total Assets</span><strong>{money(currency, report.summary.total_assets)}</strong><small>Current + non-current assets</small></article>
            <article><span>Total Liabilities</span><strong>{money(currency, report.summary.total_liabilities)}</strong><small>Current + non-current liabilities</small></article>
            <article><span>Total Equity</span><strong>{money(currency, report.summary.total_equity)}</strong><small>Capital and retained earnings</small></article>
            <article className={Math.abs(report.summary.variance) <= 0.01 ? styles.metricGood : styles.metricBad}><span>Balance Check</span><strong>{money(currency, report.summary.variance)}</strong><small>{Math.abs(report.summary.variance) <= 0.01 ? "Balanced" : "Review required"}</small></article>
            <article><span>Working Capital</span><strong>{money(currency, report.summary.working_capital)}</strong><small>Current assets less current liabilities</small></article>
            <article><span>Current Ratio</span><strong>{report.summary.current_ratio === null ? "N/A" : `${report.summary.current_ratio.toFixed(2)}×`}</strong><small>Short-term liquidity</small></article>
          </section>

          {report.warnings.length > 0 ? <section className={styles.warningBox}>{report.warnings.map((warning) => <p key={warning}>{warning}</p>)}</section> : null}

          <nav className={styles.tabs}>
            {(["statement", "details", "accounts", "entries", "snapshots"] as Tab[]).map((item) => <button key={item} type="button" className={tab === item ? styles.activeTab : ""} onClick={() => setTab(item)}>{item === "statement" ? "Statement" : item === "details" ? "Drill-Down" : item === "accounts" ? "Accounts" : item === "entries" ? "Manual Entries" : "Snapshots"}</button>)}
          </nav>

          {tab === "statement" ? (
            <section className={styles.statementPanel}>
              <div className={styles.panelHeading}><div><p className={styles.eyebrow}>STATEMENT OF FINANCIAL POSITION</p><h2>{selectedCompany?.name}</h2><span>As at {formatDate(asOfDate)} · Comparison {formatDate(comparisonDate)}</span></div><span className={Math.abs(report.summary.variance) <= 0.01 ? styles.balancedBadge : styles.reviewBadge}>{Math.abs(report.summary.variance) <= 0.01 ? "BALANCED" : "OUT OF BALANCE"}</span></div>
              <div className={styles.tableWrap}>
                <table className={styles.statementTable}>
                  <thead><tr><th>Account</th><th>As at {formatDate(asOfDate)}</th><th>As at {formatDate(comparisonDate)}</th><th>Movement</th></tr></thead>
                  <tbody>
                    {groupOrder.map((group) => {
                      const rows = report.rows.filter((row) => row.account_group === group && (row.balance !== 0 || Number(row.comparison_balance || 0) !== 0 || !row.is_system));
                      const currentTotal = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
                      const comparisonTotal = rows.reduce((sum, row) => sum + Number(row.comparison_balance || 0), 0);
                      return [
                        <tr className={styles.groupRow} key={`${group}-heading`}><td colSpan={4}>{groupLabels[group]}</td></tr>,
                        ...rows.map((row) => <tr key={row.id} className={selectedRowCode === row.account_code ? styles.selectedRow : ""} onClick={() => { setSelectedRowCode(row.account_code); setTab("details"); }}><td><strong>{row.account_code}</strong><span>{row.account_name}</span>{row.is_contra ? <em>Contra</em> : null}</td><td>{money(currency, row.balance)}</td><td>{money(currency, Number(row.comparison_balance || 0))}</td><td className={Number(row.movement || 0) >= 0 ? styles.positive : styles.negative}>{money(currency, Number(row.movement || 0))}</td></tr>),
                        <tr className={styles.subtotalRow} key={`${group}-total`}><td>Total {groupLabels[group]}</td><td>{money(currency, currentTotal)}</td><td>{money(currency, comparisonTotal)}</td><td>{money(currency, currentTotal - comparisonTotal)}</td></tr>,
                      ];
                    })}
                    <tr className={styles.totalRow}><td>Total Assets</td><td>{money(currency, report.summary.total_assets)}</td><td>{money(currency, report.comparison_summary?.total_assets ?? 0)}</td><td>{money(currency, report.summary.total_assets - (report.comparison_summary?.total_assets ?? 0))}</td></tr>
                    <tr className={styles.totalRow}><td>Total Liabilities and Equity</td><td>{money(currency, report.summary.liabilities_and_equity)}</td><td>{money(currency, report.comparison_summary?.liabilities_and_equity ?? 0)}</td><td>{money(currency, report.summary.liabilities_and_equity - (report.comparison_summary?.liabilities_and_equity ?? 0))}</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {tab === "details" ? (
            <section className={styles.detailLayout}>
              <aside className={styles.accountRail}>{report.rows.map((row) => <button key={row.id} type="button" className={selectedRow?.id === row.id ? styles.activeAccount : ""} onClick={() => setSelectedRowCode(row.account_code)}><span><strong>{row.account_code}</strong>{row.account_name}</span><em>{money(currency, row.balance)}</em></button>)}</aside>
              <section className={styles.detailPanel}>
                {selectedRow ? <><div className={styles.panelHeading}><div><p className={styles.eyebrow}>{groupLabels[selectedRow.account_group]}</p><h2>{selectedRow.account_code} · {selectedRow.account_name}</h2><span>{selectedRow.details.length} source item(s)</span></div><strong className={styles.detailTotal}>{money(currency, selectedRow.balance)}</strong></div><div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Date</th><th>Source</th><th>Reference</th><th>Description</th><th>Amount</th></tr></thead><tbody>{selectedRow.details.length === 0 ? <tr><td colSpan={5} className={styles.empty}>No source transactions for this account.</td></tr> : selectedRow.details.map((detail) => <tr key={detail.key}><td>{formatDate(detail.date)}</td><td>{detail.source_type.replaceAll("_", " ")}</td><td>{detail.reference || "—"}</td><td>{detail.label}</td><td>{money(currency, detail.amount)}</td></tr>)}</tbody></table></div></> : null}
              </section>
            </section>
          ) : null}

          {tab === "accounts" ? (
            <section className={styles.twoColumn}>
              <section className={styles.formPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>CHART OF ACCOUNTS</p><h2>{accountForm.id ? "Edit Account" : "New Balance Sheet Account"}</h2></div>{accountForm.id ? <button type="button" className={styles.textButton} onClick={() => setAccountForm(accountEmpty(companyId))}>New</button> : null}</div><div className={styles.formGrid}><label><span>Account code</span><input value={accountForm.account_code} disabled={Boolean(accountForm.id && companyAccounts.find((row) => row.id === accountForm.id)?.is_system)} onChange={(event) => setAccountForm((current) => ({ ...current, account_code: event.target.value }))} /></label><label><span>Account name</span><input value={accountForm.account_name} onChange={(event) => setAccountForm((current) => ({ ...current, account_name: event.target.value }))} /></label><label><span>Group</span><select value={accountForm.account_group} onChange={(event) => setAccountForm((current) => ({ ...current, account_group: event.target.value as Group }))}>{groupOrder.map((group) => <option key={group} value={group}>{groupLabels[group]}</option>)}</select></label><label><span>Sort order</span><input type="number" value={accountForm.sort_order} onChange={(event) => setAccountForm((current) => ({ ...current, sort_order: event.target.value }))} /></label><label className={styles.checkbox}><input type="checkbox" checked={accountForm.is_contra} onChange={(event) => setAccountForm((current) => ({ ...current, is_contra: event.target.checked }))} /><span>Contra account</span></label><label className={styles.checkbox}><input type="checkbox" checked={accountForm.is_active} onChange={(event) => setAccountForm((current) => ({ ...current, is_active: event.target.checked }))} /><span>Active</span></label><label className={styles.full}><span>Description</span><textarea value={accountForm.description} onChange={(event) => setAccountForm((current) => ({ ...current, description: event.target.value }))} /></label></div><div className={styles.formActions}><button type="button" className={styles.primaryButton} onClick={() => void saveAccount()} disabled={saving}>Save Account</button></div></section>
              <section className={styles.listPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>ACCOUNT DIRECTORY</p><h2>{companyAccounts.length} Accounts</h2></div></div><div className={styles.accountList}>{companyAccounts.map((account) => <button key={account.id} type="button" onClick={() => editAccount(account)}><span><strong>{account.account_code} · {account.account_name}</strong><small>{groupLabels[account.account_group]}{account.is_system ? " · System" : ""}{account.is_contra ? " · Contra" : ""}</small></span><em>{account.is_active ? "Active" : "Inactive"}</em></button>)}</div></section>
            </section>
          ) : null}

          {tab === "entries" ? (
            <section className={styles.twoColumn}>
              <section className={styles.formPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>OPENING AND ADJUSTMENT BALANCES</p><h2>Post Manual Entry</h2></div></div><div className={styles.formGrid}><label className={styles.full}><span>Account</span><select value={entryForm.account_id} onChange={(event) => setEntryForm((current) => ({ ...current, account_id: event.target.value }))}><option value="">Select account</option>{companyAccounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.account_code} · {account.account_name}</option>)}</select></label><label><span>Entry date</span><input type="date" value={entryForm.entry_date} onChange={(event) => setEntryForm((current) => ({ ...current, entry_date: event.target.value }))} /></label><label><span>Debit / Credit</span><select value={entryForm.entry_side} onChange={(event) => setEntryForm((current) => ({ ...current, entry_side: event.target.value as "debit" | "credit" }))}><option value="debit">Debit</option><option value="credit">Credit</option></select></label><label><span>Amount</span><input type="number" min="0.01" step="0.01" value={entryForm.amount} onChange={(event) => setEntryForm((current) => ({ ...current, amount: event.target.value }))} /></label><label><span>Reference</span><input value={entryForm.reference} onChange={(event) => setEntryForm((current) => ({ ...current, reference: event.target.value }))} /></label><label className={styles.full}><span>Description</span><input value={entryForm.description} onChange={(event) => setEntryForm((current) => ({ ...current, description: event.target.value }))} /></label><label className={styles.full}><span>Notes</span><textarea value={entryForm.notes} onChange={(event) => setEntryForm((current) => ({ ...current, notes: event.target.value }))} /></label></div><div className={styles.formActions}><button type="button" className={styles.primaryButton} onClick={() => void saveEntry()} disabled={saving}>Post Entry</button></div></section>
              <section className={styles.listPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>MANUAL LEDGER</p><h2>{companyEntries.length} Entries</h2></div></div><div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Date</th><th>Entry</th><th>Account</th><th>Side</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{companyEntries.map((entry) => { const account = companyAccounts.find((row) => row.id === entry.account_id); return <tr key={entry.id}><td>{formatDate(entry.entry_date)}</td><td><strong>{entry.entry_no}</strong><small>{entry.description}</small></td><td>{account ? `${account.account_code} · ${account.account_name}` : entry.account_id}</td><td>{entry.entry_side}</td><td>{money(currency, entry.amount)}</td><td><span className={entry.status === "posted" ? styles.posted : styles.void}>{entry.status}</span></td><td>{entry.status === "posted" ? <button type="button" className={styles.dangerButton} onClick={() => void voidEntry(entry)}>Void</button> : null}</td></tr>; })}</tbody></table></div></section>
            </section>
          ) : null}

          {tab === "snapshots" ? (
            <section className={styles.statementPanel}><div className={styles.panelHeading}><div><p className={styles.eyebrow}>PERIOD-END RECORDS</p><h2>Balance Sheet Snapshots</h2><span>Final snapshots preserve the exact report used at period close.</span></div></div><div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Snapshot</th><th>As at</th><th>Assets</th><th>Liabilities</th><th>Equity</th><th>Variance</th><th>Status</th><th /></tr></thead><tbody>{companySnapshots.length === 0 ? <tr><td colSpan={8} className={styles.empty}>No snapshots yet.</td></tr> : companySnapshots.map((snapshotRow) => <tr key={snapshotRow.id}><td>{snapshotRow.snapshot_no}</td><td>{formatDate(snapshotRow.as_of_date)}</td><td>{money(currency, snapshotRow.total_assets)}</td><td>{money(currency, snapshotRow.total_liabilities)}</td><td>{money(currency, snapshotRow.total_equity)}</td><td>{money(currency, snapshotRow.variance)}</td><td><span className={snapshotRow.status === "final" ? styles.final : styles.draft}>{snapshotRow.status}</span></td><td>{snapshotRow.status === "final" ? <button type="button" className={styles.textButton} onClick={() => void reopenSnapshot(snapshotRow)}>Reopen</button> : null}</td></tr>)}</tbody></table></div></section>
          ) : null}
        </>
      ) : <section className={styles.message}>Select a company and refresh the report.</section>}
    </main>
  );
}
