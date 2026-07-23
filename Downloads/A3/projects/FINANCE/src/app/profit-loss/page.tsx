"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./profit-loss.module.css";

type Group = "revenue" | "cost_of_sales" | "operating_expense" | "other_income" | "other_expense";
type Tab = "report" | "ledger" | "accounts" | "budget" | "manual";

type Company = { id: number; name: string; status: string; base_currency?: string | null };
type Account = {
  id: number;
  company_id: number;
  account_code: string;
  account_name: string;
  account_group: Group;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  description?: string | null;
};
type Mapping = {
  id: number;
  company_id: number;
  source_type: string;
  source_category: string;
  account_id: number;
  priority: number;
  is_active: boolean;
  notes?: string | null;
};
type Budget = { id: number; company_id: number; account_id: number; budget_month: string; amount: number; notes?: string | null };
type ManualEntry = {
  id: number;
  entry_no?: string | null;
  company_id: number;
  account_id: number;
  entry_date: string;
  description: string;
  reference?: string | null;
  direction: "increase" | "decrease";
  amount: number;
  status: "posted" | "void";
  notes?: string | null;
  void_reason?: string | null;
};
type ReportRow = Account & {
  current: number;
  comparison: number;
  variance: number;
  variance_percentage: number | null;
  budget: number;
  budget_variance: number;
};
type Summary = {
  revenue: number;
  cost_of_sales: number;
  gross_profit: number;
  operating_expenses: number;
  operating_profit: number;
  other_income: number;
  other_expenses: number;
  net_profit: number;
  gross_margin_percentage: number;
  net_margin_percentage: number;
};
type LedgerEntry = {
  key: string;
  source_type: string;
  source_id: number;
  source_no: string;
  source_date: string;
  counterparty: string;
  description: string;
  source_category: string;
  account_id: number;
  amount: number;
  supports_classification: boolean;
};
type Report = {
  company: Company & Record<string, unknown>;
  period: { from: string; to: string };
  comparison_period: { from: string; to: string };
  accounts: Account[];
  mappings: Mapping[];
  budgets: Budget[];
  manual_entries: ManualEntry[];
  rows: ReportRow[];
  current: Summary;
  comparison: Summary;
  budget: Summary;
  ledger: LedgerEntry[];
};

const today = new Date().toISOString().slice(0, 10);

function monthRange(reference = new Date()) {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 0);
  const previousFrom = new Date(year, month - 1, 1);
  const previousTo = new Date(year, month, 0);
  const iso = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  return { from: iso(from), to: iso(to), comparisonFrom: iso(previousFrom), comparisonTo: iso(previousTo) };
}

const initialRange = monthRange();

function money(currency: string, amount: number) {
  return `${currency} ${Number(amount || 0).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function groupLabel(group: string) {
  return group.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    customer_invoice: "Customer Invoice",
    supplier_bill: "Supplier Bill",
    driver_payout: "Driver Payout",
    bank_cashbook: "Bank / Cash Book",
    manual: "Manual Entry",
  };
  return labels[source] ?? groupLabel(source);
}

function accountEmpty(companyId = 0) {
  return {
    id: null as number | null,
    company_id: companyId,
    account_code: "",
    account_name: "",
    account_group: "operating_expense" as Group,
    is_active: true,
    sort_order: "100",
    description: "",
  };
}

function mappingEmpty(companyId = 0) {
  return {
    id: null as number | null,
    company_id: companyId,
    source_type: "supplier_bill",
    source_category: "*",
    account_id: "",
    priority: "100",
    is_active: true,
    notes: "",
  };
}

function budgetEmpty(companyId = 0) {
  return { company_id: companyId, account_id: "", budget_month: `${today.slice(0, 7)}-01`, amount: "0.00", notes: "" };
}

function manualEmpty(companyId = 0) {
  return {
    company_id: companyId,
    account_id: "",
    entry_date: today,
    description: "",
    reference: "",
    direction: "increase" as "increase" | "decrease",
    amount: "0.00",
    notes: "",
  };
}

export default function ProfitLossPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [companyId, setCompanyId] = useState(0);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [comparisonFrom, setComparisonFrom] = useState(initialRange.comparisonFrom);
  const [comparisonTo, setComparisonTo] = useState(initialRange.comparisonTo);
  const [tab, setTab] = useState<Tab>("report");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerSource, setLedgerSource] = useState("all");
  const [accountForm, setAccountForm] = useState(accountEmpty());
  const [mappingForm, setMappingForm] = useState(mappingEmpty());
  const [budgetForm, setBudgetForm] = useState(budgetEmpty());
  const [manualForm, setManualForm] = useState(manualEmpty());

  const selectedCompany = useMemo(() => companies.find((company) => company.id === companyId) ?? null, [companies, companyId]);
  const currency = selectedCompany?.base_currency || "SGD";
  const companyAccounts = useMemo(() => accounts.filter((account) => account.company_id === companyId), [accounts, companyId]);
  const companyMappings = useMemo(() => mappings.filter((mapping) => mapping.company_id === companyId), [mappings, companyId]);
  const companyBudgets = useMemo(() => budgets.filter((budget) => budget.company_id === companyId), [budgets, companyId]);
  const companyManualEntries = useMemo(
    () => manualEntries.filter((entry) => entry.company_id === companyId),
    [manualEntries, companyId],
  );

  const filteredLedger = useMemo(() => {
    const search = ledgerSearch.trim().toLowerCase();
    return (report?.ledger ?? []).filter((entry) => {
      const sourceMatch = ledgerSource === "all" || entry.source_type === ledgerSource;
      const textMatch =
        !search ||
        [entry.source_no, entry.counterparty, entry.description, entry.source_category]
          .join(" ")
          .toLowerCase()
          .includes(search);
      return sourceMatch && textMatch;
    });
  }, [ledgerSearch, ledgerSource, report]);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/profit-loss", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load Profit & Loss settings.");
      setCompanies(payload.companies ?? []);
      setAccounts(payload.accounts ?? []);
      setMappings(payload.mappings ?? []);
      setBudgets(payload.budgets ?? []);
      setManualEntries(payload.manual_entries ?? []);
      const firstCompanyId = Number(payload.companies?.[0]?.id ?? 0);
      setCompanyId((current) => current || firstCompanyId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load Profit & Loss settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    if (!companyId || !from || !to || !comparisonFrom || !comparisonTo) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams({
        company_id: String(companyId),
        from,
        to,
        comparison_from: comparisonFrom,
        comparison_to: comparisonTo,
      });
      const response = await fetch(`/api/admin/profit-loss?${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to prepare the Profit & Loss report.");
      setReport(payload.report);
      setAccounts((current) => [
        ...current.filter((account) => account.company_id !== companyId),
        ...(payload.report?.accounts ?? []),
      ]);
      setMappings((current) => [
        ...current.filter((mapping) => mapping.company_id !== companyId),
        ...(payload.report?.mappings ?? []),
      ]);
      setBudgets((current) => [
        ...current.filter((budget) => budget.company_id !== companyId),
        ...(payload.report?.budgets ?? []),
      ]);
      setManualEntries((current) => [
        ...current.filter((entry) => entry.company_id !== companyId),
        ...(payload.report?.manual_entries ?? []),
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to prepare the Profit & Loss report.");
    } finally {
      setLoading(false);
    }
  }, [companyId, comparisonFrom, comparisonTo, from, to]);

  useEffect(() => void loadSetup(), [loadSetup]);
  useEffect(() => {
    if (companyId) {
      setAccountForm(accountEmpty(companyId));
      setMappingForm(mappingEmpty(companyId));
      setBudgetForm(budgetEmpty(companyId));
      setManualForm(manualEmpty(companyId));
      void loadReport();
    }
  }, [companyId, loadReport]);

  async function post(body: Record<string, unknown>) {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/profit-loss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to save Profit & Loss data.");
      return payload;
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount() {
    try {
      await post({
        action: "save_account",
        ...accountForm,
        company_id: companyId,
        sort_order: Number(accountForm.sort_order),
      });
      setMessage(accountForm.id ? "P&L account updated." : "P&L account created.");
      setAccountForm(accountEmpty(companyId));
      await loadSetup();
      await loadReport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save the P&L account.");
    }
  }

  async function saveMapping() {
    try {
      await post({
        action: "save_mapping",
        ...mappingForm,
        company_id: companyId,
        account_id: Number(mappingForm.account_id),
        priority: Number(mappingForm.priority),
      });
      setMessage(mappingForm.id ? "Source mapping updated." : "Source mapping created.");
      setMappingForm(mappingEmpty(companyId));
      await loadSetup();
      await loadReport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save the source mapping.");
    }
  }

  async function deleteMapping(mapping: Mapping) {
    if (!window.confirm(`Delete mapping ${sourceLabel(mapping.source_type)} / ${mapping.source_category}?`)) return;
    try {
      await post({ action: "delete_mapping", id: mapping.id, company_id: companyId });
      setMessage("Source mapping deleted.");
      await loadSetup();
      await loadReport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete the source mapping.");
    }
  }

  async function saveBudget() {
    try {
      await post({
        action: "save_budget",
        ...budgetForm,
        company_id: companyId,
        account_id: Number(budgetForm.account_id),
        amount: Number(budgetForm.amount),
      });
      setMessage("Monthly budget saved.");
      setBudgetForm(budgetEmpty(companyId));
      await loadSetup();
      await loadReport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save the monthly budget.");
    }
  }

  async function saveManualEntry() {
    try {
      await post({
        action: "save_manual_entry",
        ...manualForm,
        company_id: companyId,
        account_id: Number(manualForm.account_id),
        amount: Number(manualForm.amount),
      });
      setMessage("Manual P&L entry posted.");
      setManualForm(manualEmpty(companyId));
      await loadSetup();
      await loadReport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to post the manual P&L entry.");
    }
  }

  async function voidManualEntry(entry: ManualEntry) {
    const reason = window.prompt(`Enter the reason for voiding ${entry.entry_no ?? "this entry"}:`);
    if (!reason?.trim()) return;
    try {
      await post({ action: "void_manual_entry", id: entry.id, reason });
      setMessage("Manual P&L entry voided.");
      await loadSetup();
      await loadReport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to void the manual P&L entry.");
    }
  }

  async function classifySource(entry: LedgerEntry, accountId: number) {
    try {
      await post({
        action: "classify_source",
        company_id: companyId,
        source_type: entry.source_type,
        source_id: entry.source_id,
        account_id: accountId,
      });
      setMessage(`${entry.source_no} classified successfully.`);
      await loadReport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to classify the source transaction.");
    }
  }

  function applyPreset(preset: "month" | "quarter" | "year") {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const iso = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    if (preset === "month") {
      const range = monthRange(now);
      setFrom(range.from);
      setTo(range.to);
      setComparisonFrom(range.comparisonFrom);
      setComparisonTo(range.comparisonTo);
      return;
    }
    if (preset === "quarter") {
      const startMonth = Math.floor(month / 3) * 3;
      setFrom(iso(new Date(year, startMonth, 1)));
      setTo(iso(new Date(year, startMonth + 3, 0)));
      setComparisonFrom(iso(new Date(year, startMonth - 3, 1)));
      setComparisonTo(iso(new Date(year, startMonth, 0)));
      return;
    }
    setFrom(`${year}-01-01`);
    setTo(`${year}-12-31`);
    setComparisonFrom(`${year - 1}-01-01`);
    setComparisonTo(`${year - 1}-12-31`);
  }

  const printParams = new URLSearchParams({
    company_id: String(companyId),
    from,
    to,
    comparison_from: comparisonFrom,
    comparison_to: comparisonTo,
  }).toString();

  if (loading && companies.length === 0) return <main className={styles.loading}>Loading Profit & Loss reporting...</main>;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>MANAGEMENT ACCOUNTS</p>
          <h1>Profit &amp; Loss</h1>
          <p>Review revenue, direct costs, operating expenses, margins, budgets and source transactions.</p>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.secondaryButton} href={`/profit-loss/print?${printParams}`} target="_blank">
            Print Report
          </Link>
          <button className={styles.primaryButton} type="button" onClick={() => void loadReport()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Report"}
          </button>
        </div>
      </section>

      {message ? <div className={styles.success}>{message}</div> : null}
      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

      <section className={styles.controls}>
        <label>
          <span>Company</span>
          <select value={companyId} onChange={(event) => setCompanyId(Number(event.target.value))}>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
        </label>
        <label><span>Report From</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span>Report To</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label><span>Compare From</span><input type="date" value={comparisonFrom} onChange={(event) => setComparisonFrom(event.target.value)} /></label>
        <label><span>Compare To</span><input type="date" value={comparisonTo} onChange={(event) => setComparisonTo(event.target.value)} /></label>
        <div className={styles.presets}>
          <span>Quick Period</span>
          <div><button type="button" onClick={() => applyPreset("month")}>Month</button><button type="button" onClick={() => applyPreset("quarter")}>Quarter</button><button type="button" onClick={() => applyPreset("year")}>Year</button></div>
        </div>
      </section>

      <nav className={styles.tabs}>
        {(["report", "ledger", "accounts", "budget", "manual"] as Tab[]).map((item) => (
          <button key={item} type="button" className={tab === item ? styles.activeTab : ""} onClick={() => setTab(item)}>
            {item === "report" ? "P&L Report" : item === "ledger" ? "Source Ledger" : item === "accounts" ? "Accounts & Mappings" : item === "budget" ? "Budgets" : "Manual Entries"}
          </button>
        ))}
      </nav>

      {tab === "report" && report ? (
        <>
          <section className={styles.summaryGrid}>
            <article><span>Revenue</span><strong>{money(currency, report.current.revenue)}</strong><small>{report.current.gross_margin_percentage.toFixed(1)}% gross margin</small></article>
            <article><span>Gross Profit</span><strong>{money(currency, report.current.gross_profit)}</strong><small>After direct costs</small></article>
            <article><span>Operating Profit</span><strong>{money(currency, report.current.operating_profit)}</strong><small>Before other income and expenses</small></article>
            <article className={report.current.net_profit >= 0 ? styles.profit : styles.loss}><span>Net Profit / (Loss)</span><strong>{money(currency, report.current.net_profit)}</strong><small>{report.current.net_margin_percentage.toFixed(1)}% net margin</small></article>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div><p className={styles.eyebrow}>PERFORMANCE STATEMENT</p><h2>{selectedCompany?.name}</h2><p>{formatDate(from)} to {formatDate(to)} compared with {formatDate(comparisonFrom)} to {formatDate(comparisonTo)}</p></div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.statementTable}>
                <thead><tr><th>Account</th><th>Current</th><th>Comparison</th><th>Variance</th><th>Budget</th><th>Budget Variance</th></tr></thead>
                <tbody>
                  {(["revenue", "cost_of_sales", "operating_expense", "other_income", "other_expense"] as Group[]).map((group) => {
                    const rows = report.rows.filter((row) => row.account_group === group && (row.current !== 0 || row.comparison !== 0 || row.budget !== 0 || row.is_active));
                    const current = rows.reduce((sum, row) => sum + row.current, 0);
                    const comparison = rows.reduce((sum, row) => sum + row.comparison, 0);
                    const budget = rows.reduce((sum, row) => sum + row.budget, 0);
                    return [
                      <tr className={styles.groupRow} key={`${group}-heading`}><td colSpan={6}>{groupLabel(group)}</td></tr>,
                      ...rows.map((row) => (
                        <tr key={row.id}>
                          <td><strong>{row.account_code}</strong><span>{row.account_name}</span></td>
                          <td className={styles.amount}>{money(currency, row.current)}</td>
                          <td className={styles.amount}>{money(currency, row.comparison)}</td>
                          <td className={`${styles.amount} ${row.variance >= 0 ? styles.positiveText : styles.negativeText}`}>{money(currency, row.variance)}{row.variance_percentage !== null ? <small>{row.variance_percentage.toFixed(1)}%</small> : null}</td>
                          <td className={styles.amount}>{money(currency, row.budget)}</td>
                          <td className={`${styles.amount} ${row.budget_variance >= 0 ? styles.positiveText : styles.negativeText}`}>{money(currency, row.budget_variance)}</td>
                        </tr>
                      )),
                      <tr className={styles.subtotalRow} key={`${group}-total`}><td>Total {groupLabel(group)}</td><td>{money(currency, current)}</td><td>{money(currency, comparison)}</td><td>{money(currency, current - comparison)}</td><td>{money(currency, budget)}</td><td>{money(currency, group === "revenue" || group === "other_income" ? current - budget : budget - current)}</td></tr>,
                    ];
                  })}
                  <tr className={styles.netRow}><td>Net Profit / (Loss)</td><td>{money(currency, report.current.net_profit)}</td><td>{money(currency, report.comparison.net_profit)}</td><td>{money(currency, report.current.net_profit - report.comparison.net_profit)}</td><td>{money(currency, report.budget.net_profit)}</td><td>{money(currency, report.current.net_profit - report.budget.net_profit)}</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {tab === "ledger" ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>SOURCE DRILL-DOWN</p><h2>Profit &amp; Loss Source Ledger</h2><p>Review and reclassify the operational records behind the report.</p></div></div>
          <div className={styles.toolbar}>
            <input value={ledgerSearch} onChange={(event) => setLedgerSearch(event.target.value)} placeholder="Search reference, counterparty or description" />
            <select value={ledgerSource} onChange={(event) => setLedgerSource(event.target.value)}><option value="all">All sources</option><option value="customer_invoice">Customer invoices</option><option value="supplier_bill">Supplier bills</option><option value="driver_payout">Driver payouts</option><option value="bank_cashbook">Bank / cash book</option><option value="manual">Manual entries</option></select>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.dataTable}><thead><tr><th>Date</th><th>Source</th><th>Reference</th><th>Counterparty / Description</th><th>P&amp;L Account</th><th>Amount</th></tr></thead><tbody>
              {filteredLedger.map((entry) => (
                <tr key={entry.key}>
                  <td>{formatDate(entry.source_date)}</td><td>{sourceLabel(entry.source_type)}<small>{entry.source_category}</small></td><td>{entry.source_no}</td><td><strong>{entry.counterparty}</strong><small>{entry.description}</small></td>
                  <td>{entry.supports_classification ? <select value={entry.account_id} disabled={saving} onChange={(event) => void classifySource(entry, Number(event.target.value))}>{companyAccounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select> : <span>{companyAccounts.find((account) => account.id === entry.account_id)?.account_name ?? "Unclassified"}</span>}</td>
                  <td className={styles.amount}>{money(currency, entry.amount)}</td>
                </tr>
              ))}
              {filteredLedger.length === 0 ? <tr><td colSpan={6} className={styles.empty}>No P&amp;L source transactions match the selected filters.</td></tr> : null}
            </tbody></table>
          </div>
        </section>
      ) : null}

      {tab === "accounts" ? (
        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>CHART OF ACCOUNTS</p><h2>P&amp;L Accounts</h2></div></div>
            <div className={styles.formGrid}>
              <label><span>Account Code</span><input value={accountForm.account_code} onChange={(event) => setAccountForm((current) => ({ ...current, account_code: event.target.value }))} /></label>
              <label><span>Account Name</span><input value={accountForm.account_name} onChange={(event) => setAccountForm((current) => ({ ...current, account_name: event.target.value }))} /></label>
              <label><span>Group</span><select value={accountForm.account_group} onChange={(event) => setAccountForm((current) => ({ ...current, account_group: event.target.value as Group }))}>{(["revenue", "cost_of_sales", "operating_expense", "other_income", "other_expense"] as Group[]).map((group) => <option key={group} value={group}>{groupLabel(group)}</option>)}</select></label>
              <label><span>Sort Order</span><input type="number" value={accountForm.sort_order} onChange={(event) => setAccountForm((current) => ({ ...current, sort_order: event.target.value }))} /></label>
              <label className={styles.full}><span>Description</span><textarea value={accountForm.description} onChange={(event) => setAccountForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className={styles.checkbox}><input type="checkbox" checked={accountForm.is_active} onChange={(event) => setAccountForm((current) => ({ ...current, is_active: event.target.checked }))} /><span>Active account</span></label>
            </div>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setAccountForm(accountEmpty(companyId))}>Clear</button><button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void saveAccount()}>{accountForm.id ? "Update Account" : "Create Account"}</button></div>
            <div className={styles.compactList}>{companyAccounts.map((account) => <button key={account.id} type="button" onClick={() => setAccountForm({ id: account.id, company_id: account.company_id, account_code: account.account_code, account_name: account.account_name, account_group: account.account_group, is_active: account.is_active, sort_order: String(account.sort_order), description: account.description ?? "" })}><span><strong>{account.account_code} — {account.account_name}</strong><small>{groupLabel(account.account_group)}{account.is_system ? " · System" : ""}</small></span><em>{account.is_active ? "Active" : "Inactive"}</em></button>)}</div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeading}><div><p className={styles.eyebrow}>AUTOMATIC CLASSIFICATION</p><h2>Source Mappings</h2></div></div>
            <div className={styles.formGrid}>
              <label><span>Source</span><select value={mappingForm.source_type} onChange={(event) => setMappingForm((current) => ({ ...current, source_type: event.target.value }))}><option value="customer_invoice">Customer Invoice</option><option value="supplier_bill">Supplier Bill</option><option value="driver_payout">Driver Payout</option><option value="bank_cashbook">Bank / Cash Book</option><option value="manual">Manual</option></select></label>
              <label><span>Category</span><input value={mappingForm.source_category} onChange={(event) => setMappingForm((current) => ({ ...current, source_category: event.target.value }))} placeholder="Use * as fallback" /></label>
              <label className={styles.full}><span>P&amp;L Account</span><select value={mappingForm.account_id} onChange={(event) => setMappingForm((current) => ({ ...current, account_id: event.target.value }))}><option value="">Select account</option>{companyAccounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select></label>
              <label><span>Priority</span><input type="number" value={mappingForm.priority} onChange={(event) => setMappingForm((current) => ({ ...current, priority: event.target.value }))} /></label>
              <label className={styles.checkbox}><input type="checkbox" checked={mappingForm.is_active} onChange={(event) => setMappingForm((current) => ({ ...current, is_active: event.target.checked }))} /><span>Active mapping</span></label>
            </div>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setMappingForm(mappingEmpty(companyId))}>Clear</button><button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void saveMapping()}>{mappingForm.id ? "Update Mapping" : "Create Mapping"}</button></div>
            <div className={styles.mappingList}>{companyMappings.map((mapping) => { const account = companyAccounts.find((item) => item.id === mapping.account_id); return <article key={mapping.id}><button type="button" onClick={() => setMappingForm({ id: mapping.id, company_id: mapping.company_id, source_type: mapping.source_type, source_category: mapping.source_category, account_id: String(mapping.account_id), priority: String(mapping.priority), is_active: mapping.is_active, notes: mapping.notes ?? "" })}><strong>{sourceLabel(mapping.source_type)} · {mapping.source_category}</strong><span>{account?.account_code} — {account?.account_name}</span></button><button type="button" className={styles.dangerLink} onClick={() => void deleteMapping(mapping)}>Delete</button></article>; })}</div>
          </section>
        </div>
      ) : null}

      {tab === "budget" ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>PLANNING</p><h2>Monthly P&amp;L Budgets</h2><p>Budgets are compared against the selected report period.</p></div></div>
          <div className={styles.inlineForm}>
            <label><span>Month</span><input type="month" value={budgetForm.budget_month.slice(0, 7)} onChange={(event) => setBudgetForm((current) => ({ ...current, budget_month: `${event.target.value}-01` }))} /></label>
            <label><span>Account</span><select value={budgetForm.account_id} onChange={(event) => setBudgetForm((current) => ({ ...current, account_id: event.target.value }))}><option value="">Select account</option>{companyAccounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select></label>
            <label><span>Budget Amount</span><input type="number" min="0" step="0.01" value={budgetForm.amount} onChange={(event) => setBudgetForm((current) => ({ ...current, amount: event.target.value }))} /></label>
            <button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void saveBudget()}>Save Budget</button>
          </div>
          <div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Month</th><th>Account</th><th>Group</th><th>Budget</th><th>Notes</th></tr></thead><tbody>{companyBudgets.map((budget) => { const account = companyAccounts.find((item) => item.id === budget.account_id); return <tr key={budget.id} onDoubleClick={() => setBudgetForm({ company_id: companyId, account_id: String(budget.account_id), budget_month: budget.budget_month, amount: String(budget.amount), notes: budget.notes ?? "" })}><td>{budget.budget_month.slice(0, 7)}</td><td>{account?.account_code} — {account?.account_name}</td><td>{account ? groupLabel(account.account_group) : "—"}</td><td className={styles.amount}>{money(currency, budget.amount)}</td><td>{budget.notes || "—"}</td></tr>; })}{companyBudgets.length === 0 ? <tr><td colSpan={5} className={styles.empty}>No monthly budgets have been entered.</td></tr> : null}</tbody></table></div>
        </section>
      ) : null}

      {tab === "manual" ? (
        <section className={styles.panel}>
          <div className={styles.panelHeading}><div><p className={styles.eyebrow}>JOURNAL ADJUSTMENTS</p><h2>Manual P&amp;L Entries</h2><p>Use only for accruals, corrections and management adjustments not recorded elsewhere.</p></div></div>
          <div className={styles.formGrid}>
            <label><span>Date</span><input type="date" value={manualForm.entry_date} onChange={(event) => setManualForm((current) => ({ ...current, entry_date: event.target.value }))} /></label>
            <label><span>Account</span><select value={manualForm.account_id} onChange={(event) => setManualForm((current) => ({ ...current, account_id: event.target.value }))}><option value="">Select account</option>{companyAccounts.filter((account) => account.is_active).map((account) => <option key={account.id} value={account.id}>{account.account_code} — {account.account_name}</option>)}</select></label>
            <label><span>Direction</span><select value={manualForm.direction} onChange={(event) => setManualForm((current) => ({ ...current, direction: event.target.value as "increase" | "decrease" }))}><option value="increase">Increase Account</option><option value="decrease">Decrease Account</option></select></label>
            <label><span>Amount</span><input type="number" min="0.01" step="0.01" value={manualForm.amount} onChange={(event) => setManualForm((current) => ({ ...current, amount: event.target.value }))} /></label>
            <label className={styles.full}><span>Description</span><input value={manualForm.description} onChange={(event) => setManualForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <label><span>Reference</span><input value={manualForm.reference} onChange={(event) => setManualForm((current) => ({ ...current, reference: event.target.value }))} /></label>
            <label><span>Notes</span><input value={manualForm.notes} onChange={(event) => setManualForm((current) => ({ ...current, notes: event.target.value }))} /></label>
          </div>
          <div className={styles.formActions}><button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void saveManualEntry()}>Post Manual Entry</button></div>
          <div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Date</th><th>Entry</th><th>Account</th><th>Description</th><th>Direction</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>{companyManualEntries.map((entry) => { const account = companyAccounts.find((item) => item.id === entry.account_id); return <tr key={entry.id}><td>{formatDate(entry.entry_date)}</td><td>{entry.entry_no}</td><td>{account?.account_code} — {account?.account_name}</td><td>{entry.description}<small>{entry.reference || entry.notes || ""}</small></td><td>{entry.direction === "increase" ? "Increase" : "Decrease"}</td><td className={styles.amount}>{money(currency, entry.amount)}</td><td><span className={entry.status === "posted" ? styles.statusPosted : styles.statusVoid}>{entry.status}</span></td><td>{entry.status === "posted" ? <button type="button" className={styles.dangerLink} onClick={() => void voidManualEntry(entry)}>Void</button> : <small>{entry.void_reason}</small>}</td></tr>; })}{companyManualEntries.length === 0 ? <tr><td colSpan={8} className={styles.empty}>No manual P&amp;L entries have been posted.</td></tr> : null}</tbody></table></div>
        </section>
      ) : null}
    </main>
  );
}
