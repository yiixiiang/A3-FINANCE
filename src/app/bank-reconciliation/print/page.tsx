"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import styles from "./report.module.css";

type Company = {
  name: string;
  company_address?: string | null;
  address?: string | null;
  uen?: string | null;
  gst_no?: string | null;
  company_phone?: string | null;
  phone?: string | null;
  company_email?: string | null;
  email?: string | null;
};

type Account = {
  account_name: string;
  bank_name?: string | null;
  account_no?: string | null;
  account_code?: string | null;
  currency: string;
  opening_balance: number;
  opening_balance_date?: string | null;
};

type Batch = {
  id: number;
  batch_no?: string | null;
  company_id: number;
  bank_account_id: number;
  statement_reference?: string | null;
  period_from: string;
  period_to: string;
  opening_balance: number;
  closing_balance: number;
  status: string;
  reconciled_at?: string | null;
  notes?: string | null;
  companies?: Company | null;
  bank_accounts?: Account | null;
};

type Line = {
  id: number;
  sequence_no: number;
  transaction_date: string;
  description: string;
  reference?: string | null;
  amount: number;
  running_balance?: number | null;
  match_status: string;
  ignored_reason?: string | null;
};

type Entry = {
  id: number;
  entry_no?: string | null;
  entry_date: string;
  reference?: string | null;
  description: string;
  amount: number;
  status: string;
};

type Match = {
  id: number;
  statement_line_id: number;
  cashbook_entry_id: number;
  matched_amount: number;
};

function money(currency: string, amount: number) {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function ReportContent() {
  const params = useSearchParams();
  const batchId = Number(params.get("batch_id"));
  const [batch, setBatch] = useState<Batch | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (!Number.isInteger(batchId) || batchId <= 0) {
          throw new Error("A valid reconciliation batch is required.");
        }
        const response = await fetch(`/api/admin/bank-reconciliation?batch_id=${batchId}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          batch?: Batch;
          lines?: Line[];
          entries?: Entry[];
          matches?: Match[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Unable to load reconciliation report.");
        setBatch(payload.batch ?? null);
        setLines(payload.lines ?? []);
        setEntries(payload.entries ?? []);
        setMatches(payload.matches ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load reconciliation report.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [batchId]);

  const summary = useMemo(() => {
    const statementMovement = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const calculatedClosing = Number(batch?.opening_balance || 0) + statementMovement;
    const matchedAmount = matches.reduce((sum, match) => sum + Number(match.matched_amount || 0), 0);
    const unmatched = lines.filter((line) => !["matched", "ignored"].includes(line.match_status)).length;
    const account = batch?.bank_accounts;
    const openingDate = account?.opening_balance_date || "0000-01-01";
    const bookMovement = entries
      .filter(
        (entry) =>
          entry.status === "posted" &&
          (!batch ||
            (entry.entry_date >= batch.period_from && entry.entry_date <= batch.period_to)),
      )
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const bookOpening = Number(account?.opening_balance || 0) + entries
      .filter(
        (entry) =>
          entry.status === "posted" &&
          Boolean(batch) &&
          entry.entry_date >= openingDate &&
          entry.entry_date < (batch?.period_from || ""),
      )
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return {
      statementMovement,
      calculatedClosing,
      matchedAmount,
      unmatched,
      bookMovement,
      bookOpening,
      bookClosing: bookOpening + bookMovement,
      statementDifference: Number(batch?.closing_balance || 0) - calculatedClosing,
      bookDifference: Number(batch?.closing_balance || 0) - (bookOpening + bookMovement),
    };
  }, [batch, entries, lines, matches]);


  const outstandingEntries = useMemo(() => {
    if (!batch) return [] as Array<Entry & { remaining_amount: number }>;
    const used = new Map<number, number>();
    for (const match of matches) {
      used.set(
        match.cashbook_entry_id,
        (used.get(match.cashbook_entry_id) ?? 0) + Number(match.matched_amount || 0),
      );
    }
    return entries.flatMap((entry) => {
      if (entry.status !== "posted" || entry.entry_date > batch.period_to) return [];
      const remaining = Math.max(
        0,
        Math.abs(Number(entry.amount || 0)) - (used.get(entry.id) ?? 0),
      );
      if (remaining <= 0.005) return [];
      return [
        {
          ...entry,
          remaining_amount: Math.sign(Number(entry.amount || 0)) * remaining,
        },
      ];
    });
  }, [batch, entries, matches]);

  const matchDetails = useMemo(() => {
    const result = new Map<number, Array<{ match: Match; entry?: Entry }>>();
    for (const match of matches) {
      const items = result.get(match.statement_line_id) ?? [];
      items.push({ match, entry: entries.find((entry) => entry.id === match.cashbook_entry_id) });
      result.set(match.statement_line_id, items);
    }
    return result;
  }, [entries, matches]);

  if (loading) return <main className={styles.loading}>Loading reconciliation report...</main>;
  if (errorMessage || !batch) return <main className={styles.loading}>{errorMessage || "Report not found."}</main>;

  const company = batch.companies;
  const account = batch.bank_accounts;
  const currency = account?.currency || "SGD";

  return (
    <main className={styles.page}>
      <div className={`${styles.toolbar} print-hidden`}>
        <button type="button" onClick={() => window.close()}>Close</button>
        <button type="button" className={styles.primary} onClick={() => window.print()}>Print A4 Report</button>
      </div>

      <article className={styles.report}>
        <header className={styles.header}>
          <div>
            <p className={styles.brand}>A3 MANAGEMENT FINANCE</p>
            <h1>{company?.name || "Company"}</h1>
            <p>{company?.company_address || company?.address || ""}</p>
            <div className={styles.metaLine}>
              {company?.uen ? <span>UEN: {company.uen}</span> : null}
              {company?.gst_no ? <span>GST Reg. No.: {company.gst_no}</span> : null}
            </div>
            <div className={styles.metaLine}>
              {company?.company_phone || company?.phone ? <span>Tel: {company.company_phone || company.phone}</span> : null}
              {company?.company_email || company?.email ? <span>Email: {company.company_email || company.email}</span> : null}
            </div>
          </div>
          <div className={styles.documentTitle}>
            <h2>BANK RECONCILIATION</h2>
            <strong>{batch.batch_no || `BANK-${batch.id}`}</strong>
            <span className={batch.status === "reconciled" ? styles.completed : styles.draft}>{batch.status}</span>
          </div>
        </header>

        <section className={styles.detailsGrid}>
          <div><span>Bank / Account</span><strong>{account?.bank_name || "Bank"} · {account?.account_name || "Account"}</strong></div>
          <div><span>Account Number</span><strong>{account?.account_no || account?.account_code || "-"}</strong></div>
          <div><span>Currency</span><strong>{currency}</strong></div>
          <div><span>Statement Period</span><strong>{formatDate(batch.period_from)} – {formatDate(batch.period_to)}</strong></div>
          <div><span>Statement Reference</span><strong>{batch.statement_reference || "-"}</strong></div>
          <div><span>Reconciled</span><strong>{batch.reconciled_at ? formatDate(batch.reconciled_at) : "Not completed"}</strong></div>
        </section>

        <section className={styles.summaryGrid}>
          <article><span>Statement Opening</span><strong>{money(currency, batch.opening_balance)}</strong></article>
          <article><span>Statement Movement</span><strong>{money(currency, summary.statementMovement)}</strong></article>
          <article><span>Statement Closing</span><strong>{money(currency, batch.closing_balance)}</strong></article>
          <article><span>Calculated Closing</span><strong>{money(currency, summary.calculatedClosing)}</strong></article>
          <article><span>Matched Amount</span><strong>{money(currency, summary.matchedAmount)}</strong></article>
          <article><span>Unresolved Lines</span><strong>{summary.unmatched}</strong></article>
        </section>

        <section className={styles.bookSection}>
          <h3>Cash-Book Position</h3>
          <div className={styles.bookGrid}>
            <div><span>Book opening for period</span><strong>{money(currency, summary.bookOpening)}</strong></div>
            <div><span>Posted movement for period</span><strong>{money(currency, summary.bookMovement)}</strong></div>
            <div><span>Book closing for period</span><strong>{money(currency, summary.bookClosing)}</strong></div>
            <div><span>Statement to book difference</span><strong>{money(currency, summary.bookDifference)}</strong></div>
          </div>
        </section>

        <section className={styles.linesSection}>
          <h3>Statement Transaction Reconciliation</h3>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>No.</th><th>Date</th><th>Statement Description</th><th>Reference</th><th className={styles.number}>Amount</th><th>Status</th><th>Cash-Book Match</th><th className={styles.number}>Matched</th></tr></thead>
              <tbody>
                {lines.map((line) => {
                  const details = matchDetails.get(line.id) ?? [];
                  const total = details.reduce((sum, item) => sum + Number(item.match.matched_amount || 0), 0);
                  return (
                    <tr key={line.id}>
                      <td>{line.sequence_no}</td>
                      <td>{formatDate(line.transaction_date)}</td>
                      <td>{line.description}{line.ignored_reason ? <small>Ignored: {line.ignored_reason}</small> : null}</td>
                      <td>{line.reference || "-"}</td>
                      <td className={styles.number}>{money(currency, line.amount)}</td>
                      <td><span className={`${styles.status} ${styles[line.match_status]}`}>{line.match_status}</span></td>
                      <td>{details.length ? details.map(({ match, entry }) => <small key={match.id}>{entry?.entry_no || "Cash book"} · {formatDate(entry?.entry_date)} · {entry?.description || "Entry"}</small>) : "-"}</td>
                      <td className={styles.number}>{money(currency, total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>


        <section className={styles.outstandingSection}>
          <h3>Outstanding Cash-Book Items</h3>
          <p>Posted cash-book amounts not yet cleared by this or an earlier bank statement.</p>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Date</th><th>Entry</th><th>Description</th><th>Reference</th><th className={styles.number}>Original Amount</th><th className={styles.number}>Outstanding</th></tr></thead>
              <tbody>
                {outstandingEntries.length ? outstandingEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDate(entry.entry_date)}</td>
                    <td>{entry.entry_no || `CB-${entry.id}`}</td>
                    <td>{entry.description}</td>
                    <td>{entry.reference || "-"}</td>
                    <td className={styles.number}>{money(currency, entry.amount)}</td>
                    <td className={styles.number}>{money(currency, entry.remaining_amount)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className={styles.empty}>No outstanding cash-book items through the statement end date.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {batch.notes ? <section className={styles.notes}><h3>Notes</h3><p>{batch.notes}</p></section> : null}

        <section className={styles.certification}>
          <strong>Reconciliation Certification</strong>
          <p>The statement transactions above were compared with the cash book. Matched and ignored items are supported by the recorded allocation audit trail.</p>
        </section>

        <footer className={styles.footer}>
          <div><span>Prepared By</span><strong>____________________________</strong><small>Date: ____________________</small></div>
          <div><span>Reviewed By</span><strong>____________________________</strong><small>Date: ____________________</small></div>
          <div><span>Approved By</span><strong>____________________________</strong><small>Date: ____________________</small></div>
        </footer>
      </article>
    </main>
  );
}

export default function BankReconciliationPrintPage() {
  return (
    <Suspense fallback={<main className={styles.loading}>Loading reconciliation report...</main>}>
      <ReportContent />
    </Suspense>
  );
}
