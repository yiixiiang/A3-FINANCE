"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import styles from "./receipt.module.css";

type Company = {
  id: number;
  name: string;
  address?: string | null;
  company_address?: string | null;
  uen?: string | null;
  phone?: string | null;
  company_phone?: string | null;
  email?: string | null;
  company_email?: string | null;
};

type Payment = {
  id: number;
  receipt_no?: string | null;
  company_id: number;
  customer_name: string;
  payment_date: string;
  currency: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  payment_method: string;
  payment_reference?: string | null;
  status: "posted" | "void";
  notes?: string | null;
  void_reason?: string | null;
};

type Allocation = {
  id: number;
  payment_id: number;
  invoice_id: number;
  allocated_amount: number;
};

type Invoice = {
  id: number;
  invoice_no?: string | null;
  invoice_date: string;
  due_date?: string | null;
  customer_name: string;
  currency?: string | null;
  total_amount: number;
  amount_paid: number;
};

type ApiPayload = {
  companies?: Company[];
  payments?: Payment[];
  allocations?: Allocation[];
  invoices?: Invoice[];
  error?: string;
};

function money(currency: string, amount: number): string {
  return `${currency.toUpperCase()} ${Number(amount || 0).toFixed(2)}`;
}

function ReceiptDocument() {
  const searchParams = useSearchParams();
  const paymentId = Number(searchParams.get("id"));
  const [payload, setPayload] = useState<ApiPayload>({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function load() {
      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        setErrorMessage("A valid payment receipt ID is required.");
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/admin/receivables", {
          cache: "no-store",
        });
        const data = (await response.json()) as ApiPayload;
        if (!response.ok) {
          throw new Error(data.error || "Unable to load payment receipt.");
        }
        setPayload(data);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load payment receipt.",
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [paymentId]);

  const payment = useMemo(
    () => payload.payments?.find((item) => item.id === paymentId) ?? null,
    [payload.payments, paymentId],
  );
  const company = useMemo(
    () =>
      payload.companies?.find((item) => item.id === payment?.company_id) ?? null,
    [payload.companies, payment?.company_id],
  );
  const rows = useMemo(() => {
    const allocations =
      payload.allocations?.filter((item) => item.payment_id === paymentId) ?? [];
    return allocations.map((allocation) => ({
      allocation,
      invoice:
        payload.invoices?.find((item) => item.id === allocation.invoice_id) ??
        null,
    }));
  }, [payload.allocations, payload.invoices, paymentId]);

  if (loading) {
    return <main className={styles.state}>Preparing payment receipt...</main>;
  }

  if (errorMessage || !payment) {
    return (
      <main className={styles.state}>
        {errorMessage || "Payment receipt was not found."}
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.toolbar}>
        <button type="button" onClick={() => window.print()}>
          Print A4 Receipt
        </button>
        <button type="button" onClick={() => window.close()}>
          Close
        </button>
      </div>

      <article className={styles.receipt}>
        <header className={styles.header}>
          <div className={styles.company}>
            <div className={styles.logoPlaceholder}>A3</div>
            <div>
              <h1>{company?.name || "Company"}</h1>
              <p>{company?.company_address || company?.address || ""}</p>
              {company?.uen ? <p>UEN: {company.uen}</p> : null}
              {company?.company_phone || company?.phone ? (
                <p>Tel: {company.company_phone || company.phone}</p>
              ) : null}
              {company?.company_email || company?.email ? (
                <p>Email: {company.company_email || company.email}</p>
              ) : null}
            </div>
          </div>

          <div className={styles.documentTitle}>
            <p>PAYMENT RECEIPT</p>
            <h2>{payment.receipt_no || `RCPT-${payment.id}`}</h2>
            <span className={payment.status === "posted" ? styles.posted : styles.void}>
              {payment.status}
            </span>
          </div>
        </header>

        {payment.status === "void" ? (
          <section className={styles.voidNotice}>
            <strong>REVERSED RECEIPT</strong>
            <span>{payment.void_reason || "This payment has been reversed."}</span>
          </section>
        ) : null}

        <section className={styles.metaGrid}>
          <div>
            <span>Received from</span>
            <strong>{payment.customer_name}</strong>
          </div>
          <div>
            <span>Payment date</span>
            <strong>{formatDate(payment.payment_date)}</strong>
          </div>
          <div>
            <span>Payment method</span>
            <strong>{payment.payment_method}</strong>
          </div>
          <div>
            <span>Reference</span>
            <strong>{payment.payment_reference || "—"}</strong>
          </div>
        </section>

        <section className={styles.amountBox}>
          <span>Amount received</span>
          <strong>{money(payment.currency, payment.amount)}</strong>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h3>Invoice Allocation</h3>
            <span>{rows.length} invoice(s)</span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Invoice date</th>
                <th>Customer</th>
                <th className={styles.number}>Invoice total</th>
                <th className={styles.number}>Payment allocated</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map(({ allocation, invoice }) => (
                  <tr key={allocation.id}>
                    <td>{invoice?.invoice_no || `INV-${allocation.invoice_id}`}</td>
                    <td>{formatDate(invoice?.invoice_date)}</td>
                    <td>{invoice?.customer_name || payment.customer_name}</td>
                    <td className={styles.number}>
                      {money(payment.currency, Number(invoice?.total_amount || 0))}
                    </td>
                    <td className={styles.number}>
                      <strong>
                        {money(payment.currency, allocation.allocated_amount)}
                      </strong>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    No invoice allocation. The full amount is held as customer
                    credit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className={styles.totals}>
          <div>
            <span>Allocated to invoices</span>
            <strong>{money(payment.currency, payment.allocated_amount)}</strong>
          </div>
          <div>
            <span>Unallocated customer credit</span>
            <strong>{money(payment.currency, payment.unallocated_amount)}</strong>
          </div>
          <div className={styles.grandTotal}>
            <span>Total received</span>
            <strong>{money(payment.currency, payment.amount)}</strong>
          </div>
        </section>

        {payment.notes ? (
          <section className={styles.notes}>
            <strong>Notes</strong>
            <p>{payment.notes}</p>
          </section>
        ) : null}

        <footer>
          <p>This is a computer-generated payment receipt.</p>
          <div>
            <span>Prepared by</span>
            <span>Authorised signature</span>
          </div>
        </footer>
      </article>
    </main>
  );
}

export default function PaymentReceiptPage() {
  return (
    <Suspense fallback={<main className={styles.state}>Preparing receipt...</main>}>
      <ReceiptDocument />
    </Suspense>
  );
}
