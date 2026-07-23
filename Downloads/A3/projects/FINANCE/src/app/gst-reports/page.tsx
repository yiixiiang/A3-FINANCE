"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./gst-reports.module.css";

type Company = {
  id: number;
  name: string;
  status: string;
  base_currency?: string | null;
  gst_registered?: boolean;
  gst_no?: string | null;
  gst_rate?: number;
  gst_reporting_frequency?: string | null;
  gst_accounting_basis?: string | null;
  gst_effective_from?: string | null;
  gst_deregistered_on?: string | null;
  gst_submission_due_days?: number | null;
  gst_financial_year_start_month?: number | null;
};

type TaxCode = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  transaction_type: string;
  treatment: string;
  rate: number;
  recoverable_percentage: number;
  box_no?: number | null;
  is_default_sales: boolean;
  is_default_purchase: boolean;
  is_active: boolean;
  sort_order: number;
  description?: string | null;
};

type FilingPeriod = {
  id: number;
  period_no?: string | null;
  company_id: number;
  period_label: string;
  period_from: string;
  period_to: string;
  due_date?: string | null;
  status: "draft" | "reviewed" | "filed";
  box1_standard_rated_supplies: number;
  box2_zero_rated_supplies: number;
  box3_exempt_supplies: number;
  box4_total_supplies: number;
  box5_taxable_purchases: number;
  box6_output_tax: number;
  box7_input_tax: number;
  box8_net_gst: number;
  source_snapshot_at?: string | null;
  notes?: string | null;
  filed_reference?: string | null;
  filed_at?: string | null;
  reopened_reason?: string | null;
};

type Adjustment = {
  id: number;
  adjustment_no?: string | null;
  company_id: number;
  adjustment_date: string;
  adjustment_type: string;
  treatment: string;
  taxable_amount: number;
  gst_amount: number;
  reference?: string | null;
  reason: string;
  status: "posted" | "void";
  notes?: string | null;
  void_reason?: string | null;
};

type Invoice = {
  id: number;
  company_id: number;
  invoice_no?: string | null;
  invoice_date: string;
  customer_name: string;
  subtotal: number;
  service_charge_amount: number;
  gst_rate: number;
  gst_amount: number;
  total_amount: number;
  status: string;
  gst_tax_code_id?: number | null;
  gst_treatment?: string | null;
  gst_reportable?: boolean;
  gst_review_status?: string | null;
  gst_review_notes?: string | null;
};

type Bill = {
  id: number;
  company_id: number;
  bill_no?: string | null;
  bill_date: string;
  supplier_name: string;
  supplier_invoice_no?: string | null;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  status: string;
  gst_tax_code_id?: number | null;
  gst_treatment?: string | null;
  gst_reportable?: boolean;
  gst_review_status?: string | null;
  gst_review_notes?: string | null;
  input_tax_recoverable_percentage?: number;
  recoverable_gst_amount?: number;
};

type PeriodEntry = {
  id: number;
  source_type: string;
  source_id: number;
  source_no?: string | null;
  source_date: string;
  counterparty?: string | null;
  direction: "output" | "input";
  treatment: string;
  taxable_amount: number;
  gst_amount: number;
  recoverable_gst_amount: number;
  box_no?: number | null;
  description?: string | null;
};

type Tab = "overview" | "review" | "adjustments" | "codes" | "settings";
type ReviewSource = { type: "customer_invoice" | "supplier_bill"; id: number } | null;

const today = new Date().toISOString().slice(0, 10);
const currentYear = today.slice(0, 4);

function money(currency: string, amount: number) {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function treatmentLabel(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function taxCodeEmpty(companyId = 0) {
  return {
    id: null as number | null,
    company_id: companyId,
    code: "",
    name: "",
    transaction_type: "both",
    treatment: "standard_rated",
    rate: "9.00",
    recoverable_percentage: "100.00",
    box_no: "1",
    is_default_sales: false,
    is_default_purchase: false,
    is_active: true,
    sort_order: "100",
    description: "",
  };
}

function periodEmpty(companyId = 0) {
  return {
    company_id: companyId,
    period_label: `${currentYear} Q1`,
    period_from: `${currentYear}-01-01`,
    period_to: `${currentYear}-03-31`,
    due_date: "",
    notes: "",
  };
}

function adjustmentEmpty(companyId = 0) {
  return {
    id: null as number | null,
    company_id: companyId,
    adjustment_date: today,
    adjustment_type: "output_tax",
    treatment: "standard_rated",
    taxable_amount: "0.00",
    gst_amount: "0.00",
    reference: "",
    reason: "",
    notes: "",
  };
}

export default function GstReportsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [periods, setPeriods] = useState<FilingPeriod[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [entries, setEntries] = useState<PeriodEntry[]>([]);
  const [companyId, setCompanyId] = useState(0);
  const [periodId, setPeriodId] = useState(0);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [reviewFilter, setReviewFilter] = useState("pending");
  const [reviewSource, setReviewSource] = useState<ReviewSource>(null);
  const [periodForm, setPeriodForm] = useState(periodEmpty());
  const [adjustmentForm, setAdjustmentForm] = useState(adjustmentEmpty());
  const [codeForm, setCodeForm] = useState(taxCodeEmpty());
  const [settingsForm, setSettingsForm] = useState({
    gst_registered: false,
    gst_no: "",
    gst_rate: "9.00",
    gst_reporting_frequency: "quarterly",
    gst_accounting_basis: "invoice",
    gst_effective_from: "",
    gst_deregistered_on: "",
    gst_submission_due_days: "30",
    gst_financial_year_start_month: "1",
  });
  const [reviewForm, setReviewForm] = useState({
    tax_code_id: "",
    treatment: "standard_rated",
    reportable: true,
    review_status: "reviewed",
    review_notes: "",
    input_tax_recoverable_percentage: "100.00",
  });

  const selectedCompany = useMemo(
    () => companies.find((company) => company.id === companyId) ?? null,
    [companies, companyId],
  );
  const currency = selectedCompany?.base_currency || "SGD";
  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId) ?? null,
    [periods, periodId],
  );
  const companyCodes = useMemo(
    () => taxCodes.filter((code) => code.company_id === companyId),
    [taxCodes, companyId],
  );
  const companyPeriods = useMemo(
    () => periods.filter((period) => period.company_id === companyId),
    [periods, companyId],
  );
  const companyAdjustments = useMemo(
    () => adjustments.filter((adjustment) => adjustment.company_id === companyId),
    [adjustments, companyId],
  );
  const companyInvoices = useMemo(
    () => invoices.filter((invoice) => invoice.company_id === companyId),
    [invoices, companyId],
  );
  const companyBills = useMemo(
    () => bills.filter((bill) => bill.company_id === companyId),
    [bills, companyId],
  );

  const reviewRows = useMemo(() => {
    const invoiceRows = companyInvoices.map((invoice) => ({
      kind: "customer_invoice" as const,
      id: invoice.id,
      documentNo: invoice.invoice_no || `Invoice ${invoice.id}`,
      date: invoice.invoice_date,
      counterparty: invoice.customer_name,
      taxable: number(invoice.subtotal) + number(invoice.service_charge_amount),
      gst: number(invoice.gst_amount),
      recoverable: 0,
      status: invoice.status,
      taxCodeId: invoice.gst_tax_code_id,
      treatment: invoice.gst_treatment || "standard_rated",
      reportable: invoice.gst_reportable !== false,
      reviewStatus: invoice.gst_review_status || "pending",
      reviewNotes: invoice.gst_review_notes || "",
      recoverablePercentage: 100,
    }));
    const billRows = companyBills.map((bill) => ({
      kind: "supplier_bill" as const,
      id: bill.id,
      documentNo: bill.bill_no || `Bill ${bill.id}`,
      date: bill.bill_date,
      counterparty: bill.supplier_name,
      taxable: number(bill.subtotal),
      gst: number(bill.gst_amount),
      recoverable: number(bill.recoverable_gst_amount),
      status: bill.status,
      taxCodeId: bill.gst_tax_code_id,
      treatment: bill.gst_treatment || "standard_rated",
      reportable: bill.gst_reportable !== false,
      reviewStatus: bill.gst_review_status || "pending",
      reviewNotes: bill.gst_review_notes || "",
      recoverablePercentage: number(bill.input_tax_recoverable_percentage || 100),
    }));
    return [...invoiceRows, ...billRows]
      .filter((row) => reviewFilter === "all" || row.reviewStatus === reviewFilter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [companyBills, companyInvoices, reviewFilter]);

  const selectedReviewRow = useMemo(
    () =>
      reviewSource
        ? reviewRows.find((row) => row.kind === reviewSource.type && row.id === reviewSource.id) ?? null
        : null,
    [reviewRows, reviewSource],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/gst", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load GST data.");
      setCompanies(payload.companies ?? []);
      setTaxCodes(payload.tax_codes ?? []);
      setPeriods(payload.periods ?? []);
      setAdjustments(payload.adjustments ?? []);
      setInvoices(payload.invoices ?? []);
      setBills(payload.bills ?? []);
      const firstCompany = companyId || Number(payload.companies?.[0]?.id || 0);
      setCompanyId(firstCompany);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load GST data.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const loadPeriodEntries = useCallback(async (id: number) => {
    if (!id) {
      setEntries([]);
      return;
    }
    try {
      const response = await fetch(`/api/admin/gst?period_id=${id}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load period details.");
      setEntries(payload.entries ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load period details.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!companyId) return;
    const company = companies.find((item) => item.id === companyId);
    if (company) {
      setSettingsForm({
        gst_registered: Boolean(company.gst_registered),
        gst_no: company.gst_no || "",
        gst_rate: String(company.gst_rate ?? 9),
        gst_reporting_frequency: company.gst_reporting_frequency || "quarterly",
        gst_accounting_basis: company.gst_accounting_basis || "invoice",
        gst_effective_from: company.gst_effective_from || "",
        gst_deregistered_on: company.gst_deregistered_on || "",
        gst_submission_due_days: String(company.gst_submission_due_days ?? 30),
        gst_financial_year_start_month: String(company.gst_financial_year_start_month ?? 1),
      });
    }
    setPeriodForm((current) => ({ ...current, company_id: companyId }));
    setAdjustmentForm(adjustmentEmpty(companyId));
    setCodeForm(taxCodeEmpty(companyId));
    const nextPeriod = periods.find((period) => period.company_id === companyId)?.id ?? 0;
    setPeriodId(nextPeriod);
  }, [companies, companyId, periods]);

  useEffect(() => {
    void loadPeriodEntries(periodId);
  }, [loadPeriodEntries, periodId]);

  useEffect(() => {
    if (!selectedReviewRow) return;
    setReviewForm({
      tax_code_id: selectedReviewRow.taxCodeId ? String(selectedReviewRow.taxCodeId) : "",
      treatment: selectedReviewRow.treatment,
      reportable: selectedReviewRow.reportable,
      review_status: selectedReviewRow.reviewStatus,
      review_notes: selectedReviewRow.reviewNotes,
      input_tax_recoverable_percentage: String(selectedReviewRow.recoverablePercentage),
    });
  }, [selectedReviewRow]);

  async function post(body: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/gst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to complete GST action.");
      setMessage(successMessage);
      await load();
      return payload;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to complete GST action.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function createPeriod() {
    const result = await post({ action: "create_period", ...periodForm }, "GST filing period created.");
    if (result?.period?.id) {
      setPeriodId(result.period.id);
      setTab("overview");
    }
  }

  async function refreshPeriod() {
    if (!periodId) return;
    await post({ action: "refresh_period", period_id: periodId }, "GST period refreshed from source documents.");
    await loadPeriodEntries(periodId);
  }

  async function saveReview() {
    if (!reviewSource) return;
    await post(
      {
        action: "review_source",
        source_type: reviewSource.type,
        source_id: reviewSource.id,
        tax_code_id: reviewForm.tax_code_id ? Number(reviewForm.tax_code_id) : null,
        treatment: reviewForm.treatment,
        reportable: reviewForm.reportable,
        review_status: reviewForm.review_status,
        review_notes: reviewForm.review_notes,
        input_tax_recoverable_percentage: Number(reviewForm.input_tax_recoverable_percentage),
      },
      "GST document review saved.",
    );
    setReviewSource(null);
  }

  function editCode(code: TaxCode) {
    setCodeForm({
      id: code.id,
      company_id: code.company_id,
      code: code.code,
      name: code.name,
      transaction_type: code.transaction_type,
      treatment: code.treatment,
      rate: String(code.rate),
      recoverable_percentage: String(code.recoverable_percentage),
      box_no: code.box_no ? String(code.box_no) : "",
      is_default_sales: code.is_default_sales,
      is_default_purchase: code.is_default_purchase,
      is_active: code.is_active,
      sort_order: String(code.sort_order),
      description: code.description || "",
    });
  }

  function editAdjustment(adjustment: Adjustment) {
    setAdjustmentForm({
      id: adjustment.id,
      company_id: adjustment.company_id,
      adjustment_date: adjustment.adjustment_date,
      adjustment_type: adjustment.adjustment_type,
      treatment: adjustment.treatment,
      taxable_amount: String(adjustment.taxable_amount),
      gst_amount: String(adjustment.gst_amount),
      reference: adjustment.reference || "",
      reason: adjustment.reason,
      notes: adjustment.notes || "",
    });
  }

  if (loading) {
    return <main className={styles.loading}>Loading GST reports...</main>;
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>UPGRADE 6 · TAX CONTROL</p>
          <h1>GST Reports & Filing Control</h1>
          <p>Review source documents, prepare filing periods and keep a complete GST audit trail.</p>
        </div>
        <div className={styles.heroActions}>
          <label>
            <span>Company</span>
            <select value={companyId} onChange={(event) => setCompanyId(Number(event.target.value))}>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
          {selectedPeriod ? (
            <Link className={styles.printButton} href={`/gst-reports/print?period_id=${selectedPeriod.id}`}>
              Print GST Report
            </Link>
          ) : null}
        </div>
      </header>

      {message ? <div className={styles.success}>{message}</div> : null}
      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

      <nav className={styles.tabs} aria-label="GST workspace tabs">
        {([
          ["overview", "GST Return"],
          ["review", "Tax Review"],
          ["adjustments", "Adjustments"],
          ["codes", "Tax Codes"],
          ["settings", "Settings"],
        ] as Array<[Tab, string]>).map(([value, label]) => (
          <button key={value} className={tab === value ? styles.activeTab : ""} onClick={() => setTab(value)}>{label}</button>
        ))}
      </nav>

      {tab === "overview" ? (
        <section className={styles.workspace}>
          <aside className={styles.sidePanel}>
            <div className={styles.panelHeading}>
              <div><p>FILING PERIODS</p><h2>GST Periods</h2></div>
              <span>{companyPeriods.length}</span>
            </div>
            <div className={styles.periodList}>
              {companyPeriods.map((period) => (
                <button key={period.id} className={periodId === period.id ? styles.selectedCard : ""} onClick={() => setPeriodId(period.id)}>
                  <strong>{period.period_label}</strong>
                  <small>{formatDate(period.period_from)} – {formatDate(period.period_to)}</small>
                  <span className={`${styles.status} ${styles[period.status]}`}>{period.status}</span>
                </button>
              ))}
              {!companyPeriods.length ? <p className={styles.empty}>No GST periods created.</p> : null}
            </div>

            <div className={styles.formStack}>
              <h3>Create Filing Period</h3>
              <label><span>Period label</span><input value={periodForm.period_label} onChange={(event) => setPeriodForm({ ...periodForm, period_label: event.target.value })} /></label>
              <div className={styles.twoColumns}>
                <label><span>From</span><input type="date" value={periodForm.period_from} onChange={(event) => setPeriodForm({ ...periodForm, period_from: event.target.value })} /></label>
                <label><span>To</span><input type="date" value={periodForm.period_to} onChange={(event) => setPeriodForm({ ...periodForm, period_to: event.target.value })} /></label>
              </div>
              <label><span>Due date</span><input type="date" value={periodForm.due_date} onChange={(event) => setPeriodForm({ ...periodForm, due_date: event.target.value })} /></label>
              <label><span>Notes</span><textarea value={periodForm.notes} onChange={(event) => setPeriodForm({ ...periodForm, notes: event.target.value })} /></label>
              <button className={styles.primaryButton} disabled={saving} onClick={() => void createPeriod()}>Create Period</button>
            </div>
          </aside>

          <div className={styles.mainPanel}>
            {!selectedPeriod ? (
              <div className={styles.largeEmpty}>Create a GST filing period to begin.</div>
            ) : (
              <>
                <div className={styles.periodHeader}>
                  <div>
                    <p>{selectedPeriod.period_no || "GST PERIOD"}</p>
                    <h2>{selectedPeriod.period_label}</h2>
                    <span>{formatDate(selectedPeriod.period_from)} to {formatDate(selectedPeriod.period_to)} · Due {formatDate(selectedPeriod.due_date)}</span>
                  </div>
                  <div className={styles.actionRow}>
                    {selectedPeriod.status !== "filed" ? <button disabled={saving} onClick={() => void refreshPeriod()}>Refresh Sources</button> : null}
                    {selectedPeriod.status === "draft" ? <button disabled={saving} onClick={() => void post({ action: "mark_reviewed", period_id: selectedPeriod.id }, "GST period marked reviewed.")}>Mark Reviewed</button> : null}
                    {selectedPeriod.status !== "filed" ? <button className={styles.primaryButton} disabled={saving} onClick={() => {
                      const reference = window.prompt("Filing reference (optional)") || "";
                      void post({ action: "file_period", period_id: selectedPeriod.id, filed_reference: reference }, "GST period marked filed.");
                    }}>Mark Filed</button> : <button className={styles.warningButton} disabled={saving} onClick={() => {
                      const reason = window.prompt("Reason for reopening this filed period") || "";
                      if (reason) void post({ action: "reopen_period", period_id: selectedPeriod.id, reopened_reason: reason }, "GST period reopened.");
                    }}>Reopen Period</button>}
                  </div>
                </div>

                <div className={styles.boxGrid}>
                  {[
                    ["Box 1", "Standard-Rated Supplies", selectedPeriod.box1_standard_rated_supplies],
                    ["Box 2", "Zero-Rated Supplies", selectedPeriod.box2_zero_rated_supplies],
                    ["Box 3", "Exempt Supplies", selectedPeriod.box3_exempt_supplies],
                    ["Box 4", "Total Supplies", selectedPeriod.box4_total_supplies],
                    ["Box 5", "Taxable Purchases", selectedPeriod.box5_taxable_purchases],
                    ["Box 6", "Output Tax", selectedPeriod.box6_output_tax],
                    ["Box 7", "Recoverable Input Tax", selectedPeriod.box7_input_tax],
                    ["Box 8", selectedPeriod.box8_net_gst >= 0 ? "Net GST Payable" : "GST Refund", selectedPeriod.box8_net_gst],
                  ].map(([box, label, amount]) => (
                    <article key={String(box)} className={String(box) === "Box 8" ? styles.netBox : ""}>
                      <span>{String(box)}</span>
                      <small>{String(label)}</small>
                      <strong>{money(currency, Number(amount))}</strong>
                    </article>
                  ))}
                </div>

                <div className={styles.auditPanel}>
                  <div className={styles.panelHeading}>
                    <div><p>AUDIT DRILL-DOWN</p><h2>Period Source Entries</h2></div>
                    <span>{entries.length}</span>
                  </div>
                  <div className={styles.tableWrap}>
                    <table className={styles.dataTable}>
                      <thead><tr><th>Date</th><th>Source</th><th>Counterparty</th><th>Box</th><th>Treatment</th><th className={styles.numberCell}>Taxable</th><th className={styles.numberCell}>GST</th><th className={styles.numberCell}>Recoverable</th></tr></thead>
                      <tbody>
                        {entries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{formatDate(entry.source_date)}</td>
                            <td><strong>{entry.source_no || `${entry.source_type} ${entry.source_id}`}</strong><small>{entry.direction}</small></td>
                            <td>{entry.counterparty || "–"}</td>
                            <td>{entry.box_no ? `Box ${entry.box_no}` : "Excluded"}</td>
                            <td>{treatmentLabel(entry.treatment)}</td>
                            <td className={styles.numberCell}>{money(currency, entry.taxable_amount)}</td>
                            <td className={styles.numberCell}>{money(currency, entry.gst_amount)}</td>
                            <td className={styles.numberCell}>{money(currency, entry.recoverable_gst_amount)}</td>
                          </tr>
                        ))}
                        {!entries.length ? <tr><td colSpan={8} className={styles.empty}>Click Refresh Sources to build the GST audit snapshot.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.snapshotNote}>Last refreshed: {selectedPeriod.source_snapshot_at ? new Date(selectedPeriod.source_snapshot_at).toLocaleString("en-SG") : "Not refreshed"}</p>
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      {tab === "review" ? (
        <section className={styles.cardPanel}>
          <div className={styles.panelHeading}>
            <div><p>SOURCE DOCUMENT CONTROL</p><h2>Invoice & Supplier Bill GST Review</h2></div>
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
              <option value="pending">Pending Review</option><option value="reviewed">Reviewed</option><option value="excluded">Excluded</option><option value="all">All Documents</option>
            </select>
          </div>
          <div className={styles.reviewLayout}>
            <div className={styles.tableWrap}>
              <table className={styles.dataTable}>
                <thead><tr><th>Type</th><th>Date / No.</th><th>Counterparty</th><th>Treatment</th><th>Review</th><th className={styles.numberCell}>Taxable</th><th className={styles.numberCell}>GST</th><th></th></tr></thead>
                <tbody>
                  {reviewRows.map((row) => (
                    <tr key={`${row.kind}-${row.id}`}>
                      <td>{row.kind === "customer_invoice" ? "Sales" : "Purchase"}</td>
                      <td><strong>{row.documentNo}</strong><small>{formatDate(row.date)}</small></td>
                      <td>{row.counterparty}</td>
                      <td>{treatmentLabel(row.treatment)}</td>
                      <td><span className={`${styles.status} ${styles[row.reviewStatus]}`}>{row.reviewStatus}</span></td>
                      <td className={styles.numberCell}>{money(currency, row.taxable)}</td>
                      <td className={styles.numberCell}>{money(currency, row.gst)}</td>
                      <td><button className={styles.smallButton} onClick={() => setReviewSource({ type: row.kind, id: row.id })}>Review</button></td>
                    </tr>
                  ))}
                  {!reviewRows.length ? <tr><td colSpan={8} className={styles.empty}>No documents match this review filter.</td></tr> : null}
                </tbody>
              </table>
            </div>

            <aside className={styles.editorPanel}>
              <h3>{selectedReviewRow ? selectedReviewRow.documentNo : "Select a document"}</h3>
              {selectedReviewRow ? (
                <div className={styles.formStack}>
                  <label><span>Tax code</span><select value={reviewForm.tax_code_id} onChange={(event) => {
                    const code = companyCodes.find((item) => item.id === Number(event.target.value));
                    setReviewForm({ ...reviewForm, tax_code_id: event.target.value, treatment: code?.treatment || reviewForm.treatment, input_tax_recoverable_percentage: code ? String(code.recoverable_percentage) : reviewForm.input_tax_recoverable_percentage });
                  }}><option value="">No tax code</option>{companyCodes.filter((code) => code.is_active && (code.transaction_type === "both" || code.transaction_type === (selectedReviewRow.kind === "customer_invoice" ? "sales" : "purchase"))).map((code) => <option key={code.id} value={code.id}>{code.code} · {code.name}</option>)}</select></label>
                  <label><span>Treatment</span><select value={reviewForm.treatment} onChange={(event) => setReviewForm({ ...reviewForm, treatment: event.target.value })}><option value="standard_rated">Standard Rated</option><option value="zero_rated">Zero Rated</option><option value="exempt">Exempt</option><option value="out_of_scope">Out of Scope</option>{selectedReviewRow.kind === "supplier_bill" ? <option value="blocked_input">Blocked Input Tax</option> : null}</select></label>
                  {selectedReviewRow.kind === "supplier_bill" ? <label><span>Input tax recoverable %</span><input type="number" min="0" max="100" step="0.01" value={reviewForm.input_tax_recoverable_percentage} onChange={(event) => setReviewForm({ ...reviewForm, input_tax_recoverable_percentage: event.target.value })} /></label> : null}
                  <label><span>Review status</span><select value={reviewForm.review_status} onChange={(event) => setReviewForm({ ...reviewForm, review_status: event.target.value })}><option value="pending">Pending</option><option value="reviewed">Reviewed</option><option value="excluded">Excluded</option></select></label>
                  <label className={styles.checkbox}><input type="checkbox" checked={reviewForm.reportable} onChange={(event) => setReviewForm({ ...reviewForm, reportable: event.target.checked })} /><span>Include in GST reporting</span></label>
                  <label><span>Review notes</span><textarea value={reviewForm.review_notes} onChange={(event) => setReviewForm({ ...reviewForm, review_notes: event.target.value })} /></label>
                  <button className={styles.primaryButton} disabled={saving} onClick={() => void saveReview()}>Save GST Review</button>
                </div>
              ) : <p className={styles.empty}>Choose Review from the document table.</p>}
            </aside>
          </div>
        </section>
      ) : null}

      {tab === "adjustments" ? (
        <section className={styles.workspace}>
          <aside className={styles.sidePanel}>
            <div className={styles.panelHeading}><div><p>MANUAL TAX ENTRIES</p><h2>GST Adjustment</h2></div></div>
            <div className={styles.formStack}>
              <label><span>Date</span><input type="date" value={adjustmentForm.adjustment_date} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, adjustment_date: event.target.value })} /></label>
              <label><span>Type</span><select value={adjustmentForm.adjustment_type} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, adjustment_type: event.target.value })}><option value="output_tax">Output Tax</option><option value="input_tax">Input Tax</option></select></label>
              <label><span>Treatment</span><select value={adjustmentForm.treatment} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, treatment: event.target.value })}><option value="standard_rated">Standard Rated</option><option value="zero_rated">Zero Rated</option><option value="exempt">Exempt</option><option value="out_of_scope">Out of Scope</option><option value="blocked_input">Blocked Input Tax</option></select></label>
              <div className={styles.twoColumns}><label><span>Taxable amount</span><input type="number" step="0.01" value={adjustmentForm.taxable_amount} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, taxable_amount: event.target.value })} /></label><label><span>GST amount</span><input type="number" step="0.01" value={adjustmentForm.gst_amount} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, gst_amount: event.target.value })} /></label></div>
              <label><span>Reference</span><input value={adjustmentForm.reference} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, reference: event.target.value })} /></label>
              <label><span>Reason</span><input value={adjustmentForm.reason} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, reason: event.target.value })} /></label>
              <label><span>Notes</span><textarea value={adjustmentForm.notes} onChange={(event) => setAdjustmentForm({ ...adjustmentForm, notes: event.target.value })} /></label>
              <div className={styles.actionRow}><button onClick={() => setAdjustmentForm(adjustmentEmpty(companyId))}>Clear</button><button className={styles.primaryButton} disabled={saving} onClick={() => void post({ action: "save_adjustment", ...adjustmentForm }, adjustmentForm.id ? "GST adjustment updated." : "GST adjustment posted.")}>Save Adjustment</button></div>
            </div>
          </aside>
          <div className={styles.mainPanel}>
            <div className={styles.panelHeading}><div><p>ADJUSTMENT LEDGER</p><h2>Posted Adjustments</h2></div><span>{companyAdjustments.length}</span></div>
            <div className={styles.tableWrap}><table className={styles.dataTable}><thead><tr><th>Date / No.</th><th>Type</th><th>Reason</th><th>Reference</th><th>Status</th><th className={styles.numberCell}>Taxable</th><th className={styles.numberCell}>GST</th><th></th></tr></thead><tbody>{companyAdjustments.map((adjustment) => <tr key={adjustment.id}><td><strong>{adjustment.adjustment_no}</strong><small>{formatDate(adjustment.adjustment_date)}</small></td><td>{treatmentLabel(adjustment.adjustment_type)}</td><td>{adjustment.reason}</td><td>{adjustment.reference || "–"}</td><td><span className={`${styles.status} ${styles[adjustment.status]}`}>{adjustment.status}</span></td><td className={styles.numberCell}>{money(currency, adjustment.taxable_amount)}</td><td className={styles.numberCell}>{money(currency, adjustment.gst_amount)}</td><td><div className={styles.tableActions}>{adjustment.status === "posted" ? <><button onClick={() => editAdjustment(adjustment)}>Edit</button><button className={styles.dangerText} onClick={() => { const reason = window.prompt("Reason for voiding this adjustment") || ""; if (reason) void post({ action: "void_adjustment", id: adjustment.id, reason }, "GST adjustment voided."); }}>Void</button></> : null}</div></td></tr>)}{!companyAdjustments.length ? <tr><td colSpan={8} className={styles.empty}>No GST adjustments recorded.</td></tr> : null}</tbody></table></div>
          </div>
        </section>
      ) : null}

      {tab === "codes" ? (
        <section className={styles.workspace}>
          <aside className={styles.sidePanel}>
            <div className={styles.panelHeading}><div><p>GST CONFIGURATION</p><h2>Tax Code Editor</h2></div></div>
            <div className={styles.formStack}>
              <div className={styles.twoColumns}><label><span>Code</span><input value={codeForm.code} onChange={(event) => setCodeForm({ ...codeForm, code: event.target.value })} /></label><label><span>Sort order</span><input type="number" value={codeForm.sort_order} onChange={(event) => setCodeForm({ ...codeForm, sort_order: event.target.value })} /></label></div>
              <label><span>Name</span><input value={codeForm.name} onChange={(event) => setCodeForm({ ...codeForm, name: event.target.value })} /></label>
              <label><span>Transaction type</span><select value={codeForm.transaction_type} onChange={(event) => setCodeForm({ ...codeForm, transaction_type: event.target.value })}><option value="sales">Sales</option><option value="purchase">Purchase</option><option value="both">Both</option></select></label>
              <label><span>Treatment</span><select value={codeForm.treatment} onChange={(event) => setCodeForm({ ...codeForm, treatment: event.target.value })}><option value="standard_rated">Standard Rated</option><option value="zero_rated">Zero Rated</option><option value="exempt">Exempt</option><option value="out_of_scope">Out of Scope</option><option value="blocked_input">Blocked Input Tax</option></select></label>
              <div className={styles.twoColumns}><label><span>Rate %</span><input type="number" min="0" max="100" step="0.01" value={codeForm.rate} onChange={(event) => setCodeForm({ ...codeForm, rate: event.target.value })} /></label><label><span>Recoverable %</span><input type="number" min="0" max="100" step="0.01" value={codeForm.recoverable_percentage} onChange={(event) => setCodeForm({ ...codeForm, recoverable_percentage: event.target.value })} /></label></div>
              <label><span>GST return box</span><select value={codeForm.box_no} onChange={(event) => setCodeForm({ ...codeForm, box_no: event.target.value })}><option value="">No box</option>{[1,2,3,4,5,6,7,8].map((box) => <option key={box} value={box}>Box {box}</option>)}</select></label>
              <label className={styles.checkbox}><input type="checkbox" checked={codeForm.is_default_sales} onChange={(event) => setCodeForm({ ...codeForm, is_default_sales: event.target.checked })} /><span>Default sales code</span></label>
              <label className={styles.checkbox}><input type="checkbox" checked={codeForm.is_default_purchase} onChange={(event) => setCodeForm({ ...codeForm, is_default_purchase: event.target.checked })} /><span>Default purchase code</span></label>
              <label className={styles.checkbox}><input type="checkbox" checked={codeForm.is_active} onChange={(event) => setCodeForm({ ...codeForm, is_active: event.target.checked })} /><span>Active</span></label>
              <label><span>Description</span><textarea value={codeForm.description} onChange={(event) => setCodeForm({ ...codeForm, description: event.target.value })} /></label>
              <div className={styles.actionRow}><button onClick={() => setCodeForm(taxCodeEmpty(companyId))}>New Code</button><button className={styles.primaryButton} disabled={saving} onClick={() => void post({ action: "save_tax_code", ...codeForm, box_no: codeForm.box_no ? Number(codeForm.box_no) : null }, codeForm.id ? "GST tax code updated." : "GST tax code created.")}>Save Tax Code</button></div>
            </div>
          </aside>
          <div className={styles.mainPanel}>
            <div className={styles.panelHeading}><div><p>COMPANY TAX CODES</p><h2>{selectedCompany?.name}</h2></div><span>{companyCodes.length}</span></div>
            <div className={styles.codeGrid}>{companyCodes.map((code) => <button key={code.id} className={!code.is_active ? styles.inactiveCard : ""} onClick={() => editCode(code)}><div><strong>{code.code}</strong><span>{code.name}</span></div><small>{treatmentLabel(code.treatment)} · {code.rate}%{code.box_no ? ` · Box ${code.box_no}` : ""}</small><p>{code.description || "No description"}</p><footer>{code.is_default_sales ? <em>Default Sales</em> : null}{code.is_default_purchase ? <em>Default Purchase</em> : null}{!code.is_active ? <em>Inactive</em> : null}</footer></button>)}</div>
          </div>
        </section>
      ) : null}

      {tab === "settings" ? (
        <section className={styles.settingsPanel}>
          <div className={styles.panelHeading}><div><p>COMPANY GST PROFILE</p><h2>{selectedCompany?.name}</h2></div></div>
          <div className={styles.settingsGrid}>
            <label className={styles.checkbox}><input type="checkbox" checked={settingsForm.gst_registered} onChange={(event) => setSettingsForm({ ...settingsForm, gst_registered: event.target.checked })} /><span>GST registered company</span></label>
            <label><span>GST registration number</span><input value={settingsForm.gst_no} onChange={(event) => setSettingsForm({ ...settingsForm, gst_no: event.target.value })} /></label>
            <label><span>Default GST rate %</span><input type="number" min="0" max="100" step="0.01" value={settingsForm.gst_rate} onChange={(event) => setSettingsForm({ ...settingsForm, gst_rate: event.target.value })} /></label>
            <label><span>Reporting frequency</span><select value={settingsForm.gst_reporting_frequency} onChange={(event) => setSettingsForm({ ...settingsForm, gst_reporting_frequency: event.target.value })}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="half_yearly">Half-Yearly</option><option value="annual">Annual</option></select></label>
            <label><span>Accounting basis</span><select value={settingsForm.gst_accounting_basis} onChange={(event) => setSettingsForm({ ...settingsForm, gst_accounting_basis: event.target.value })}><option value="invoice">Invoice / Document Date</option><option value="payment">Payment Basis (setting only)</option></select><small>Current report snapshots use document dates. Payment-basis support is reserved for a future cash-accounting upgrade.</small></label>
            <label><span>GST effective from</span><input type="date" value={settingsForm.gst_effective_from} onChange={(event) => setSettingsForm({ ...settingsForm, gst_effective_from: event.target.value })} /></label>
            <label><span>Deregistered on</span><input type="date" value={settingsForm.gst_deregistered_on} onChange={(event) => setSettingsForm({ ...settingsForm, gst_deregistered_on: event.target.value })} /></label>
            <label><span>Submission due days</span><input type="number" min="0" value={settingsForm.gst_submission_due_days} onChange={(event) => setSettingsForm({ ...settingsForm, gst_submission_due_days: event.target.value })} /></label>
            <label><span>Financial year start month</span><select value={settingsForm.gst_financial_year_start_month} onChange={(event) => setSettingsForm({ ...settingsForm, gst_financial_year_start_month: event.target.value })}>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{new Date(2000, month - 1, 1).toLocaleString("en-SG", { month: "long" })}</option>)}</select></label>
          </div>
          <button className={styles.primaryButton} disabled={saving} onClick={() => void post({ action: "save_settings", company_id: companyId, ...settingsForm }, "GST company settings saved.")}>Save GST Settings</button>
        </section>
      ) : null}
    </main>
  );
}
