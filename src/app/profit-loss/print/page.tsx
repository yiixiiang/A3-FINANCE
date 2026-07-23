"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import styles from "./report.module.css";

type Group = "revenue" | "cost_of_sales" | "operating_expense" | "other_income" | "other_expense";
type Row = {
  id: number;
  account_code: string;
  account_name: string;
  account_group: Group;
  current: number;
  comparison: number;
  variance: number;
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
type Report = {
  company: {
    name: string;
    base_currency?: string | null;
    address?: string | null;
    company_address?: string | null;
    uen?: string | null;
    gst_no?: string | null;
    logo_path?: string | null;
  };
  period: { from: string; to: string };
  comparison_period: { from: string; to: string };
  rows: Row[];
  current: Summary;
  comparison: Summary;
  budget: Summary;
};

function money(currency: string, amount: number) {
  return `${currency} ${Number(amount || 0).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function groupLabel(group: string) {
  return group.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ProfitLossPrintContent() {
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
        const response = await fetch(`/api/admin/profit-loss?${params}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to prepare the Profit & Loss report.");
        setReport(payload.report);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to prepare the Profit & Loss report.");
      }
    }
    void load();
  }, [searchParams]);

  if (errorMessage) return <main className={styles.message}>{errorMessage}</main>;
  if (!report) return <main className={styles.message}>Preparing Profit &amp; Loss report...</main>;

  const currency = report.company.base_currency || "SGD";
  const address = report.company.company_address || report.company.address;

  return (
    <main className={styles.document}>
      <div className={styles.actions}><button type="button" onClick={() => window.print()}>Print / Save PDF</button></div>
      <section className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.companyBlock}>
            {report.company.logo_path ? <img src={report.company.logo_path} alt={`${report.company.name} logo`} /> : <div className={styles.logoFallback}>A3</div>}
            <div>
              <h1>{report.company.name}</h1>
              {address ? <p>{address}</p> : null}
              <div className={styles.registration}>{report.company.uen ? <span>UEN: {report.company.uen}</span> : null}{report.company.gst_no ? <span>GST Reg. No.: {report.company.gst_no}</span> : null}</div>
            </div>
          </div>
          <div className={styles.titleBlock}><p>MANAGEMENT ACCOUNTS</p><h2>PROFIT &amp; LOSS</h2><strong>{formatDate(report.period.from)} – {formatDate(report.period.to)}</strong><span>Comparison: {formatDate(report.comparison_period.from)} – {formatDate(report.comparison_period.to)}</span></div>
        </header>

        <section className={styles.metrics}>
          <article><span>Revenue</span><strong>{money(currency, report.current.revenue)}</strong></article>
          <article><span>Gross Profit</span><strong>{money(currency, report.current.gross_profit)}</strong><small>{report.current.gross_margin_percentage.toFixed(1)}% margin</small></article>
          <article><span>Operating Profit</span><strong>{money(currency, report.current.operating_profit)}</strong></article>
          <article><span>Net Profit / (Loss)</span><strong>{money(currency, report.current.net_profit)}</strong><small>{report.current.net_margin_percentage.toFixed(1)}% margin</small></article>
        </section>

        <table className={styles.statement}>
          <thead><tr><th>Account</th><th>Current</th><th>Comparison</th><th>Variance</th><th>Budget</th><th>Budget Variance</th></tr></thead>
          <tbody>
            {(["revenue", "cost_of_sales", "operating_expense", "other_income", "other_expense"] as Group[]).map((group) => {
              const rows = report.rows.filter((row) => row.account_group === group && (row.current !== 0 || row.comparison !== 0 || row.budget !== 0));
              const current = rows.reduce((sum, row) => sum + Number(row.current || 0), 0);
              const comparison = rows.reduce((sum, row) => sum + Number(row.comparison || 0), 0);
              const budget = rows.reduce((sum, row) => sum + Number(row.budget || 0), 0);
              return [
                <tr className={styles.group} key={`${group}-heading`}><td colSpan={6}>{groupLabel(group)}</td></tr>,
                ...rows.map((row) => <tr key={row.id}><td><strong>{row.account_code}</strong> {row.account_name}</td><td>{money(currency, row.current)}</td><td>{money(currency, row.comparison)}</td><td>{money(currency, row.variance)}</td><td>{money(currency, row.budget)}</td><td>{money(currency, row.budget_variance)}</td></tr>),
                <tr className={styles.subtotal} key={`${group}-total`}><td>Total {groupLabel(group)}</td><td>{money(currency, current)}</td><td>{money(currency, comparison)}</td><td>{money(currency, current - comparison)}</td><td>{money(currency, budget)}</td><td>{money(currency, group === "revenue" || group === "other_income" ? current - budget : budget - current)}</td></tr>,
              ];
            })}
            <tr className={styles.net}><td>Net Profit / (Loss)</td><td>{money(currency, report.current.net_profit)}</td><td>{money(currency, report.comparison.net_profit)}</td><td>{money(currency, report.current.net_profit - report.comparison.net_profit)}</td><td>{money(currency, report.budget.net_profit)}</td><td>{money(currency, report.current.net_profit - report.budget.net_profit)}</td></tr>
          </tbody>
        </table>

        <footer className={styles.footer}><span>Generated {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}</span><span>Internal management report</span></footer>
      </section>
    </main>
  );
}

export default function ProfitLossPrintPage() {
  return <Suspense fallback={<main className={styles.message}>Preparing Profit &amp; Loss report...</main>}><ProfitLossPrintContent /></Suspense>;
}
