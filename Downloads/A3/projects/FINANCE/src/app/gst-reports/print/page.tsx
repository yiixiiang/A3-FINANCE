"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./gst-report.module.css";

type Period = {
  id: number;
  period_no?: string | null;
  period_label: string;
  period_from: string;
  period_to: string;
  due_date?: string | null;
  status: string;
  box1_standard_rated_supplies: number;
  box2_zero_rated_supplies: number;
  box3_exempt_supplies: number;
  box4_total_supplies: number;
  box5_taxable_purchases: number;
  box6_output_tax: number;
  box7_input_tax: number;
  box8_net_gst: number;
  source_snapshot_at?: string | null;
  filed_reference?: string | null;
  filed_at?: string | null;
  notes?: string | null;
  companies?: {
    name?: string | null;
    uen?: string | null;
    gst_no?: string | null;
    base_currency?: string | null;
    company_address?: string | null;
    address?: string | null;
    logo_path?: string | null;
  } | null;
};

type Entry = {
  id: number;
  source_type: string;
  source_no?: string | null;
  source_date: string;
  counterparty?: string | null;
  direction: string;
  treatment: string;
  taxable_amount: number;
  gst_amount: number;
  recoverable_gst_amount: number;
  box_no?: number | null;
};

function money(currency: string, amount: number) {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function GstReportPrintContent() {
  const searchParams = useSearchParams();
  const periodId = Number(searchParams.get("period_id") || 0);
  const [period, setPeriod] = useState<Period | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function load() {
      if (!periodId) {
        setErrorMessage("GST filing period is required.");
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`/api/admin/gst?period_id=${periodId}`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load GST report.");
        setPeriod(payload.period);
        setEntries(payload.entries ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load GST report.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [periodId]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const entry of entries) {
      const key = entry.box_no ? `Box ${entry.box_no}` : "Excluded / Supporting";
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    return [...groups.entries()];
  }, [entries]);

  if (loading) return <main className={styles.loading}>Loading GST report...</main>;
  if (!period) return <main className={styles.loading}>{errorMessage || "GST report not found."}</main>;

  const company = period.companies;
  const currency = company?.base_currency || "SGD";

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <Link href="/gst-reports">← GST Reports</Link>
        <button type="button" onClick={() => window.print()}>Print A4 Landscape</button>
      </div>

      <article className={styles.report}>
        <header className={styles.header}>
          <div className={styles.companyBlock}>
            {company?.logo_path ? <img src={company.logo_path} alt={`${company.name || "Company"} logo`} /> : null}
            <div>
              <h1>{company?.name || "Company"}</h1>
              <p>{company?.company_address || company?.address || ""}</p>
              <p>{company?.uen ? `UEN: ${company.uen}` : ""}{company?.gst_no ? ` · GST Reg. No.: ${company.gst_no}` : ""}</p>
            </div>
          </div>
          <div className={styles.documentBlock}>
            <p>GST CONTROL REPORT</p>
            <h2>{period.period_label}</h2>
            <strong>{period.period_no || `Period ${period.id}`}</strong>
            <span>{formatDate(period.period_from)} – {formatDate(period.period_to)}</span>
            <em>{period.status.toUpperCase()}</em>
          </div>
        </header>

        <section className={styles.metaGrid}>
          <div><span>Filing due date</span><strong>{formatDate(period.due_date)}</strong></div>
          <div><span>Source snapshot</span><strong>{period.source_snapshot_at ? new Date(period.source_snapshot_at).toLocaleString("en-SG") : "Not refreshed"}</strong></div>
          <div><span>Filing reference</span><strong>{period.filed_reference || "–"}</strong></div>
          <div><span>Filed date</span><strong>{period.filed_at ? new Date(period.filed_at).toLocaleString("en-SG") : "–"}</strong></div>
        </section>

        <section className={styles.summaryGrid}>
          {[
            ["Box 1", "Standard-Rated Supplies", period.box1_standard_rated_supplies],
            ["Box 2", "Zero-Rated Supplies", period.box2_zero_rated_supplies],
            ["Box 3", "Exempt Supplies", period.box3_exempt_supplies],
            ["Box 4", "Total Supplies", period.box4_total_supplies],
            ["Box 5", "Taxable Purchases", period.box5_taxable_purchases],
            ["Box 6", "Output Tax", period.box6_output_tax],
            ["Box 7", "Recoverable Input Tax", period.box7_input_tax],
            ["Box 8", period.box8_net_gst >= 0 ? "Net GST Payable" : "GST Refund", period.box8_net_gst],
          ].map(([box, title, amount]) => (
            <div key={String(box)} className={String(box) === "Box 8" ? styles.net : ""}>
              <span>{String(box)}</span>
              <small>{String(title)}</small>
              <strong>{money(currency, Number(amount))}</strong>
            </div>
          ))}
        </section>

        <section className={styles.auditSection}>
          <div className={styles.sectionHeading}>
            <h3>GST Audit Drill-Down</h3>
            <span>{entries.length} source entries</span>
          </div>
          {grouped.map(([group, rows]) => (
            <div key={group} className={styles.group}>
              <h4>{group}</h4>
              <table className={styles.table}>
                <thead><tr><th>Date</th><th>Source</th><th>Counterparty</th><th>Direction</th><th>Treatment</th><th>Taxable Amount</th><th>GST Amount</th><th>Recoverable GST</th></tr></thead>
                <tbody>{rows.map((entry) => <tr key={entry.id}><td>{formatDate(entry.source_date)}</td><td>{entry.source_no || entry.source_type}</td><td>{entry.counterparty || "–"}</td><td>{label(entry.direction)}</td><td>{label(entry.treatment)}</td><td>{money(currency, entry.taxable_amount)}</td><td>{money(currency, entry.gst_amount)}</td><td>{money(currency, entry.recoverable_gst_amount)}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
          {!entries.length ? <p className={styles.empty}>No period source entries. Refresh the GST period before printing.</p> : null}
        </section>

        <footer className={styles.footer}>
          <div><span>Prepared by</span><strong>____________________________</strong></div>
          <div><span>Reviewed by</span><strong>____________________________</strong></div>
          <div><span>Approved / Filed by</span><strong>____________________________</strong></div>
          <p>This report is generated from A3 Finance GST source snapshots. Review all tax classifications and supporting documents before filing.</p>
        </footer>
      </article>
    </main>
  );
}

export default function GstReportPrintPage() {
  return (
    <Suspense
      fallback={<main className={styles.loading}>Preparing GST report...</main>}
    >
      <GstReportPrintContent />
    </Suspense>
  );
}
