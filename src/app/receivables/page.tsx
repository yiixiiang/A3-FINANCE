"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./receivables.module.css";

type Company = {
  id: number;
  name: string;
  status: string;
  base_currency?: string | null;
};

type Customer = {
  id: number;
  company_id: number;
  customer_no?: string | null;
  customer_name: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  default_currency?: string | null;
};

type Invoice = {
  id: number;
  company_id: number;
  customer_id?: number | null;
  invoice_no?: string | null;
  invoice_date: string;
  due_date?: string | null;
  customer_name: string;
  currency?: string | null;
  total_amount: number;
  amount_paid: number;
  status: string;
};

type Payment = {
  id: number;
  receipt_no?: string | null;
  company_id: number;
  customer_id?: number | null;
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
  voided_at?: string | null;
};

type Allocation = {
  id: number;
  payment_id: number;
  invoice_id: number;
  allocated_amount: number;
};

type ApiData = {
  companies: Company[];
  customers: Customer[];
  invoices: Invoice[];
  payments: Payment[];
  allocations: Allocation[];
};

type PaymentForm = {
  companyId: number;
  customerId: number | null;
  customerName: string;
  paymentDate: string;
  currency: string;
  amount: string;
  paymentMethod: string;
  paymentReference: string;
  notes: string;
};

type AgeFilter = "all" | "current" | "1-30" | "31-60" | "61-90" | "90+";

const emptyData: ApiData = {
  companies: [],
  customers: [],
  invoices: [],
  payments: [],
  allocations: [],
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function balanceOf(invoice: Invoice): number {
  return Math.max(
    0,
    roundMoney(safeNumber(invoice.total_amount) - safeNumber(invoice.amount_paid)),
  );
}

function daysOverdue(invoice: Invoice): number {
  if (!invoice.due_date || balanceOf(invoice) <= 0) return 0;
  const due = new Date(`${invoice.due_date}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
}

function ageBucket(invoice: Invoice): AgeFilter {
  const days = daysOverdue(invoice);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function money(currency: string | null | undefined, amount: number): string {
  return `${(currency || "SGD").toUpperCase()} ${safeNumber(amount).toFixed(2)}`;
}

function normalise(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

export default function ReceivablesPage() {
  const [data, setData] = useState<ApiData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [search, setSearch] = useState("");
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [creditPaymentId, setCreditPaymentId] = useState<number | null>(null);
  const [form, setForm] = useState<PaymentForm>({
    companyId: 0,
    customerId: null,
    customerName: "",
    paymentDate: todayIso(),
    currency: "SGD",
    amount: "",
    paymentMethod: "PayNow",
    paymentReference: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/admin/receivables", { cache: "no-store" });
      const payload = (await response.json()) as ApiData & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to load accounts receivable.");
      }

      setData({
        companies: payload.companies ?? [],
        customers: payload.customers ?? [],
        invoices: payload.invoices ?? [],
        payments: payload.payments ?? [],
        allocations: payload.allocations ?? [],
      });

      setForm((current) => {
        if (current.companyId) return current;
        const company = (payload.companies ?? []).find(
          (item) => item.status === "active",
        );
        return {
          ...current,
          companyId: company?.id ?? 0,
          currency: company?.base_currency || "SGD",
        };
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load accounts receivable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const creditPayment = useMemo(
    () => data.payments.find((item) => item.id === creditPaymentId) ?? null,
    [creditPaymentId, data.payments],
  );

  const company = useMemo(
    () => data.companies.find((item) => item.id === form.companyId) ?? null,
    [data.companies, form.companyId],
  );

  const companyCustomers = useMemo(
    () =>
      data.customers.filter(
        (customer) =>
          customer.company_id === form.companyId && customer.status === "active",
      ),
    [data.customers, form.companyId],
  );

  const selectedCustomer = useMemo(
    () =>
      companyCustomers.find((customer) => customer.id === form.customerId) ?? null,
    [companyCustomers, form.customerId],
  );

  const outstandingInvoices = useMemo(() => {
    const customerName = normalise(
      selectedCustomer?.customer_name || form.customerName,
    );
    const query = normalise(search);

    return data.invoices
      .filter((invoice) => invoice.company_id === form.companyId)
      .filter((invoice) => invoice.status !== "cancelled")
      .filter((invoice) => balanceOf(invoice) > 0.004)
      .filter(
        (invoice) =>
          (invoice.currency || "SGD").toUpperCase() === form.currency.toUpperCase(),
      )
      .filter((invoice) => {
        if (selectedCustomer) {
          return (
            invoice.customer_id === selectedCustomer.id ||
            (!invoice.customer_id &&
              normalise(invoice.customer_name) === normalise(selectedCustomer.customer_name))
          );
        }
        if (customerName) {
          return normalise(invoice.customer_name).includes(customerName);
        }
        return true;
      })
      .filter((invoice) => ageFilter === "all" || ageBucket(invoice) === ageFilter)
      .filter((invoice) => {
        if (!query) return true;
        return [invoice.invoice_no, invoice.customer_name, invoice.status]
          .map(normalise)
          .some((value) => value.includes(query));
      })
      .sort((a, b) => {
        const aDate = a.due_date || a.invoice_date;
        const bDate = b.due_date || b.invoice_date;
        return aDate.localeCompare(bDate) || a.id - b.id;
      });
  }, [
    ageFilter,
    data.invoices,
    form.companyId,
    form.currency,
    form.customerName,
    search,
    selectedCustomer,
  ]);

  const companyOutstandingInvoices = useMemo(
    () =>
      data.invoices.filter(
        (invoice) =>
          invoice.company_id === form.companyId &&
          invoice.status !== "cancelled" &&
          balanceOf(invoice) > 0.004,
      ),
    [data.invoices, form.companyId],
  );

  const postedPayments = useMemo(
    () =>
      data.payments.filter(
        (payment) =>
          payment.company_id === form.companyId && payment.status === "posted",
      ),
    [data.payments, form.companyId],
  );

  const summary = useMemo(() => {
    const outstanding = companyOutstandingInvoices.reduce(
      (sum, invoice) => sum + balanceOf(invoice),
      0,
    );
    const overdue = companyOutstandingInvoices
      .filter((invoice) => daysOverdue(invoice) > 0)
      .reduce((sum, invoice) => sum + balanceOf(invoice), 0);
    const collected = postedPayments.reduce(
      (sum, payment) => sum + safeNumber(payment.amount),
      0,
    );
    const unallocated = postedPayments.reduce(
      (sum, payment) => sum + safeNumber(payment.unallocated_amount),
      0,
    );

    return { outstanding, overdue, collected, unallocated };
  }, [companyOutstandingInvoices, postedPayments]);

  const allocatedInputTotal = useMemo(
    () =>
      roundMoney(
        (Object.values(allocations) as string[]).reduce<number>(
          (sum, value) => sum + Math.max(0, safeNumber(value)),
          0,
        ),
      ),
    [allocations],
  );

  const paymentAmount = Math.max(0, safeNumber(form.amount));
  const unallocatedPreview = roundMoney(paymentAmount - allocatedInputTotal);

  const paymentHistory = useMemo(() => {
    const query = normalise(search);
    return data.payments
      .filter((payment) => payment.company_id === form.companyId)
      .filter((payment) => {
        if (!selectedCustomer) return true;
        return (
          payment.customer_id === selectedCustomer.id ||
          normalise(payment.customer_name) === normalise(selectedCustomer.customer_name)
        );
      })
      .filter((payment) => {
        if (!query) return true;
        return [
          payment.receipt_no,
          payment.customer_name,
          payment.payment_reference,
          payment.payment_method,
        ]
          .map(normalise)
          .some((value) => value.includes(query));
      });
  }, [data.payments, form.companyId, search, selectedCustomer]);

  function changeCompany(companyId: number) {
    const nextCompany = data.companies.find((item) => item.id === companyId);
    setForm((current) => ({
      ...current,
      companyId,
      customerId: null,
      customerName: "",
      currency: nextCompany?.base_currency || "SGD",
    }));
    setAllocations({});
    setCreditPaymentId(null);
    setMessage("");
    setErrorMessage("");
  }

  function changeCustomer(customerId: number | null) {
    const customer = companyCustomers.find((item) => item.id === customerId);
    setForm((current) => ({
      ...current,
      customerId,
      customerName: customer?.customer_name || "",
      currency:
        customer?.default_currency || company?.base_currency || current.currency || "SGD",
    }));
    setAllocations({});
    setCreditPaymentId(null);
  }

  function setAllocation(invoice: Invoice, value: string) {
    const maximum = balanceOf(invoice);
    const amount = Math.min(Math.max(0, safeNumber(value)), maximum);
    setAllocations((current) => ({
      ...current,
      [invoice.id]: value === "" ? "" : String(roundMoney(amount)),
    }));

    if (!form.customerId && !form.customerName) {
      setForm((current) => ({
        ...current,
        customerId: invoice.customer_id ?? null,
        customerName: invoice.customer_name,
      }));
    }
  }

  function allocateOldest() {
    if (paymentAmount <= 0) {
      setErrorMessage("Enter the received payment amount first.");
      return;
    }

    let remaining = paymentAmount;
    const next: Record<number, string> = {};

    for (const invoice of outstandingInvoices) {
      if (remaining <= 0.004) break;
      const allocated = Math.min(balanceOf(invoice), remaining);
      if (allocated > 0) {
        next[invoice.id] = allocated.toFixed(2);
        remaining = roundMoney(remaining - allocated);
      }
    }

    setAllocations(next);
    setErrorMessage("");
    setMessage("Payment allocated to the oldest outstanding invoices.");
  }

  async function recordPayment() {
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    const allocationRows = Object.entries(allocations)
      .map(([invoiceId, amount]) => ({
        invoice_id: Number(invoiceId),
        amount: roundMoney(safeNumber(amount)),
      }))
      .filter((item) => item.amount > 0);

    try {
      const response = await fetch("/api/admin/receivables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          creditPaymentId
            ? {
                action: "allocate_credit",
                payment_id: creditPaymentId,
                allocations: allocationRows,
              }
            : {
                action: "record",
                company_id: form.companyId,
                customer_id: form.customerId,
                customer_name: form.customerName,
                payment_date: form.paymentDate,
                currency: form.currency,
                amount: paymentAmount,
                payment_method: form.paymentMethod,
                payment_reference: form.paymentReference,
                notes: form.notes,
                allocations: allocationRows,
              },
        ),
      });

      const payload = (await response.json()) as {
        error?: string;
        receipt_no?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Unable to record payment.");
      }

      setAllocations({});
      setCreditPaymentId(null);
      setForm((current) => ({
        ...current,
        amount: "",
        paymentReference: "",
        notes: "",
      }));
      await load();
      setMessage(
        creditPaymentId
          ? "Customer credit allocated successfully."
          : payload.receipt_no
            ? `Payment ${payload.receipt_no} recorded successfully.`
            : "Payment recorded successfully.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to record payment.",
      );
    } finally {
      setSaving(false);
    }
  }

  function allocateCustomerCredit(payment: Payment) {
    setCreditPaymentId(payment.id);
    setForm((current) => ({
      ...current,
      companyId: payment.company_id,
      customerId: payment.customer_id ?? null,
      customerName: payment.customer_name,
      currency: payment.currency,
      amount: Number(payment.unallocated_amount || 0).toFixed(2),
      paymentReference: payment.payment_reference || "",
      notes: `Apply credit from ${payment.receipt_no || `receipt ${payment.id}`}`,
    }));
    setAllocations({});
    setMessage(
      `Allocating ${money(payment.currency, payment.unallocated_amount)} from ${payment.receipt_no || "customer credit"}.`,
    );
    setErrorMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelCreditAllocation() {
    setCreditPaymentId(null);
    setAllocations({});
    setForm((current) => ({ ...current, amount: "", notes: "" }));
    setMessage("");
  }

  async function voidPayment(payment: Payment) {
    const reason = window.prompt(
      `Enter the reason for reversing ${payment.receipt_no || `payment ${payment.id}`}:`,
    );
    if (!reason?.trim()) return;

    setMessage("");
    setErrorMessage("");

    const response = await fetch("/api/admin/receivables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "void",
        payment_id: payment.id,
        reason,
      }),
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setErrorMessage(payload.error || "Unable to reverse payment.");
      return;
    }

    await load();
    setMessage(`${payment.receipt_no || "Payment"} reversed successfully.`);
  }

  function allocationsForPayment(paymentId: number): Allocation[] {
    return data.allocations.filter((item) => item.payment_id === paymentId);
  }

  function invoiceNo(invoiceId: number): string {
    const invoice = data.invoices.find((item) => item.id === invoiceId);
    return invoice?.invoice_no || `INV-${invoiceId}`;
  }

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>FINANCE CONTROL</p>
            <h1>Accounts Receivable</h1>
            <p>
              Record customer payments, allocate receipts to invoices and review
              outstanding and overdue balances.
            </p>
          </div>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </header>

        {message ? <div className={styles.success}>{message}</div> : null}
        {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

        <section className={styles.controls}>
          <label>
            <span>Company</span>
            <select
              value={form.companyId}
              onChange={(event) => changeCompany(Number(event.target.value))}
            >
              <option value={0}>Select company</option>
              {data.companies
                .filter((item) => item.status === "active")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>

          <label>
            <span>Customer</span>
            <select
              value={form.customerId ?? 0}
              onChange={(event) =>
                changeCustomer(
                  Number(event.target.value) > 0
                    ? Number(event.target.value)
                    : null,
                )
              }
            >
              <option value={0}>All / legacy customer</option>
              {companyCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.customer_no ? `${customer.customer_no} — ` : ""}
                  {customer.customer_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Invoice, receipt, customer or reference"
            />
          </label>
        </section>

        <section className={styles.summaryGrid}>
          <article>
            <span>Outstanding</span>
            <strong>{money(form.currency, summary.outstanding)}</strong>
            <small>{companyOutstandingInvoices.length} open invoice(s)</small>
          </article>
          <article>
            <span>Overdue</span>
            <strong>{money(form.currency, summary.overdue)}</strong>
            <small>Past the invoice due date</small>
          </article>
          <article>
            <span>Payments Collected</span>
            <strong>{money(form.currency, summary.collected)}</strong>
            <small>Posted payment receipts</small>
          </article>
          <article>
            <span>Unallocated Credit</span>
            <strong>{money(form.currency, summary.unallocated)}</strong>
            <small>Received but not assigned to invoices</small>
          </article>
        </section>

        <section className={styles.workspace}>
          <article className={styles.card}>
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.eyebrow}>NEW RECEIPT</p>
                <h2>{creditPayment ? "Apply Customer Credit" : "Record Customer Payment"}</h2>
              </div>
              <div className={styles.headingActions}>
                {creditPayment ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={cancelCreditAllocation}
                  >
                    Cancel Credit
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={allocateOldest}
                >
                  Allocate Oldest First
                </button>
              </div>
            </div>

            <div className={styles.formGrid}>
              <label>
                <span>Customer name</span>
                <input
                  value={form.customerName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      customerId: null,
                      customerName: event.target.value,
                    }))
                  }
                  disabled={Boolean(selectedCustomer)}
                  placeholder="Required for legacy invoices"
                />
              </label>
              <label>
                <span>Payment date</span>
                <input
                  type="date"
                  value={form.paymentDate}
                  disabled={Boolean(creditPayment)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      paymentDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Currency</span>
                <input
                  value={form.currency}
                  maxLength={3}
                  disabled={Boolean(creditPayment)}
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      currency: event.target.value.toUpperCase(),
                    }));
                    setAllocations({});
                  }}
                />
              </label>
              <label>
                <span>Amount received</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  disabled={Boolean(creditPayment)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>Payment method</span>
                <select
                  value={form.paymentMethod}
                  disabled={Boolean(creditPayment)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      paymentMethod: event.target.value,
                    }))
                  }
                >
                  <option>PayNow</option>
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                  <option>Credit Card</option>
                  <option>Cheque</option>
                  <option>Other</option>
                </select>
              </label>
              <label>
                <span>Payment reference</span>
                <input
                  value={form.paymentReference}
                  disabled={Boolean(creditPayment)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      paymentReference: event.target.value,
                    }))
                  }
                  placeholder="Transaction or bank reference"
                />
              </label>
              <label className={styles.fullField}>
                <span>Notes</span>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className={styles.allocationSummary}>
              <div>
                <span>Received</span>
                <strong>{money(form.currency, paymentAmount)}</strong>
              </div>
              <div>
                <span>Allocated</span>
                <strong>{money(form.currency, allocatedInputTotal)}</strong>
              </div>
              <div className={unallocatedPreview < -0.004 ? styles.negative : ""}>
                <span>Unallocated</span>
                <strong>{money(form.currency, unallocatedPreview)}</strong>
              </div>
            </div>

            <button
              type="button"
              className={styles.primaryButton}
              disabled={saving || !form.companyId || paymentAmount <= 0}
              onClick={() => void recordPayment()}
            >
              {saving
                ? "Saving..."
                : creditPayment
                  ? "Apply Credit to Selected Invoices"
                  : "Record Payment & Generate Receipt"}
            </button>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHeading}>
              <div>
                <p className={styles.eyebrow}>ALLOCATION</p>
                <h2>Outstanding Invoices</h2>
              </div>
              <select
                className={styles.ageSelect}
                value={ageFilter}
                onChange={(event) => setAgeFilter(event.target.value as AgeFilter)}
              >
                <option value="all">All ageing</option>
                <option value="current">Current</option>
                <option value="1-30">1–30 days</option>
                <option value="31-60">31–60 days</option>
                <option value="61-90">61–90 days</option>
                <option value="90+">More than 90 days</option>
              </select>
            </div>

            {loading ? (
              <div className={styles.empty}>Loading outstanding invoices...</div>
            ) : outstandingInvoices.length === 0 ? (
              <div className={styles.empty}>
                No outstanding invoices match the selected filters.
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Due date</th>
                      <th>Age</th>
                      <th className={styles.number}>Total</th>
                      <th className={styles.number}>Paid</th>
                      <th className={styles.number}>Balance</th>
                      <th className={styles.allocationColumn}>Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <strong>{invoice.invoice_no || `INV-${invoice.id}`}</strong>
                          <small>{formatDate(invoice.invoice_date)}</small>
                        </td>
                        <td>{invoice.customer_name}</td>
                        <td>{formatDate(invoice.due_date)}</td>
                        <td>
                          <span className={styles.ageBadge}>
                            {daysOverdue(invoice) > 0
                              ? `${daysOverdue(invoice)} day(s)`
                              : "Current"}
                          </span>
                        </td>
                        <td className={styles.number}>
                          {money(invoice.currency, invoice.total_amount)}
                        </td>
                        <td className={styles.number}>
                          {money(invoice.currency, invoice.amount_paid)}
                        </td>
                        <td className={styles.number}>
                          <strong>{money(invoice.currency, balanceOf(invoice))}</strong>
                        </td>
                        <td>
                          <input
                            className={styles.allocationInput}
                            type="number"
                            min="0"
                            max={balanceOf(invoice)}
                            step="0.01"
                            value={allocations[invoice.id] ?? ""}
                            onChange={(event) =>
                              setAllocation(invoice, event.target.value)
                            }
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeading}>
            <div>
              <p className={styles.eyebrow}>AUDIT TRAIL</p>
              <h2>Payment History</h2>
            </div>
            <span className={styles.countBadge}>{paymentHistory.length}</span>
          </div>

          {paymentHistory.length === 0 ? (
            <div className={styles.empty}>No payment receipts recorded yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Receipt / Date</th>
                    <th>Customer</th>
                    <th>Method / Reference</th>
                    <th>Invoices</th>
                    <th className={styles.number}>Amount</th>
                    <th className={styles.number}>Unallocated</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.map((payment) => {
                    const paymentAllocations = allocationsForPayment(payment.id);
                    return (
                      <tr key={payment.id} className={payment.status === "void" ? styles.voidRow : ""}>
                        <td>
                          <strong>{payment.receipt_no || `RCPT-${payment.id}`}</strong>
                          <small>{formatDate(payment.payment_date)}</small>
                        </td>
                        <td>{payment.customer_name}</td>
                        <td>
                          <strong>{payment.payment_method}</strong>
                          <small>{payment.payment_reference || "No reference"}</small>
                        </td>
                        <td>
                          {paymentAllocations.length
                            ? paymentAllocations
                                .map((allocation) => invoiceNo(allocation.invoice_id))
                                .join(", ")
                            : "Unallocated credit"}
                        </td>
                        <td className={styles.number}>
                          {money(payment.currency, payment.amount)}
                        </td>
                        <td className={styles.number}>
                          {money(payment.currency, payment.unallocated_amount)}
                        </td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${
                              payment.status === "posted"
                                ? styles.posted
                                : styles.void
                            }`}
                          >
                            {payment.status}
                          </span>
                          {payment.void_reason ? (
                            <small>{payment.void_reason}</small>
                          ) : null}
                        </td>
                        <td>
                          <div className={styles.actions}>
                            <Link
                              href={`/receivables/receipt?id=${payment.id}`}
                              target="_blank"
                              className={styles.linkButton}
                            >
                              Receipt
                            </Link>
                            {payment.status === "posted" &&
                            Number(payment.unallocated_amount || 0) > 0 ? (
                              <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => allocateCustomerCredit(payment)}
                              >
                                Use Credit
                              </button>
                            ) : null}
                            {payment.status === "posted" ? (
                              <button
                                type="button"
                                className={styles.voidButton}
                                onClick={() => void voidPayment(payment)}
                              >
                                Reverse
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
