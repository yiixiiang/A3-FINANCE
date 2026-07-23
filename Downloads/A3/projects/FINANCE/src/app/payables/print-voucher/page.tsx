"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";

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

type Supplier = {
  supplier_name: string;
  supplier_no?: string | null;
  billing_address?: string | null;
  uen?: string | null;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_no?: string | null;
  paynow_details?: string | null;
};

type Payment = {
  id: number;
  voucher_no?: string | null;
  payment_date: string;
  currency: string;
  supplier_name: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  payment_method: string;
  payment_reference?: string | null;
  bank_account?: string | null;
  status: string;
  notes?: string | null;
  void_reason?: string | null;
  companies?: Company | null;
  suppliers?: Supplier | null;
};

type Allocation = {
  id: number;
  allocated_amount: number;
  supplier_bills?: {
    bill_no?: string | null;
    supplier_invoice_no?: string | null;
    bill_date: string;
    due_date?: string | null;
    total_amount: number;
  } | null;
};

function money(currency: string, amount: number) {
  return `${currency} ${Number(amount || 0).toFixed(2)}`;
}

function PaymentVoucherContent() {
  const params = useSearchParams();
  const paymentId = Number(params.get("id"));
  const [payment, setPayment] = useState<Payment | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErrorMessage("");
      try {
        if (!Number.isInteger(paymentId) || paymentId <= 0) {
          throw new Error("A valid supplier payment is required.");
        }
        const response = await fetch(`/api/admin/payables?payment_id=${paymentId}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          payment?: Payment;
          allocations?: Allocation[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Unable to load payment voucher.");
        setPayment(payload.payment ?? null);
        setAllocations(payload.allocations ?? []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to load payment voucher.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [paymentId]);

  const company = payment?.companies ?? null;
  const supplier = payment?.suppliers ?? null;
  const allocatedTotal = useMemo(
    () => allocations.reduce((sum, item) => sum + Number(item.allocated_amount || 0), 0),
    [allocations],
  );

  if (loading) return <main className="loading">Loading payment voucher...</main>;
  if (errorMessage || !payment) return <main className="loading">{errorMessage || "Payment voucher not found."}</main>;

  return (
    <main className="page">
      <div className="toolbar print-hidden">
        <button type="button" onClick={() => window.close()}>Close</button>
        <button type="button" className="primary" onClick={() => window.print()}>Print A4 Voucher</button>
      </div>

      <article className="voucher">
        <header className="header">
          <div>
            <p className="brand">A3 MANAGEMENT FINANCE</p>
            <h1>{company?.name || "Company"}</h1>
            <p>{company?.company_address || company?.address || ""}</p>
            <div className="meta-line">
              {company?.uen ? <span>UEN: {company.uen}</span> : null}
              {company?.gst_no ? <span>GST Reg. No.: {company.gst_no}</span> : null}
            </div>
            <div className="meta-line">
              {company?.company_phone || company?.phone ? <span>Tel: {company.company_phone || company.phone}</span> : null}
              {company?.company_email || company?.email ? <span>Email: {company.company_email || company.email}</span> : null}
            </div>
          </div>
          <div className="document-title">
            <h2>PAYMENT VOUCHER</h2>
            <strong>{payment.voucher_no || `PV-${payment.id}`}</strong>
            <span className={payment.status}>{payment.status}</span>
          </div>
        </header>

        <section className="details-grid">
          <div><span>Payment date</span><strong>{formatDate(payment.payment_date)}</strong></div>
          <div><span>Currency</span><strong>{payment.currency}</strong></div>
          <div><span>Payment method</span><strong>{payment.payment_method}</strong></div>
          <div><span>Payment reference</span><strong>{payment.payment_reference || "-"}</strong></div>
          <div><span>Paid from account</span><strong>{payment.bank_account || "-"}</strong></div>
          <div><span>Voucher status</span><strong>{payment.status.toUpperCase()}</strong></div>
        </section>

        <section className="supplier-section">
          <h3>Paid To</h3>
          <div className="supplier-grid">
            <div><span>Supplier</span><strong>{supplier?.supplier_name || payment.supplier_name}</strong></div>
            <div><span>Supplier number</span><strong>{supplier?.supplier_no || "-"}</strong></div>
            <div><span>UEN / Registration</span><strong>{supplier?.uen || "-"}</strong></div>
            <div><span>Address</span><strong>{supplier?.billing_address || "-"}</strong></div>
            <div><span>Bank</span><strong>{supplier?.bank_name || "-"}</strong></div>
            <div><span>Account</span><strong>{supplier?.bank_account_name || "-"} {supplier?.bank_account_no || supplier?.paynow_details || ""}</strong></div>
          </div>
        </section>

        <section className="allocation-section">
          <h3>Bill Allocation</h3>
          <table>
            <thead><tr><th>Internal Bill</th><th>Supplier Invoice</th><th>Bill Date</th><th>Due Date</th><th className="number">Bill Total</th><th className="number">Paid</th></tr></thead>
            <tbody>
              {allocations.length ? allocations.map((allocation) => (
                <tr key={allocation.id}>
                  <td>{allocation.supplier_bills?.bill_no || "-"}</td>
                  <td>{allocation.supplier_bills?.supplier_invoice_no || "-"}</td>
                  <td>{formatDate(allocation.supplier_bills?.bill_date)}</td>
                  <td>{formatDate(allocation.supplier_bills?.due_date)}</td>
                  <td className="number">{money(payment.currency, Number(allocation.supplier_bills?.total_amount || 0))}</td>
                  <td className="number">{money(payment.currency, allocation.allocated_amount)}</td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="empty">No bill allocations. This payment is retained as an advance or unallocated supplier payment.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="totals">
          <div><span>Payment amount</span><strong>{money(payment.currency, payment.amount)}</strong></div>
          <div><span>Allocated to bills</span><strong>{money(payment.currency, allocatedTotal)}</strong></div>
          <div className="grand"><span>Unallocated amount</span><strong>{money(payment.currency, payment.unallocated_amount)}</strong></div>
        </section>

        {payment.notes ? <section className="notes"><h3>Notes</h3><p>{payment.notes}</p></section> : null}
        {payment.void_reason ? <section className="void-note"><strong>Reversal reason:</strong> {payment.void_reason}</section> : null}

        <footer>
          <div><span>Prepared By</span><strong>____________________________</strong></div>
          <div><span>Approved By</span><strong>____________________________</strong></div>
          <div><span>Supplier Acknowledgement</span><strong>____________________________</strong></div>
        </footer>
      </article>

      <style jsx>{`
        :global(*) { box-sizing: border-box; }
        :global(body) { margin: 0; background: #e8edf5; color: #111827; font-family: Arial, sans-serif; }
        .page { min-height: 100vh; padding: 24px; }
        .toolbar { width: min(100%, 210mm); margin: 0 auto 14px; display: flex; justify-content: flex-end; gap: 10px; }
        button { min-height: 40px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 15px; background: #fff; font: inherit; font-weight: 800; cursor: pointer; }
        button.primary { border-color: #1d4ed8; background: #1d4ed8; color: #fff; }
        .voucher { width: min(100%, 210mm); min-height: 297mm; margin: 0 auto; padding: 17mm 15mm; background: #fff; box-shadow: 0 16px 45px rgba(15,23,42,.15); }
        .header { padding-bottom: 18px; border-bottom: 3px solid #172033; display: flex; justify-content: space-between; gap: 30px; }
        .brand { margin: 0 0 6px; color: #2563eb; font-size: 10px; font-weight: 900; letter-spacing: .13em; }
        h1 { margin: 0 0 7px; font-size: 24px; }
        .header p:not(.brand) { margin: 3px 0; color: #475569; font-size: 11px; }
        .meta-line { display: flex; gap: 14px; color: #475569; font-size: 10px; }
        .document-title { text-align: right; }
        .document-title h2 { margin: 0 0 8px; font-size: 25px; letter-spacing: .04em; }
        .document-title strong { display: block; font-size: 15px; }
        .document-title span { margin-top: 8px; border-radius: 999px; padding: 5px 9px; display: inline-block; background: #dcfce7; color: #166534; font-size: 9px; font-weight: 900; text-transform: uppercase; }
        .document-title span.void { background: #fee2e2; color: #991b1b; }
        .details-grid, .supplier-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .details-grid { margin-top: 18px; }
        .details-grid div, .supplier-grid div { border: 1px solid #dbe3ee; border-radius: 7px; padding: 9px; display: grid; gap: 5px; }
        .details-grid span, .supplier-grid span { color: #64748b; font-size: 8px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; }
        .details-grid strong, .supplier-grid strong { font-size: 11px; line-height: 1.35; }
        section h3 { margin: 0 0 10px; font-size: 13px; }
        .supplier-section, .allocation-section, .notes { margin-top: 20px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #dbe3ee; padding: 8px; font-size: 9px; text-align: left; vertical-align: top; }
        th { background: #172033; color: #fff; font-size: 8px; text-transform: uppercase; }
        .number { text-align: right; }
        .empty { padding: 20px; color: #64748b; text-align: center; }
        .totals { width: 310px; margin: 18px 0 0 auto; border: 1px solid #dbe3ee; border-radius: 7px; overflow: hidden; }
        .totals div { padding: 10px 12px; display: flex; justify-content: space-between; gap: 15px; font-size: 10px; }
        .totals div + div { border-top: 1px solid #dbe3ee; }
        .totals .grand { background: #172033; color: #fff; font-size: 11px; }
        .notes p { margin: 0; border: 1px solid #dbe3ee; border-radius: 7px; padding: 10px; color: #475569; font-size: 10px; line-height: 1.5; white-space: pre-wrap; }
        .void-note { margin-top: 14px; border: 1px solid #fecaca; border-radius: 7px; padding: 10px; background: #fef2f2; color: #991b1b; font-size: 10px; }
        footer { margin-top: 38px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; }
        footer div { display: grid; gap: 24px; color: #64748b; font-size: 9px; text-align: center; }
        footer strong { color: #172033; }
        .loading { min-height: 100vh; display: grid; place-items: center; font: 700 16px Arial; }
        @media print {
          @page { size: A4; margin: 0; }
          :global(body) { background: #fff; }
          .print-hidden { display: none !important; }
          .page { padding: 0; }
          .voucher { width: 210mm; min-height: 297mm; box-shadow: none; }
        }
      `}</style>
    </main>
  );
}


export default function PaymentVoucherPage() {
  return (
    <Suspense
      fallback={
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
          Preparing payment voucher...
        </main>
      }
    >
      <PaymentVoucherContent />
    </Suspense>
  );
}
