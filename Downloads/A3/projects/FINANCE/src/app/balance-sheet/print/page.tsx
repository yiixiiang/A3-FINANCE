"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import styles from "./report.module.css";

type Group = "current_asset" | "non_current_asset" | "current_liability" | "non_current_liability" | "equity";
type Row = { id: number; account_code: string; account_name: string; account_group: Group; balance: number; comparison_balance?: number; movement?: number; is_contra: boolean };
type Summary = { current_assets: number; non_current_assets: number; total_assets: number; current_liabilities: number; non_current_liabilities: number; total_liabilities: number; total_equity: number; liabilities_and_equity: number; variance: number; working_capital: number; current_ratio: number | null };
type Report = {
  company: { name: string; base_currency?: string | null; address?: string | null; company_address?: string | null; uen?: string | null; gst_no?: string | null; logo_path?: string | null };
  as_of_date: string;
  comparison_as_of_date?: string;
  rows: Row[];
  summary: Summary;
  comparison_summary?: Summary;
  warnings: string[];
};

const labels: Record<Group, string> = { current_asset: "Current Assets", non_current_asset: "Non-Current Assets", current_liability: "Current Liabilities", non_current_liability: "Non-Current Liabilities", equity: "Equity" };
const order: Group[] = ["current_asset", "non_current_asset", "current_liability", "non_current_liability", "equity"];

function money(currency: string, amount: number) {
  const absolute = Math.abs(Number(amount || 0));
  const text = absolute.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Number(amount || 0) < 0 ? `(${currency} ${text})` : `${currency} ${text}`;
}

function BalanceSheetPrintContent() {
  const searchParams = useSearchParams();
  const [report, setReport] = useState<Report | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({
      company_id: searchParams.get("company_id") ?? "",
      as_of: searchParams.get("as_of") ?? "",
      comparison_as_of: searchParams.get("comparison_as_of") ?? "",
    });
    async function load() {
      try {
        const response = await fetch(`/api/admin/balance-sheet?${params}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to prepare the Balance Sheet.");
        setReport(payload.report);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to prepare the Balance Sheet.");
      }
    }
    void load();
  }, [searchParams]);

  if (errorMessage) return <main className={styles.message}>{errorMessage}</main>;
  if (!report) return <main className={styles.message}>Preparing Balance Sheet...</main>;
  const currency = report.company.base_currency || "SGD";
  const address = report.company.company_address || report.company.address;

  return (
    <main className={styles.document}>
      <div className={styles.actions}><button type="button" onClick={() => window.print()}>Print / Save PDF</button></div>
      <section className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.companyBlock}>
            {report.company.logo_path ? <img src={report.company.logo_path} alt={`${report.company.name} logo`} /> : <div className={styles.logoFallback}>A3</div>}
            <div><h1>{report.company.name}</h1>{address ? <p>{address}</p> : null}<div className={styles.registration}>{report.company.uen ? <span>UEN: {report.company.uen}</span> : null}{report.company.gst_no ? <span>GST Reg. No.: {report.company.gst_no}</span> : null}</div></div>
          </div>
          <div className={styles.titleBlock}><p>STATEMENT OF FINANCIAL POSITION</p><h2>BALANCE SHEET</h2><strong>As at {formatDate(report.as_of_date)}</strong>{report.comparison_as_of_date ? <span>Comparison: {formatDate(report.comparison_as_of_date)}</span> : null}</div>
        </header>

        <section className={styles.metrics}>
          <article><span>Total Assets</span><strong>{money(currency, report.summary.total_assets)}</strong></article>
          <article><span>Total Liabilities</span><strong>{money(currency, report.summary.total_liabilities)}</strong></article>
          <article><span>Total Equity</span><strong>{money(currency, report.summary.total_equity)}</strong></article>
          <article className={Math.abs(report.summary.variance) <= .01 ? styles.good : styles.bad}><span>Balance Check</span><strong>{money(currency, report.summary.variance)}</strong><small>{Math.abs(report.summary.variance) <= .01 ? "Balanced" : "Review required"}</small></article>
        </section>

        <table className={styles.statement}>
          <thead><tr><th>Account</th><th>Current</th>{report.comparison_as_of_date ? <th>Comparison</th> : null}{report.comparison_as_of_date ? <th>Movement</th> : null}</tr></thead>
          <tbody>
            {order.map((group) => {
              const rows = report.rows.filter((row) => row.account_group === group && (row.balance !== 0 || Number(row.comparison_balance || 0) !== 0));
              const current = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
              const comparison = rows.reduce((sum, row) => sum + Number(row.comparison_balance || 0), 0);
              return [
                <tr className={styles.group} key={`${group}-heading`}><td colSpan={report.comparison_as_of_date ? 4 : 2}>{labels[group]}</td></tr>,
                ...rows.map((row) => <tr key={row.id}><td><strong>{row.account_code}</strong> {row.account_name}{row.is_contra ? <small>Contra</small> : null}</td><td>{money(currency, row.balance)}</td>{report.comparison_as_of_date ? <td>{money(currency, Number(row.comparison_balance || 0))}</td> : null}{report.comparison_as_of_date ? <td>{money(currency, Number(row.movement || 0))}</td> : null}</tr>),
                <tr className={styles.subtotal} key={`${group}-total`}><td>Total {labels[group]}</td><td>{money(currency, current)}</td>{report.comparison_as_of_date ? <td>{money(currency, comparison)}</td> : null}{report.comparison_as_of_date ? <td>{money(currency, current - comparison)}</td> : null}</tr>,
              ];
            })}
            <tr className={styles.net}><td>Total Assets</td><td>{money(currency, report.summary.total_assets)}</td>{report.comparison_as_of_date ? <td>{money(currency, report.comparison_summary?.total_assets ?? 0)}</td> : null}{report.comparison_as_of_date ? <td>{money(currency, report.summary.total_assets - (report.comparison_summary?.total_assets ?? 0))}</td> : null}</tr>
            <tr className={styles.net}><td>Total Liabilities and Equity</td><td>{money(currency, report.summary.liabilities_and_equity)}</td>{report.comparison_as_of_date ? <td>{money(currency, report.comparison_summary?.liabilities_and_equity ?? 0)}</td> : null}{report.comparison_as_of_date ? <td>{money(currency, report.summary.liabilities_and_equity - (report.comparison_summary?.liabilities_and_equity ?? 0))}</td> : null}</tr>
          </tbody>
        </table>

        <section className={styles.notes}><article><span>Working Capital</span><strong>{money(currency, report.summary.working_capital)}</strong></article><article><span>Current Ratio</span><strong>{report.summary.current_ratio === null ? "N/A" : `${report.summary.current_ratio.toFixed(2)}×`}</strong></article><article><span>Report Status</span><strong>{Math.abs(report.summary.variance) <= .01 ? "Balanced" : "Review Required"}</strong></article></section>
        {report.warnings.length > 0 ? <div className={styles.warning}>{report.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
        <footer className={styles.footer}><span>Generated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}</span><span>Internal management report</span></footer>
      </section>
    </main>
  );
}

export default function BalanceSheetPrintPage() {
  return <Suspense fallback={<main className={styles.message}>Preparing Balance Sheet...</main>}><BalanceSheetPrintContent /></Suspense>;
}
