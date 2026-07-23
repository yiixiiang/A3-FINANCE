"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./bank-reconciliation.module.css";

type Company = {
  id: number;
  name: string;
  status: string;
  base_currency?: string | null;
};

type BankAccount = {
  id: number;
  company_id: number;
  account_code?: string | null;
  account_name: string;
  bank_name?: string | null;
  account_no?: string | null;
  currency: string;
  opening_balance: number;
  opening_balance_date?: string | null;
  is_active: boolean;
  notes?: string | null;
};

type StatementBatch = {
  id: number;
  batch_no?: string | null;
  company_id: number;
  bank_account_id: number;
  statement_reference?: string | null;
  period_from: string;
  period_to: string;
  opening_balance: number;
  closing_balance: number;
  status: "draft" | "reconciled";
  notes?: string | null;
  reconciled_at?: string | null;
};

type StatementLine = {
  id: number;
  batch_id: number;
  company_id: number;
  bank_account_id: number;
  sequence_no: number;
  transaction_date: string;
  value_date?: string | null;
  description: string;
  reference?: string | null;
  amount: number;
  running_balance?: number | null;
  match_status: "unmatched" | "partial" | "matched" | "ignored";
  ignored_reason?: string | null;
};

type CashbookEntry = {
  id: number;
  entry_no?: string | null;
  company_id: number;
  bank_account_id: number;
  entry_date: string;
  value_date?: string | null;
  entry_type: string;
  source_type?: string | null;
  source_id?: number | null;
  reference?: string | null;
  description: string;
  amount: number;
  status: "posted" | "void";
  notes?: string | null;
  void_reason?: string | null;
};

type ReconciliationMatch = {
  id: number;
  statement_line_id: number;
  cashbook_entry_id: number;
  matched_amount: number;
};

type ParsedLine = {
  transaction_date: string;
  value_date?: string;
  description: string;
  reference?: string;
  amount: number;
  running_balance?: number | null;
};

type Tab = "reconcile" | "statements" | "cashbook" | "accounts";

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 7)}-01`;

function money(currency: string, amount: number) {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseMoney(value: string) {
  const text = value
    .replace(/[,$£€¥]/g, "")
    .replace(/\s/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  const parsed = Number(text || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function splitRow(row: string, delimiter: string): string[] {
  if (delimiter === "\t") return row.split("\t").map((value) => value.trim());
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index];
    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function parseStatementText(text: string): ParsedLine[] {
  const rows = text
    .replace(/\r/g, "")
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);
  if (rows.length < 2) return [];
  const delimiter = rows[0].includes("\t") ? "\t" : rows[0].includes(";") ? ";" : ",";
  const headers = splitRow(rows[0], delimiter).map((header) =>
    header.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );
  const indexOf = (...names: string[]) =>
    headers.findIndex((header) => names.includes(header));
  const dateIndex = indexOf("date", "transactiondate", "postingdate", "txndate");
  const valueDateIndex = indexOf("valuedate");
  const descriptionIndex = indexOf("description", "details", "narrative", "transactiondescription");
  const referenceIndex = indexOf("reference", "ref", "transactionreference", "chequeno");
  const amountIndex = indexOf("amount", "transactionamount", "signedamount");
  const debitIndex = indexOf("debit", "withdrawal", "moneyout");
  const creditIndex = indexOf("credit", "deposit", "moneyin");
  const balanceIndex = indexOf("balance", "runningbalance", "closingbalance");
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    return [];
  }

  return rows.slice(1).flatMap((row) => {
    const values = splitRow(row, delimiter);
    const transactionDate = parseDate(values[dateIndex] ?? "");
    const description = String(values[descriptionIndex] ?? "").trim();
    const amount =
      amountIndex >= 0
        ? parseMoney(values[amountIndex] ?? "")
        : parseMoney(values[creditIndex] ?? "") - parseMoney(values[debitIndex] ?? "");
    if (!transactionDate || !description || amount === 0) return [];
    const balanceValue = balanceIndex >= 0 ? String(values[balanceIndex] ?? "").trim() : "";
    return [
      {
        transaction_date: transactionDate,
        value_date:
          valueDateIndex >= 0 ? parseDate(values[valueDateIndex] ?? "") ?? undefined : undefined,
        description,
        reference:
          referenceIndex >= 0 ? String(values[referenceIndex] ?? "").trim() || undefined : undefined,
        amount,
        running_balance: balanceValue ? parseMoney(balanceValue) : null,
      },
    ];
  });
}

function accountEmpty(companyId = 0) {
  return {
    id: null as number | null,
    company_id: companyId,
    account_code: "",
    account_name: "",
    bank_name: "",
    account_no: "",
    currency: "SGD",
    opening_balance: "0.00",
    opening_balance_date: "",
    is_active: true,
    notes: "",
  };
}

function batchEmpty(companyId = 0, accountId = 0) {
  return {
    company_id: companyId,
    bank_account_id: accountId,
    statement_reference: "",
    period_from: monthStart,
    period_to: today,
    opening_balance: "0.00",
    closing_balance: "0.00",
    notes: "",
  };
}

function cashbookEmpty(companyId = 0, accountId = 0) {
  return {
    id: null as number | null,
    company_id: companyId,
    bank_account_id: accountId,
    entry_date: today,
    value_date: "",
    entry_type: "adjustment",
    reference: "",
    description: "",
    amount: "0.00",
    notes: "",
  };
}

export default function BankReconciliationPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [batches, setBatches] = useState<StatementBatch[]>([]);
  const [lines, setLines] = useState<StatementLine[]>([]);
  const [entries, setEntries] = useState<CashbookEntry[]>([]);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [companyId, setCompanyId] = useState(0);
  const [accountId, setAccountId] = useState(0);
  const [batchId, setBatchId] = useState(0);
  const [tab, setTab] = useState<Tab>("reconcile");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [accountForm, setAccountForm] = useState(accountEmpty());
  const [batchForm, setBatchForm] = useState(batchEmpty());
  const [cashbookForm, setCashbookForm] = useState(cashbookEmpty());
  const [statementText, setStatementText] = useState("");
  const [matchEntryIds, setMatchEntryIds] = useState<Record<number, number>>({});
  const [matchAmounts, setMatchAmounts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/bank-reconciliation", { cache: "no-store" });
      const payload = (await response.json()) as {
        companies?: Company[];
        accounts?: BankAccount[];
        batches?: StatementBatch[];
        lines?: StatementLine[];
        entries?: CashbookEntry[];
        matches?: ReconciliationMatch[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to load bank reconciliation.");
      setCompanies(payload.companies ?? []);
      setAccounts(payload.accounts ?? []);
      setBatches(payload.batches ?? []);
      setLines(payload.lines ?? []);
      setEntries(payload.entries ?? []);
      setMatches(payload.matches ?? []);
      setCompanyId((current) => current || payload.companies?.[0]?.id || 0);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load bank reconciliation.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const companyAccounts = useMemo(
    () => accounts.filter((account) => account.company_id === companyId),
    [accounts, companyId],
  );
  const accountBatches = useMemo(
    () =>
      batches.filter(
        (batch) => batch.company_id === companyId && (!accountId || batch.bank_account_id === accountId),
      ),
    [accountId, batches, companyId],
  );

  useEffect(() => {
    if (!companyAccounts.some((account) => account.id === accountId)) {
      const nextAccount = companyAccounts.find((account) => account.is_active) ?? companyAccounts[0];
      setAccountId(nextAccount?.id ?? 0);
    }
  }, [accountId, companyAccounts]);

  useEffect(() => {
    if (!accountBatches.some((batch) => batch.id === batchId)) {
      setBatchId(accountBatches[0]?.id ?? 0);
    }
  }, [accountBatches, batchId]);

  useEffect(() => {
    setAccountForm((current) =>
      current.id ? current : { ...accountEmpty(companyId), currency: companies.find((c) => c.id === companyId)?.base_currency || "SGD" },
    );
    setBatchForm((current) => ({ ...current, company_id: companyId, bank_account_id: accountId }));
    setCashbookForm((current) => ({ ...current, company_id: companyId, bank_account_id: accountId }));
  }, [accountId, companies, companyId]);

  const selectedAccount = companyAccounts.find((account) => account.id === accountId) ?? null;
  const selectedBatch = accountBatches.find((batch) => batch.id === batchId) ?? null;
  const batchLines = useMemo(
    () => lines.filter((line) => line.batch_id === batchId).sort((a, b) => a.sequence_no - b.sequence_no),
    [batchId, lines],
  );
  const accountEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.company_id === companyId && entry.bank_account_id === accountId)
        .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.id - a.id),
    [accountId, companyId, entries],
  );
  const batchMatches = useMemo(() => {
    const lineIds = new Set(batchLines.map((line) => line.id));
    return matches.filter((match) => lineIds.has(match.statement_line_id));
  }, [batchLines, matches]);
  const lineMatched = useMemo(() => {
    const result = new Map<number, number>();
    for (const match of matches) {
      result.set(match.statement_line_id, (result.get(match.statement_line_id) ?? 0) + number(match.matched_amount));
    }
    return result;
  }, [matches]);
  const entryMatched = useMemo(() => {
    const result = new Map<number, number>();
    for (const match of matches) {
      result.set(match.cashbook_entry_id, (result.get(match.cashbook_entry_id) ?? 0) + number(match.matched_amount));
    }
    return result;
  }, [matches]);

  const summary = useMemo(() => {
    const statementMovement = batchLines.reduce((sum, line) => sum + number(line.amount), 0);
    const calculatedClosing = number(selectedBatch?.opening_balance) + statementMovement;
    const unmatched = batchLines.filter((line) => !["matched", "ignored"].includes(line.match_status)).length;
    const matchedAmount = batchMatches.reduce((sum, match) => sum + number(match.matched_amount), 0);
    const bookMovement = accountEntries
      .filter(
        (entry) =>
          entry.status === "posted" &&
          (!selectedAccount?.opening_balance_date ||
            entry.entry_date >= selectedAccount.opening_balance_date),
      )
      .reduce((sum, entry) => sum + number(entry.amount), 0);
    return { statementMovement, calculatedClosing, unmatched, matchedAmount, bookMovement };
  }, [accountEntries, batchLines, batchMatches, selectedAccount, selectedBatch]);

  const parsedLines = useMemo(() => parseStatementText(statementText), [statementText]);

  async function post(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/bank-reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Request failed.");
      await load();
      setMessage(successMessage);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Request failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount() {
    const success = await post(
      {
        action: "save_account",
        ...accountForm,
        company_id: companyId,
        opening_balance: number(accountForm.opening_balance),
      },
      accountForm.id ? "Bank account updated." : "Bank account created.",
    );
    if (success) setAccountForm(accountEmpty(companyId));
  }

  async function createBatch() {
    const success = await post(
      {
        action: "create_batch",
        ...batchForm,
        company_id: companyId,
        bank_account_id: accountId,
        opening_balance: number(batchForm.opening_balance),
        closing_balance: number(batchForm.closing_balance),
      },
      "Statement reconciliation batch created.",
    );
    if (success) {
      setBatchForm(batchEmpty(companyId, accountId));
      setTab("statements");
    }
  }

  async function importLines() {
    if (!batchId) {
      setErrorMessage("Create or select a statement batch first.");
      return;
    }
    if (!parsedLines.length) {
      setErrorMessage("No valid rows found. Check the required column headings.");
      return;
    }
    const success = await post(
      { action: "import_lines", batch_id: batchId, lines: parsedLines, replace: true },
      `${parsedLines.length} statement line(s) imported.`,
    );
    if (success) setStatementText("");
  }

  async function saveCashbook() {
    const success = await post(
      {
        action: "save_cashbook",
        ...cashbookForm,
        company_id: companyId,
        bank_account_id: accountId,
        amount: number(cashbookForm.amount),
      },
      cashbookForm.id ? "Cash-book entry updated." : "Cash-book entry created.",
    );
    if (success) setCashbookForm(cashbookEmpty(companyId, accountId));
  }

  async function matchLine(line: StatementLine) {
    const entryId = matchEntryIds[line.id];
    if (!entryId) {
      setErrorMessage("Select a cash-book entry to match.");
      return;
    }
    const remaining = Math.max(0, Math.abs(number(line.amount)) - (lineMatched.get(line.id) ?? 0));
    const amount = number(matchAmounts[line.id] || remaining);
    await post(
      {
        action: "match",
        statement_line_id: line.id,
        cashbook_entry_id: entryId,
        amount,
      },
      "Transaction matched.",
    );
  }

  function editAccount(account: BankAccount) {
    setAccountForm({
      id: account.id,
      company_id: account.company_id,
      account_code: account.account_code ?? "",
      account_name: account.account_name,
      bank_name: account.bank_name ?? "",
      account_no: account.account_no ?? "",
      currency: account.currency,
      opening_balance: String(account.opening_balance ?? 0),
      opening_balance_date: account.opening_balance_date ?? "",
      is_active: account.is_active,
      notes: account.notes ?? "",
    });
    setTab("accounts");
  }

  function editCashbook(entry: CashbookEntry) {
    setCashbookForm({
      id: entry.id,
      company_id: entry.company_id,
      bank_account_id: entry.bank_account_id,
      entry_date: entry.entry_date,
      value_date: entry.value_date ?? "",
      entry_type: entry.entry_type,
      reference: entry.reference ?? "",
      description: entry.description,
      amount: String(entry.amount),
      notes: entry.notes ?? "",
    });
    setTab("cashbook");
  }

  if (loading) return <main className={styles.loading}>Loading bank reconciliation...</main>;

  return (
    <main className={styles.page}>
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>UPGRADE 5 · FINANCIAL CONTROL</p>
          <h1>Bank Reconciliation</h1>
          <p>Match bank statements to customer receipts, supplier payments, driver payouts and cash-book adjustments.</p>
        </div>
        <div className={styles.headingActions}>
          {selectedBatch ? (
            <Link href={`/bank-reconciliation/print?batch_id=${selectedBatch.id}`} target="_blank" className={styles.secondaryButton}>
              Print Report
            </Link>
          ) : null}
          <button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={saving}>Refresh</button>
        </div>
      </div>

      {message ? <div className={styles.success}>{message}</div> : null}
      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

      <section className={styles.contextBar}>
        <label>
          <span>Company</span>
          <select value={companyId} onChange={(event) => { setCompanyId(Number(event.target.value)); setAccountForm(accountEmpty(Number(event.target.value))); }}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>
        <label>
          <span>Bank / Cash Account</span>
          <select value={accountId} onChange={(event) => setAccountId(Number(event.target.value))}>
            {!companyAccounts.length ? <option value={0}>Create an account first</option> : null}
            {companyAccounts.map((account) => <option key={account.id} value={account.id}>{account.account_name} · {account.currency}</option>)}
          </select>
        </label>
        <label>
          <span>Statement Batch</span>
          <select value={batchId} onChange={(event) => setBatchId(Number(event.target.value))}>
            {!accountBatches.length ? <option value={0}>No statement batches</option> : null}
            {accountBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.batch_no || `Batch ${batch.id}`} · {formatDate(batch.period_to)} · {batch.status}</option>)}
          </select>
        </label>
      </section>

      <nav className={styles.tabs}>
        {([
          ["reconcile", "Reconcile"],
          ["statements", "Statements"],
          ["cashbook", "Cash Book"],
          ["accounts", "Bank Accounts"],
        ] as Array<[Tab, string]>).map(([value, label]) => (
          <button key={value} type="button" className={tab === value ? styles.activeTab : ""} onClick={() => setTab(value)}>{label}</button>
        ))}
      </nav>

      {tab === "reconcile" ? (
        <>
          <section className={styles.metrics}>
            <article><span>Statement Closing</span><strong>{money(selectedAccount?.currency || "SGD", number(selectedBatch?.closing_balance))}</strong><small>{selectedBatch ? formatDate(selectedBatch.period_to) : "Select a batch"}</small></article>
            <article><span>Calculated Closing</span><strong>{money(selectedAccount?.currency || "SGD", summary.calculatedClosing)}</strong><small>Opening + statement movement</small></article>
            <article><span>Matched Amount</span><strong>{money(selectedAccount?.currency || "SGD", summary.matchedAmount)}</strong><small>Allocation audit total</small></article>
            <article className={summary.unmatched ? styles.warningMetric : styles.goodMetric}><span>Unresolved Lines</span><strong>{summary.unmatched}</strong><small>Unmatched or partial</small></article>
          </section>

          <section className={styles.actionStrip}>
            <button type="button" className={styles.primaryButton} disabled={saving || !selectedBatch || selectedBatch.status === "reconciled"} onClick={() => void post({ action: "auto_match", batch_id: batchId }, "Automatic matching completed.")}>Auto Match Exact Amounts</button>
            <button type="button" className={styles.secondaryButton} disabled={saving || !accountId} onClick={() => void post({ action: "sync_cashbook", company_id: companyId, bank_account_id: accountId }, "Posted finance payments imported into the cash book.")}>Import Posted Payments</button>
            {selectedBatch?.status === "reconciled" ? (
              <button type="button" className={styles.dangerButton} disabled={saving} onClick={() => void post({ action: "reopen_batch", batch_id: batchId }, "Reconciliation reopened.")}>Reopen</button>
            ) : (
              <button type="button" className={styles.successButton} disabled={saving || !selectedBatch} onClick={() => void post({ action: "close_batch", batch_id: batchId }, "Reconciliation completed and locked.")}>Complete Reconciliation</button>
            )}
          </section>

          <section className={styles.tableCard}>
            <div className={styles.sectionHeading}><div><h2>Statement Matching</h2><p>Positive amounts are receipts. Negative amounts are payments.</p></div><span className={`${styles.statusBadge} ${selectedBatch?.status === "reconciled" ? styles.reconciled : ""}`}>{selectedBatch?.status || "No batch"}</span></div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Date</th><th>Statement Description</th><th className={styles.numberCell}>Amount</th><th>Status</th><th>Cash-Book Match</th><th className={styles.numberCell}>Match Amount</th><th>Action</th></tr></thead>
                <tbody>
                  {batchLines.length ? batchLines.map((line) => {
                    const used = lineMatched.get(line.id) ?? 0;
                    const remaining = Math.max(0, Math.abs(number(line.amount)) - used);
                    const lineMatches = batchMatches.filter((match) => match.statement_line_id === line.id);
                    const candidates = accountEntries.filter((entry) => {
                      const available = Math.max(0, Math.abs(number(entry.amount)) - (entryMatched.get(entry.id) ?? 0));
                      return entry.status === "posted" && available > 0 && Math.sign(number(entry.amount)) === Math.sign(number(line.amount));
                    });
                    return (
                      <tr key={line.id}>
                        <td><strong>{formatDate(line.transaction_date)}</strong><small>{line.reference || "-"}</small></td>
                        <td><strong>{line.description}</strong>{line.ignored_reason ? <small>Ignored: {line.ignored_reason}</small> : null}{lineMatches.map((match) => { const entry = entries.find((item) => item.id === match.cashbook_entry_id); return <small key={match.id}>↳ {entry?.entry_no || "Cash book"}: {money(selectedAccount?.currency || "SGD", match.matched_amount)} <button type="button" className={styles.inlineLink} disabled={selectedBatch?.status === "reconciled" || saving} onClick={() => void post({ action: "remove_match", match_id: match.id }, "Match removed.")}>remove</button></small>; })}</td>
                        <td className={`${styles.numberCell} ${number(line.amount) >= 0 ? styles.inflow : styles.outflow}`}>{money(selectedAccount?.currency || "SGD", line.amount)}</td>
                        <td><span className={`${styles.statusBadge} ${styles[line.match_status]}`}>{line.match_status}</span><small>{remaining > 0 && used > 0 ? `${money(selectedAccount?.currency || "SGD", remaining)} remaining` : ""}</small></td>
                        <td>
                          <select disabled={line.match_status === "ignored" || remaining <= 0 || selectedBatch?.status === "reconciled"} value={matchEntryIds[line.id] || 0} onChange={(event) => setMatchEntryIds((current) => ({ ...current, [line.id]: Number(event.target.value) }))}>
                            <option value={0}>Select cash-book entry</option>
                            {candidates.map((entry) => <option key={entry.id} value={entry.id}>{formatDate(entry.entry_date)} · {entry.reference || entry.entry_no} · {money(selectedAccount?.currency || "SGD", entry.amount)}</option>)}
                          </select>
                        </td>
                        <td className={styles.numberCell}><input type="number" step="0.01" min="0.01" disabled={line.match_status === "ignored" || remaining <= 0 || selectedBatch?.status === "reconciled"} value={matchAmounts[line.id] ?? remaining.toFixed(2)} onChange={(event) => setMatchAmounts((current) => ({ ...current, [line.id]: event.target.value }))} /></td>
                        <td className={styles.rowActions}>
                          <button type="button" className={styles.smallButton} disabled={saving || remaining <= 0 || !matchEntryIds[line.id] || line.match_status === "ignored" || selectedBatch?.status === "reconciled"} onClick={() => void matchLine(line)}>Match</button>
                          {line.match_status === "ignored" ? <button type="button" className={styles.smallButton} disabled={saving || selectedBatch?.status === "reconciled"} onClick={() => void post({ action: "unignore_line", statement_line_id: line.id }, "Statement line restored.")}>Restore</button> : <button type="button" className={styles.smallDanger} disabled={saving || used > 0 || selectedBatch?.status === "reconciled"} onClick={() => { const reason = window.prompt("Reason for ignoring this statement line:"); if (reason) void post({ action: "ignore_line", statement_line_id: line.id, reason }, "Statement line ignored."); }}>Ignore</button>}
                        </td>
                      </tr>
                    );
                  }) : <tr><td colSpan={7} className={styles.empty}>Create a statement batch and import transactions.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {tab === "statements" ? (
        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <div className={styles.sectionHeading}><div><h2>New Statement Batch</h2><p>Enter the statement period and balances before importing transactions.</p></div></div>
            <div className={styles.formGrid}>
              <label><span>Statement reference</span><input value={batchForm.statement_reference} onChange={(event) => setBatchForm((current) => ({ ...current, statement_reference: event.target.value }))} /></label>
              <label><span>Period from</span><input type="date" value={batchForm.period_from} onChange={(event) => setBatchForm((current) => ({ ...current, period_from: event.target.value }))} /></label>
              <label><span>Period to</span><input type="date" value={batchForm.period_to} onChange={(event) => setBatchForm((current) => ({ ...current, period_to: event.target.value }))} /></label>
              <label><span>Opening balance</span><input type="number" step="0.01" value={batchForm.opening_balance} onChange={(event) => setBatchForm((current) => ({ ...current, opening_balance: event.target.value }))} /></label>
              <label><span>Closing balance</span><input type="number" step="0.01" value={batchForm.closing_balance} onChange={(event) => setBatchForm((current) => ({ ...current, closing_balance: event.target.value }))} /></label>
              <label className={styles.fullField}><span>Notes</span><textarea value={batchForm.notes} onChange={(event) => setBatchForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            <button type="button" className={styles.primaryButton} disabled={saving || !accountId} onClick={() => void createBatch()}>Create Statement Batch</button>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}><div><h2>Import Statement Lines</h2><p>Paste CSV or tab-separated rows. Required headings: Date, Description, and Amount—or Debit and Credit.</p></div><span>{parsedLines.length} valid row(s)</span></div>
            <textarea className={styles.importArea} value={statementText} onChange={(event) => setStatementText(event.target.value)} placeholder={`Date,Description,Reference,Debit,Credit,Balance\n01/07/2026,Customer transfer,RCPT-1001,,500.00,8500.00\n02/07/2026,Bank fee,FEE-07,15.00,,8485.00`} />
            <div className={styles.importHelp}><span>Accepted date formats: DD/MM/YYYY or YYYY-MM-DD</span><span>Credit = positive · Debit = negative</span></div>
            <button type="button" className={styles.primaryButton} disabled={saving || !batchId || !parsedLines.length || selectedBatch?.status === "reconciled"} onClick={() => void importLines()}>Replace & Import Statement</button>
          </section>

          <section className={`${styles.panel} ${styles.fullPanel}`}>
            <div className={styles.sectionHeading}><div><h2>Statement Batches</h2><p>Reconciled batches are locked until reopened.</p></div></div>
            <div className={styles.tableWrap}><table><thead><tr><th>Batch</th><th>Period</th><th>Reference</th><th className={styles.numberCell}>Opening</th><th className={styles.numberCell}>Closing</th><th>Status</th><th>Report</th></tr></thead><tbody>{accountBatches.length ? accountBatches.map((batch) => <tr key={batch.id} className={batch.id === batchId ? styles.selectedRow : ""}><td><button type="button" className={styles.inlineLink} onClick={() => setBatchId(batch.id)}>{batch.batch_no || `Batch ${batch.id}`}</button></td><td>{formatDate(batch.period_from)} – {formatDate(batch.period_to)}</td><td>{batch.statement_reference || "-"}</td><td className={styles.numberCell}>{money(selectedAccount?.currency || "SGD", batch.opening_balance)}</td><td className={styles.numberCell}>{money(selectedAccount?.currency || "SGD", batch.closing_balance)}</td><td><span className={`${styles.statusBadge} ${batch.status === "reconciled" ? styles.reconciled : ""}`}>{batch.status}</span></td><td><Link href={`/bank-reconciliation/print?batch_id=${batch.id}`} target="_blank">Open</Link></td></tr>) : <tr><td colSpan={7} className={styles.empty}>No statement batches for this account.</td></tr>}</tbody></table></div>
          </section>
        </div>
      ) : null}

      {tab === "cashbook" ? (
        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <div className={styles.sectionHeading}><div><h2>{cashbookForm.id ? "Edit Cash-Book Entry" : "Cash-Book Adjustment"}</h2><p>Record bank fees, interest, transfers or missing receipts and payments.</p></div></div>
            <div className={styles.formGrid}>
              <label><span>Entry date</span><input type="date" value={cashbookForm.entry_date} onChange={(event) => setCashbookForm((current) => ({ ...current, entry_date: event.target.value }))} /></label>
              <label><span>Value date</span><input type="date" value={cashbookForm.value_date} onChange={(event) => setCashbookForm((current) => ({ ...current, value_date: event.target.value }))} /></label>
              <label><span>Entry type</span><select value={cashbookForm.entry_type} onChange={(event) => setCashbookForm((current) => ({ ...current, entry_type: event.target.value }))}><option value="adjustment">Adjustment</option><option value="receipt">Receipt</option><option value="payment">Payment</option><option value="bank_fee">Bank Fee</option><option value="interest">Interest</option><option value="transfer">Transfer</option></select></label>
              <label><span>Signed amount</span><input type="number" step="0.01" value={cashbookForm.amount} onChange={(event) => setCashbookForm((current) => ({ ...current, amount: event.target.value }))} /><small>Receipt positive, payment negative.</small></label>
              <label><span>Reference</span><input value={cashbookForm.reference} onChange={(event) => setCashbookForm((current) => ({ ...current, reference: event.target.value }))} /></label>
              <label className={styles.fullField}><span>Description</span><input value={cashbookForm.description} onChange={(event) => setCashbookForm((current) => ({ ...current, description: event.target.value }))} /></label>
              <label className={styles.fullField}><span>Notes</span><textarea value={cashbookForm.notes} onChange={(event) => setCashbookForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            <div className={styles.formActions}><button type="button" className={styles.primaryButton} disabled={saving || !accountId} onClick={() => void saveCashbook()}>{cashbookForm.id ? "Update Entry" : "Add Entry"}</button>{cashbookForm.id ? <button type="button" className={styles.secondaryButton} onClick={() => setCashbookForm(cashbookEmpty(companyId, accountId))}>Cancel</button> : null}<button type="button" className={styles.secondaryButton} disabled={saving || !accountId} onClick={() => void post({ action: "sync_cashbook", company_id: companyId, bank_account_id: accountId }, "Posted finance payments imported into the cash book.")}>Import Posted Payments</button></div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}><div><h2>Cash-Book Summary</h2><p>All posted entries assigned to the selected account.</p></div></div>
            <div className={styles.bookSummary}><div><span>Opening Balance</span><strong>{money(selectedAccount?.currency || "SGD", number(selectedAccount?.opening_balance))}</strong></div><div><span>Posted Movement</span><strong>{money(selectedAccount?.currency || "SGD", summary.bookMovement)}</strong></div><div><span>Book Balance</span><strong>{money(selectedAccount?.currency || "SGD", number(selectedAccount?.opening_balance) + summary.bookMovement)}</strong></div></div>
          </section>

          <section className={`${styles.panel} ${styles.fullPanel}`}>
            <div className={styles.tableWrap}><table><thead><tr><th>Date / Entry</th><th>Type</th><th>Description</th><th>Reference</th><th>Source</th><th className={styles.numberCell}>Amount</th><th className={styles.numberCell}>Matched</th><th>Status</th><th>Action</th></tr></thead><tbody>{accountEntries.length ? accountEntries.map((entry) => <tr key={entry.id}><td><strong>{formatDate(entry.entry_date)}</strong><small>{entry.entry_no || "-"}</small></td><td>{entry.entry_type.replace("_", " ")}</td><td>{entry.description}</td><td>{entry.reference || "-"}</td><td>{entry.source_type?.replace("_", " ") || "manual"}</td><td className={`${styles.numberCell} ${number(entry.amount) >= 0 ? styles.inflow : styles.outflow}`}>{money(selectedAccount?.currency || "SGD", entry.amount)}</td><td className={styles.numberCell}>{money(selectedAccount?.currency || "SGD", entryMatched.get(entry.id) ?? 0)}</td><td><span className={`${styles.statusBadge} ${entry.status === "void" ? styles.void : ""}`}>{entry.status}</span></td><td className={styles.rowActions}>{entry.status === "posted" && !entry.source_type ? <button type="button" className={styles.smallButton} onClick={() => editCashbook(entry)}>Edit</button> : null}{entry.status === "posted" ? <button type="button" className={styles.smallDanger} onClick={() => { const reason = window.prompt("Reversal reason:"); if (reason) void post({ action: "void_cashbook", id: entry.id, reason }, "Cash-book entry reversed."); }}>Reverse</button> : null}</td></tr>) : <tr><td colSpan={9} className={styles.empty}>No cash-book entries for this account.</td></tr>}</tbody></table></div>
          </section>
        </div>
      ) : null}

      {tab === "accounts" ? (
        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <div className={styles.sectionHeading}><div><h2>{accountForm.id ? "Edit Bank Account" : "New Bank / Cash Account"}</h2><p>Use separate records for each bank account, PayNow wallet or cash account.</p></div></div>
            <div className={styles.formGrid}>
              <label><span>Account code</span><input value={accountForm.account_code} onChange={(event) => setAccountForm((current) => ({ ...current, account_code: event.target.value }))} placeholder="DBS-SGD" /></label>
              <label><span>Account name</span><input value={accountForm.account_name} onChange={(event) => setAccountForm((current) => ({ ...current, account_name: event.target.value }))} placeholder="DBS Current Account" /></label>
              <label><span>Bank name</span><input value={accountForm.bank_name} onChange={(event) => setAccountForm((current) => ({ ...current, bank_name: event.target.value }))} /></label>
              <label><span>Account number</span><input value={accountForm.account_no} onChange={(event) => setAccountForm((current) => ({ ...current, account_no: event.target.value }))} /></label>
              <label><span>Currency</span><input maxLength={3} value={accountForm.currency} onChange={(event) => setAccountForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} /></label>
              <label><span>Opening balance</span><input type="number" step="0.01" value={accountForm.opening_balance} onChange={(event) => setAccountForm((current) => ({ ...current, opening_balance: event.target.value }))} /></label>
              <label><span>Opening balance date</span><input type="date" value={accountForm.opening_balance_date} onChange={(event) => setAccountForm((current) => ({ ...current, opening_balance_date: event.target.value }))} /></label>
              <label className={styles.checkboxField}><input type="checkbox" checked={accountForm.is_active} onChange={(event) => setAccountForm((current) => ({ ...current, is_active: event.target.checked }))} /><span>Active account</span></label>
              <label className={styles.fullField}><span>Notes</span><textarea value={accountForm.notes} onChange={(event) => setAccountForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            <div className={styles.formActions}><button type="button" className={styles.primaryButton} disabled={saving} onClick={() => void saveAccount()}>{accountForm.id ? "Update Account" : "Create Account"}</button>{accountForm.id ? <button type="button" className={styles.secondaryButton} onClick={() => setAccountForm(accountEmpty(companyId))}>Cancel</button> : null}</div>
          </section>

          <section className={styles.panel}>
            <div className={styles.sectionHeading}><div><h2>Company Accounts</h2><p>{companyAccounts.length} account(s) configured.</p></div></div>
            <div className={styles.accountList}>{companyAccounts.length ? companyAccounts.map((account) => <button type="button" key={account.id} className={account.id === accountId ? styles.selectedAccount : ""} onClick={() => { setAccountId(account.id); editAccount(account); }}><span><strong>{account.account_name}</strong><small>{account.bank_name || "Cash account"} · {account.account_no || account.account_code || "No account number"}</small></span><span><strong>{account.currency}</strong><small>{account.is_active ? "Active" : "Inactive"}</small></span></button>) : <div className={styles.empty}>No bank accounts for this company.</div>}</div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
