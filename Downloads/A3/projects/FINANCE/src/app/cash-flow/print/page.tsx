"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import styles from "./report.module.css";

type Activity = "operating" | "investing" | "financing";
type Summary = { opening_cash: number; operating_cash: number; investing_cash: number; financing_cash: number; net_cash_change: number; excluded_cash_movements: number; closing_cash: number; calculated_closing_cash: number; reconciliation_difference: number };
type Report = {
  company: { name: string; base_currency?: string | null; address?: string | null; company_address?: string | null; uen?: string | null; gst_no?: string | null; logo_path?: string | null };
  period: { from: string; to: string };
  comparison_period: { from: string; to: string };
  lines: Array<{ activity: Activity; line_name: string; current: number; comparison: number }>;
  summary: Summary;
  comparison_summary: Summary;
  warnings: string[];
};

const labels: Record<Activity, string> = { operating: "Cash Flows from Operating Activities", investing: "Cash Flows from Investing Activities", financing: "Cash Flows from Financing Activities" };
const order: Activity[] = ["operating", "investing", "financing"];

function money(currency: string, amount: number) {
  const absolute = Math.abs(Number(amount || 0));
  const formatted = absolute.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Number(amount || 0) < 0 ? `(${currency} ${formatted})` : `${currency} ${formatted}`;
}

function CashFlowPrintContent() {
  const searchParams = useSearchParams();
  const [report, setReport] = useState<Report | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams({
      company_id: searchParams.get("company_id") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
      comparison_from: searchParams.get("comparison_from") ?? "",
      comparison_to: searchParams.get("comparison_to") ?? "",
    });
    async function load() {
      try {
        const response = await fetch(`/api/admin/cash-flow?${params}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to prepare the Cash Flow Statement.");
        setReport(payload.report);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to prepare the Cash Flow Statement.");
      }
    }
    void load();
  }, [searchParams]);

  if (errorMessage) return <main className={styles.message}>{errorMessage}</main>;
  if (!report) return <main className={styles.message}>Preparing Cash Flow Statement...</main>;
  const currency = report.company.base_currency || "SGD";
  const address = report.company.company_address || report.company.address;

  return (
    <main className={styles.document}>
      <div className={styles.actions}><button type="button" onClick={() => window.print()}>Print / Save PDF</button></div>
      <section className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.companyBlock}>{report.company.logo_path ? <img src={report.company.logo_path} alt={`${report.company.name} logo`} /> : <div className={styles.logoFallback}>A3</div>}<div><h1>{report.company.name}</h1>{address ? <p>{address}</p> : null}<div className={styles.registration}>{report.company.uen ? <span>UEN: {report.company.uen}</span> : null}{report.company.gst_no ? <span>GST Reg. No.: {report.company.gst_no}</span> : null}</div></div></div>
          <div className={styles.titleBlock}><p>MANAGEMENT ACCOUNTS</p><h2>CASH FLOW STATEMENT</h2><strong>{formatDate(report.period.from)} – {formatDate(report.period.to)}</strong><span>Comparison: {formatDate(report.comparison_period.from)} – {formatDate(report.comparison_period.to)}</span></div>
        </header>

        <section className={styles.metrics}>
          <article><span>Opening Cash</span><strong>{money(currency, report.summary.opening_cash)}</strong></article>
          <article><span>Operating Cash</span><strong>{money(currency, report.summary.operating_cash)}</strong></article>
          <article><span>Net Cash Change</span><strong>{money(currency, report.summary.net_cash_change)}</strong></article>
          <article className={Math.abs(report.summary.reconciliation_difference) <= .01 ? styles.good : styles.bad}><span>Closing Cash</span><strong>{money(currency, report.summary.closing_cash)}</strong><small>Difference {money(currency, report.summary.reconciliation_difference)}</small></article>
        </section>

        <table className={styles.statement}>
          <thead><tr><th>Cash Flow Line</th><th>Current Period</th><th>Comparison</th><th>Variance</th></tr></thead>
          <tbody>
            {order.map((activity) => {
              const lines = report.lines.filter((line) => line.activity === activity);
              const current = lines.reduce((sum, line) => sum + Number(line.current || 0), 0);
              const comparison = lines.reduce((sum, line) => sum + Number(line.comparison || 0), 0);
              return [
                <tr className={styles.group} key={`${activity}-heading`}><td colSpan={4}>{labels[activity]}</td></tr>,
                ...lines.map((line) => <tr key={`${activity}-${line.line_name}`}><td>{line.line_name}</td><td>{money(currency, line.current)}</td><td>{money(currency, line.comparison)}</td><td>{money(currency, line.current - line.comparison)}</td></tr>),
                <tr className={styles.subtotal} key={`${activity}-total`}><td>Net {labels[activity]}</td><td>{money(currency, current)}</td><td>{money(currency, comparison)}</td><td>{money(currency, current - comparison)}</td></tr>,
              ];
            })}
            <tr className={styles.net}><td>Net Increase / (Decrease) in Cash</td><td>{money(currency, report.summary.net_cash_change)}</td><td>{money(currency, report.comparison_summary.net_cash_change)}</td><td>{money(currency, report.summary.net_cash_change - report.comparison_summary.net_cash_change)}</td></tr>
            <tr><td>Cash and Cash Equivalents at Beginning of Period</td><td>{money(currency, report.summary.opening_cash)}</td><td>{money(currency, report.comparison_summary.opening_cash)}</td><td>{money(currency, report.summary.opening_cash - report.comparison_summary.opening_cash)}</td></tr>
            <tr className={styles.net}><td>Cash and Cash Equivalents at End of Period</td><td>{money(currency, report.summary.closing_cash)}</td><td>{money(currency, report.comparison_summary.closing_cash)}</td><td>{money(currency, report.summary.closing_cash - report.comparison_summary.closing_cash)}</td></tr>
          </tbody>
        </table>

        <section className={styles.notes}><article><span>Excluded Transfers</span><strong>{money(currency, report.summary.excluded_cash_movements)}</strong></article><article><span>Calculated Closing Cash</span><strong>{money(currency, report.summary.calculated_closing_cash)}</strong></article><article><span>Reconciliation</span><strong>{Math.abs(report.summary.reconciliation_difference) <= .01 ? "Reconciled" : "Review Required"}</strong></article></section>
        {report.warnings.length > 0 ? <div className={styles.warning}>{report.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}
        <footer className={styles.footer}><span>Generated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}</span><span>Internal management report</span></footer>
      </section>
    </main>
  );
}

export default function CashFlowPrintPage() {
  return <Suspense fallback={<main className={styles.message}>Preparing Cash Flow Statement...</main>}><CashFlowPrintContent /></Suspense>;
}
