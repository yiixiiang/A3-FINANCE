"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate } from "@/lib/format-date";
import styles from "./payables.module.css";

type Company = {
  id: number;
  name: string;
  status: string;
  base_currency?: string | null;
};

type Supplier = {
  id: number;
  company_id: number;
  supplier_no?: string | null;
  supplier_name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  billing_address?: string | null;
  uen?: string | null;
  default_currency: string;
  payment_terms_days: number;
  bank_name?: string | null;
  bank_account_name?: string | null;
  bank_account_no?: string | null;
  paynow_details?: string | null;
  status: "active" | "inactive";
  notes?: string | null;
};

type Bill = {
  id: number;
  bill_no?: string | null;
  company_id: number;
  supplier_id: number;
  supplier_name: string;
  supplier_invoice_no?: string | null;
  bill_date: string;
  due_date?: string | null;
  currency: string;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  amount_paid: number;
  credit_applied: number;
  status: "draft" | "open" | "partial" | "paid" | "overdue" | "cancelled";
  expense_category?: string | null;
  reference?: string | null;
  description?: string | null;
  notes?: string | null;
  cancelled_reason?: string | null;
};

type Payment = {
  id: number;
  voucher_no?: string | null;
  company_id: number;
  supplier_id: number;
  supplier_name: string;
  payment_date: string;
  currency: string;
  amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  payment_method: string;
  payment_reference?: string | null;
  bank_account?: string | null;
  status: "posted" | "void";
  notes?: string | null;
  void_reason?: string | null;
};

type PaymentAllocation = {
  id: number;
  payment_id: number;
  bill_id: number;
  allocated_amount: number;
};

type CreditNote = {
  id: number;
  credit_note_no?: string | null;
  company_id: number;
  supplier_id: number;
  supplier_name: string;
  credit_date: string;
  currency: string;
  amount: number;
  applied_amount: number;
  unapplied_amount: number;
  supplier_reference?: string | null;
  reason: string;
  status: "posted" | "void";
  notes?: string | null;
  void_reason?: string | null;
};

type CreditAllocation = {
  id: number;
  credit_note_id: number;
  bill_id: number;
  allocated_amount: number;
};

type ApiData = {
  companies: Company[];
  suppliers: Supplier[];
  bills: Bill[];
  payments: Payment[];
  paymentAllocations: PaymentAllocation[];
  credits: CreditNote[];
  creditAllocations: CreditAllocation[];
};

type Tab = "suppliers" | "bills" | "payments" | "credits";
type AgeBucket = "all" | "current" | "1-30" | "31-60" | "61-90" | "90+";

const emptyData: ApiData = {
  companies: [],
  suppliers: [],
  bills: [],
  payments: [],
  paymentAllocations: [],
  credits: [],
  creditAllocations: [],
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function safeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalise(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function money(currency: string | null | undefined, amount: number) {
  return `${(currency || "SGD").toUpperCase()} ${safeNumber(amount).toFixed(2)}`;
}

function billBalance(bill: Bill) {
  return Math.max(
    0,
    roundMoney(
      safeNumber(bill.total_amount) -
        safeNumber(bill.amount_paid) -
        safeNumber(bill.credit_applied),
    ),
  );
}

function daysOverdue(bill: Bill) {
  if (!bill.due_date || billBalance(bill) <= 0) return 0;
  const due = new Date(`${bill.due_date}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
}

function bucketOf(bill: Bill): Exclude<AgeBucket, "all"> {
  const days = daysOverdue(bill);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function datePlusDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function emptySupplier(companyId = 0, currency = "SGD") {
  return {
    id: 0,
    companyId,
    supplierNo: "",
    supplierName: "",
    contactPerson: "",
    email: "",
    phone: "",
    billingAddress: "",
    uen: "",
    defaultCurrency: currency,
    paymentTermsDays: "30",
    bankName: "",
    bankAccountName: "",
    bankAccountNo: "",
    paynowDetails: "",
    status: "active" as "active" | "inactive",
    notes: "",
  };
}

function emptyBill(companyId = 0, supplierId = 0, currency = "SGD", terms = 30) {
  const billDate = todayIso();
  return {
    id: 0,
    companyId,
    supplierId,
    supplierInvoiceNo: "",
    billDate,
    dueDate: datePlusDays(billDate, terms),
    currency,
    subtotal: "",
    gstAmount: "",
    totalAmount: "",
    expenseCategory: "General Expense",
    reference: "",
    description: "",
    notes: "",
  };
}

function emptyPayment(companyId = 0, supplierId = 0, currency = "SGD") {
  return {
    companyId,
    supplierId,
    paymentDate: todayIso(),
    currency,
    amount: "",
    paymentMethod: "Bank Transfer",
    paymentReference: "",
    bankAccount: "",
    notes: "",
  };
}

function emptyCredit(companyId = 0, supplierId = 0, currency = "SGD") {
  return {
    companyId,
    supplierId,
    creditDate: todayIso(),
    currency,
    amount: "",
    supplierReference: "",
    reason: "",
    notes: "",
  };
}

export default function PayablesPage() {
  const [data, setData] = useState<ApiData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>("bills");
  const [companyId, setCompanyId] = useState(0);
  const [supplierId, setSupplierId] = useState(0);
  const [search, setSearch] = useState("");
  const [ageFilter, setAgeFilter] = useState<AgeBucket>("all");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [supplierForm, setSupplierForm] = useState(emptySupplier());
  const [billForm, setBillForm] = useState(emptyBill());
  const [paymentForm, setPaymentForm] = useState(emptyPayment());
  const [creditForm, setCreditForm] = useState(emptyCredit());
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const [paymentCreditId, setPaymentCreditId] = useState<number | null>(null);
  const [creditNoteId, setCreditNoteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch("/api/admin/payables", { cache: "no-store" });
      const payload = (await response.json()) as ApiData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to load accounts payable.");
      setData({
        companies: payload.companies ?? [],
        suppliers: payload.suppliers ?? [],
        bills: payload.bills ?? [],
        payments: payload.payments ?? [],
        paymentAllocations: payload.paymentAllocations ?? [],
        credits: payload.credits ?? [],
        creditAllocations: payload.creditAllocations ?? [],
      });
      setCompanyId((current) => {
        if (current) return current;
        return (payload.companies ?? []).find((item) => item.status === "active")?.id ?? 0;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load accounts payable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const company = useMemo(
    () => data.companies.find((item) => item.id === companyId) ?? null,
    [companyId, data.companies],
  );

  const companySuppliers = useMemo(
    () => data.suppliers.filter((item) => item.company_id === companyId),
    [companyId, data.suppliers],
  );

  const activeSuppliers = useMemo(
    () => companySuppliers.filter((item) => item.status === "active"),
    [companySuppliers],
  );

  const supplier = useMemo(
    () => companySuppliers.find((item) => item.id === supplierId) ?? null,
    [companySuppliers, supplierId],
  );

  useEffect(() => {
    const currency = company?.base_currency || "SGD";
    setSupplierForm((current) => (current.id ? current : emptySupplier(companyId, currency)));
    if (supplierId && !companySuppliers.some((item) => item.id === supplierId)) {
      setSupplierId(0);
    }
  }, [company?.base_currency, companyId, companySuppliers, supplierId]);

  useEffect(() => {
    const selected = companySuppliers.find((item) => item.id === supplierId);
    const currency = selected?.default_currency || company?.base_currency || "SGD";
    const terms = Number(selected?.payment_terms_days ?? 30);
    setBillForm((current) => (current.id ? current : emptyBill(companyId, supplierId, currency, terms)));
    setPaymentForm((current) =>
      paymentCreditId ? current : emptyPayment(companyId, supplierId, currency),
    );
    setCreditForm((current) =>
      creditNoteId ? current : emptyCredit(companyId, supplierId, currency),
    );
    setAllocations({});
  }, [company?.base_currency, companyId, companySuppliers, creditNoteId, paymentCreditId, supplierId]);

  const companyBills = useMemo(
    () => data.bills.filter((bill) => bill.company_id === companyId),
    [companyId, data.bills],
  );

  const outstandingBills = useMemo(() => {
    const query = normalise(search);
    return companyBills
      .filter((bill) => bill.status !== "cancelled" && billBalance(bill) > 0.004)
      .filter((bill) => !supplierId || bill.supplier_id === supplierId)
      .filter((bill) => ageFilter === "all" || bucketOf(bill) === ageFilter)
      .filter((bill) => {
        if (!query) return true;
        return [
          bill.bill_no,
          bill.supplier_invoice_no,
          bill.supplier_name,
          bill.reference,
          bill.description,
        ]
          .map(normalise)
          .some((value) => value.includes(query));
      })
      .sort((a, b) => {
        const first = a.due_date || a.bill_date;
        const second = b.due_date || b.bill_date;
        return first.localeCompare(second) || a.id - b.id;
      });
  }, [ageFilter, companyBills, search, supplierId]);

  const supplierOutstandingBills = useMemo(
    () =>
      companyBills
        .filter(
          (bill) =>
            bill.supplier_id === supplierId &&
            bill.status !== "cancelled" &&
            billBalance(bill) > 0.004,
        )
        .filter((bill) => {
          const currency =
            tab === "credits" ? creditForm.currency : paymentForm.currency;
          return bill.currency.toUpperCase() === currency.toUpperCase();
        })
        .sort((a, b) => (a.due_date || a.bill_date).localeCompare(b.due_date || b.bill_date)),
    [companyBills, creditForm.currency, paymentForm.currency, supplierId, tab],
  );

  const summary = useMemo(() => {
    const open = companyBills.filter(
      (bill) => bill.status !== "cancelled" && billBalance(bill) > 0.004,
    );
    const outstanding = open.reduce((sum, bill) => sum + billBalance(bill), 0);
    const overdue = open
      .filter((bill) => daysOverdue(bill) > 0)
      .reduce((sum, bill) => sum + billBalance(bill), 0);
    const dueSoon = open
      .filter((bill) => {
        if (!bill.due_date) return false;
        const due = new Date(`${bill.due_date}T00:00:00`);
        const today = new Date(`${todayIso()}T00:00:00`);
        const days = Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
        return days >= 0 && days <= 7;
      })
      .reduce((sum, bill) => sum + billBalance(bill), 0);
    const availableCredits = data.credits
      .filter((credit) => credit.company_id === companyId && credit.status === "posted")
      .reduce((sum, credit) => sum + safeNumber(credit.unapplied_amount), 0);
    const unallocatedPayments = data.payments
      .filter((payment) => payment.company_id === companyId && payment.status === "posted")
      .reduce((sum, payment) => sum + safeNumber(payment.unallocated_amount), 0);
    return { outstanding, overdue, dueSoon, availableCredits, unallocatedPayments };
  }, [companyBills, companyId, data.credits, data.payments]);

  const allocationTotal = useMemo(
    () =>
      roundMoney(
        Object.values(allocations).reduce((sum, value) => sum + safeNumber(value), 0),
      ),
    [allocations],
  );

  const sourceAmount =
    tab === "credits" ? safeNumber(creditForm.amount) : safeNumber(paymentForm.amount);

  function changeCompany(nextCompanyId: number) {
    const next = data.companies.find((item) => item.id === nextCompanyId);
    setCompanyId(nextCompanyId);
    setSupplierId(0);
    setSupplierForm(emptySupplier(nextCompanyId, next?.base_currency || "SGD"));
    setBillForm(emptyBill(nextCompanyId, 0, next?.base_currency || "SGD", 30));
    setPaymentForm(emptyPayment(nextCompanyId, 0, next?.base_currency || "SGD"));
    setCreditForm(emptyCredit(nextCompanyId, 0, next?.base_currency || "SGD"));
    setAllocations({});
    setPaymentCreditId(null);
    setCreditNoteId(null);
    setMessage("");
    setErrorMessage("");
  }

  function selectSupplier(nextSupplierId: number) {
    setSupplierId(nextSupplierId);
    setPaymentCreditId(null);
    setCreditNoteId(null);
    setAllocations({});
  }

  function editSupplier(item: Supplier) {
    setSupplierId(item.id);
    setSupplierForm({
      id: item.id,
      companyId: item.company_id,
      supplierNo: item.supplier_no || "",
      supplierName: item.supplier_name,
      contactPerson: item.contact_person || "",
      email: item.email || "",
      phone: item.phone || "",
      billingAddress: item.billing_address || "",
      uen: item.uen || "",
      defaultCurrency: item.default_currency || "SGD",
      paymentTermsDays: String(item.payment_terms_days ?? 30),
      bankName: item.bank_name || "",
      bankAccountName: item.bank_account_name || "",
      bankAccountNo: item.bank_account_no || "",
      paynowDetails: item.paynow_details || "",
      status: item.status,
      notes: item.notes || "",
    });
    setTab("suppliers");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/payables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown> & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to save accounts payable data.");
    return payload;
  }

  async function saveSupplier() {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      await post({
        action: "save_supplier",
        id: supplierForm.id || undefined,
        company_id: supplierForm.companyId || companyId,
        supplier_no: supplierForm.supplierNo,
        supplier_name: supplierForm.supplierName,
        contact_person: supplierForm.contactPerson,
        email: supplierForm.email,
        phone: supplierForm.phone,
        billing_address: supplierForm.billingAddress,
        uen: supplierForm.uen,
        default_currency: supplierForm.defaultCurrency,
        payment_terms_days: Number(supplierForm.paymentTermsDays),
        bank_name: supplierForm.bankName,
        bank_account_name: supplierForm.bankAccountName,
        bank_account_no: supplierForm.bankAccountNo,
        paynow_details: supplierForm.paynowDetails,
        status: supplierForm.status,
        notes: supplierForm.notes,
      });
      await load();
      setSupplierForm(emptySupplier(companyId, company?.base_currency || "SGD"));
      setMessage(supplierForm.id ? "Supplier profile updated." : "Supplier profile created.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save supplier.");
    } finally {
      setSaving(false);
    }
  }

  function editBill(bill: Bill) {
    setSupplierId(bill.supplier_id);
    setBillForm({
      id: bill.id,
      companyId: bill.company_id,
      supplierId: bill.supplier_id,
      supplierInvoiceNo: bill.supplier_invoice_no || "",
      billDate: bill.bill_date,
      dueDate: bill.due_date || "",
      currency: bill.currency,
      subtotal: String(bill.subtotal),
      gstAmount: String(bill.gst_amount),
      totalAmount: String(bill.total_amount),
      expenseCategory: bill.expense_category || "General Expense",
      reference: bill.reference || "",
      description: bill.description || "",
      notes: bill.notes || "",
    });
    setTab("bills");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveBill() {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const payload = await post({
        action: "save_bill",
        id: billForm.id || undefined,
        company_id: billForm.companyId || companyId,
        supplier_id: billForm.supplierId || supplierId,
        supplier_invoice_no: billForm.supplierInvoiceNo,
        bill_date: billForm.billDate,
        due_date: billForm.dueDate,
        currency: billForm.currency,
        subtotal: safeNumber(billForm.subtotal),
        gst_amount: safeNumber(billForm.gstAmount),
        total_amount: safeNumber(billForm.totalAmount),
        expense_category: billForm.expenseCategory,
        reference: billForm.reference,
        description: billForm.description,
        notes: billForm.notes,
      });
      await load();
      setBillForm(
        emptyBill(
          companyId,
          supplierId,
          supplier?.default_currency || company?.base_currency || "SGD",
          supplier?.payment_terms_days ?? 30,
        ),
      );
      const savedBill = payload.bill as Bill | undefined;
      setMessage(
        savedBill?.bill_no
          ? `Supplier bill ${savedBill.bill_no} saved.`
          : "Supplier bill saved.",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save supplier bill.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelBill(bill: Bill) {
    const reason = window.prompt(`Enter the reason for cancelling ${bill.bill_no || "this bill"}:`);
    if (!reason?.trim()) return;
    try {
      await post({ action: "cancel_bill", id: bill.id, reason });
      await load();
      setMessage(`${bill.bill_no || "Supplier bill"} cancelled.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to cancel supplier bill.");
    }
  }

  function setAllocation(bill: Bill, value: string) {
    const amount = Math.min(Math.max(0, safeNumber(value)), billBalance(bill));
    setAllocations((current) => ({
      ...current,
      [bill.id]: value === "" ? "" : String(roundMoney(amount)),
    }));
  }

  function allocateOldest() {
    if (sourceAmount <= 0) {
      setErrorMessage(`Enter the ${tab === "credits" ? "credit" : "payment"} amount first.`);
      return;
    }
    let remaining = sourceAmount;
    const next: Record<number, string> = {};
    for (const bill of supplierOutstandingBills) {
      if (remaining <= 0.004) break;
      const amount = Math.min(remaining, billBalance(bill));
      if (amount > 0) {
        next[bill.id] = amount.toFixed(2);
        remaining = roundMoney(remaining - amount);
      }
    }
    setAllocations(next);
    setErrorMessage("");
    setMessage("Allocated to the oldest outstanding supplier bills.");
  }

  function allocationRows() {
    return Object.entries(allocations)
      .map(([billId, amount]) => ({ bill_id: Number(billId), amount: roundMoney(safeNumber(amount)) }))
      .filter((item) => item.amount > 0);
  }

  async function recordPayment() {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const payload = await post(
        paymentCreditId
          ? {
              action: "allocate_payment_credit",
              payment_id: paymentCreditId,
              allocations: allocationRows(),
            }
          : {
              action: "record_payment",
              company_id: companyId,
              supplier_id: supplierId,
              payment_date: paymentForm.paymentDate,
              currency: paymentForm.currency,
              amount: safeNumber(paymentForm.amount),
              payment_method: paymentForm.paymentMethod,
              payment_reference: paymentForm.paymentReference,
              bank_account: paymentForm.bankAccount,
              notes: paymentForm.notes,
              allocations: allocationRows(),
            },
      );
      await load();
      setAllocations({});
      setPaymentCreditId(null);
      setPaymentForm(
        emptyPayment(companyId, supplierId, supplier?.default_currency || company?.base_currency || "SGD"),
      );
      setMessage(
        paymentCreditId
          ? "Unallocated supplier payment applied successfully."
          : payload.voucher_no
            ? `Payment ${String(payload.voucher_no)} recorded.`
            : "Supplier payment recorded.",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to record supplier payment.");
    } finally {
      setSaving(false);
    }
  }

  function allocatePaymentCredit(payment: Payment) {
    setTab("payments");
    setCompanyId(payment.company_id);
    setSupplierId(payment.supplier_id);
    setPaymentCreditId(payment.id);
    setCreditNoteId(null);
    setPaymentForm({
      companyId: payment.company_id,
      supplierId: payment.supplier_id,
      paymentDate: payment.payment_date,
      currency: payment.currency,
      amount: safeNumber(payment.unallocated_amount).toFixed(2),
      paymentMethod: payment.payment_method,
      paymentReference: payment.payment_reference || "",
      bankAccount: payment.bank_account || "",
      notes: `Apply unallocated amount from ${payment.voucher_no || "supplier payment"}`,
    });
    setAllocations({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function voidPayment(payment: Payment) {
    const reason = window.prompt(`Enter the reason for reversing ${payment.voucher_no || "this payment"}:`);
    if (!reason?.trim()) return;
    try {
      await post({ action: "void_payment", payment_id: payment.id, reason });
      await load();
      setMessage(`${payment.voucher_no || "Supplier payment"} reversed.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to reverse supplier payment.");
    }
  }

  async function recordCredit() {
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const payload = await post(
        creditNoteId
          ? {
              action: "allocate_credit",
              credit_note_id: creditNoteId,
              allocations: allocationRows(),
            }
          : {
              action: "record_credit",
              company_id: companyId,
              supplier_id: supplierId,
              credit_date: creditForm.creditDate,
              currency: creditForm.currency,
              amount: safeNumber(creditForm.amount),
              supplier_reference: creditForm.supplierReference,
              reason: creditForm.reason,
              notes: creditForm.notes,
              allocations: allocationRows(),
            },
      );
      await load();
      setAllocations({});
      setCreditNoteId(null);
      setCreditForm(
        emptyCredit(companyId, supplierId, supplier?.default_currency || company?.base_currency || "SGD"),
      );
      setMessage(
        creditNoteId
          ? "Supplier credit allocated successfully."
          : payload.credit_note_no
            ? `Credit note ${String(payload.credit_note_no)} recorded.`
            : "Supplier credit note recorded.",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to record supplier credit.");
    } finally {
      setSaving(false);
    }
  }

  function allocateCreditNote(credit: CreditNote) {
    setTab("credits");
    setCompanyId(credit.company_id);
    setSupplierId(credit.supplier_id);
    setCreditNoteId(credit.id);
    setPaymentCreditId(null);
    setCreditForm({
      companyId: credit.company_id,
      supplierId: credit.supplier_id,
      creditDate: credit.credit_date,
      currency: credit.currency,
      amount: safeNumber(credit.unapplied_amount).toFixed(2),
      supplierReference: credit.supplier_reference || "",
      reason: credit.reason,
      notes: `Apply remaining credit from ${credit.credit_note_no || "supplier credit note"}`,
    });
    setAllocations({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function voidCredit(credit: CreditNote) {
    const reason = window.prompt(`Enter the reason for reversing ${credit.credit_note_no || "this credit note"}:`);
    if (!reason?.trim()) return;
    try {
      await post({ action: "void_credit", credit_note_id: credit.id, reason });
      await load();
      setMessage(`${credit.credit_note_no || "Supplier credit note"} reversed.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to reverse supplier credit.");
    }
  }

  const visibleSuppliers = companySuppliers.filter((item) => {
    const query = normalise(search);
    if (!query) return true;
    return [item.supplier_no, item.supplier_name, item.contact_person, item.phone, item.email]
      .map(normalise)
      .some((value) => value.includes(query));
  });

  const visiblePayments = data.payments.filter(
    (item) => item.company_id === companyId && (!supplierId || item.supplier_id === supplierId),
  );
  const visibleCredits = data.credits.filter(
    (item) => item.company_id === companyId && (!supplierId || item.supplier_id === supplierId),
  );

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>FINANCE CONTROL</p>
            <h1>Accounts Payable</h1>
            <p>
              Manage suppliers, record bills, allocate payments and monitor overdue
              obligations and supplier credits.
            </p>
          </div>
          <button type="button" className={styles.refreshButton} onClick={() => void load()}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </header>

        {message ? <div className={styles.success}>{message}</div> : null}
        {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

        <section className={styles.controls}>
          <label>
            <span>Company</span>
            <select value={companyId} onChange={(event) => changeCompany(Number(event.target.value))}>
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
            <span>Supplier</span>
            <select value={supplierId} onChange={(event) => selectSupplier(Number(event.target.value))}>
              <option value={0}>All suppliers</option>
              {activeSuppliers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.supplier_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Supplier, bill, reference or description"
            />
          </label>
        </section>

        <section className={styles.summaryGrid}>
          <article>
            <span>Total outstanding</span>
            <strong>{money(company?.base_currency, summary.outstanding)}</strong>
            <small>Open supplier bill balance</small>
          </article>
          <article>
            <span>Overdue</span>
            <strong>{money(company?.base_currency, summary.overdue)}</strong>
            <small>Past due obligations</small>
          </article>
          <article>
            <span>Due within 7 days</span>
            <strong>{money(company?.base_currency, summary.dueSoon)}</strong>
            <small>Upcoming cash requirement</small>
          </article>
          <article>
            <span>Available credits</span>
            <strong>{money(company?.base_currency, summary.availableCredits)}</strong>
            <small>Unapplied supplier credit notes</small>
          </article>
          <article>
            <span>Unallocated payments</span>
            <strong>{money(company?.base_currency, summary.unallocatedPayments)}</strong>
            <small>Advance or excess supplier payments</small>
          </article>
        </section>

        <nav className={styles.tabs} aria-label="Accounts payable sections">
          {([
            ["suppliers", "Suppliers"],
            ["bills", "Supplier Bills"],
            ["payments", "Payments"],
            ["credits", "Credit Notes"],
          ] as Array<[Tab, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={tab === value ? styles.activeTab : ""}
              onClick={() => {
                setTab(value);
                setAllocations({});
                setMessage("");
                setErrorMessage("");
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === "suppliers" ? (
          <section className={styles.workspace}>
            <article className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <h2>{supplierForm.id ? "Edit Supplier" : "New Supplier"}</h2>
                  <p>Supplier contact, payment terms and bank information.</p>
                </div>
                {supplierForm.id ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setSupplierForm(emptySupplier(companyId, company?.base_currency || "SGD"))}
                  >
                    New Supplier
                  </button>
                ) : null}
              </div>
              <div className={styles.formGrid}>
                <label><span>Supplier number</span><input value={supplierForm.supplierNo} onChange={(e) => setSupplierForm({ ...supplierForm, supplierNo: e.target.value })} placeholder="Auto if blank" /></label>
                <label><span>Supplier name</span><input value={supplierForm.supplierName} onChange={(e) => setSupplierForm({ ...supplierForm, supplierName: e.target.value })} /></label>
                <label><span>Contact person</span><input value={supplierForm.contactPerson} onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })} /></label>
                <label><span>Phone</span><input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></label>
                <label><span>Email</span><input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></label>
                <label><span>UEN / Registration</span><input value={supplierForm.uen} onChange={(e) => setSupplierForm({ ...supplierForm, uen: e.target.value })} /></label>
                <label><span>Default currency</span><input maxLength={3} value={supplierForm.defaultCurrency} onChange={(e) => setSupplierForm({ ...supplierForm, defaultCurrency: e.target.value.toUpperCase() })} /></label>
                <label><span>Payment terms days</span><input type="number" min="0" value={supplierForm.paymentTermsDays} onChange={(e) => setSupplierForm({ ...supplierForm, paymentTermsDays: e.target.value })} /></label>
                <label><span>Bank name</span><input value={supplierForm.bankName} onChange={(e) => setSupplierForm({ ...supplierForm, bankName: e.target.value })} /></label>
                <label><span>Bank account name</span><input value={supplierForm.bankAccountName} onChange={(e) => setSupplierForm({ ...supplierForm, bankAccountName: e.target.value })} /></label>
                <label><span>Bank account number</span><input value={supplierForm.bankAccountNo} onChange={(e) => setSupplierForm({ ...supplierForm, bankAccountNo: e.target.value })} /></label>
                <label><span>PayNow details</span><input value={supplierForm.paynowDetails} onChange={(e) => setSupplierForm({ ...supplierForm, paynowDetails: e.target.value })} /></label>
                <label className={styles.fullField}><span>Billing address</span><textarea rows={3} value={supplierForm.billingAddress} onChange={(e) => setSupplierForm({ ...supplierForm, billingAddress: e.target.value })} /></label>
                <label><span>Status</span><select value={supplierForm.status} onChange={(e) => setSupplierForm({ ...supplierForm, status: e.target.value as "active" | "inactive" })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
                <label><span>Notes</span><input value={supplierForm.notes} onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })} /></label>
              </div>
              <button type="button" className={styles.primaryButton} disabled={saving || !companyId} onClick={() => void saveSupplier()}>
                {saving ? "Saving..." : supplierForm.id ? "Update Supplier" : "Create Supplier"}
              </button>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeading}><div><h2>Supplier Directory</h2><p>{visibleSuppliers.length} supplier profile(s)</p></div></div>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Supplier</th><th>Contact</th><th>Terms</th><th>Bank</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {visibleSuppliers.map((item) => (
                      <tr key={item.id}>
                        <td><strong>{item.supplier_name}</strong><small>{item.supplier_no || "-"} · {item.default_currency}</small></td>
                        <td>{item.contact_person || "-"}<small>{item.phone || item.email || "-"}</small></td>
                        <td>{item.payment_terms_days} days</td>
                        <td>{item.bank_name || "-"}<small>{item.bank_account_no || item.paynow_details || "-"}</small></td>
                        <td><span className={`${styles.status} ${styles[item.status]}`}>{item.status}</span></td>
                        <td><button type="button" className={styles.linkButton} onClick={() => editSupplier(item)}>Edit</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {tab === "bills" ? (
          <>
            <section className={styles.workspace}>
              <article className={styles.card}>
                <div className={styles.cardHeading}>
                  <div><h2>{billForm.id ? "Edit Supplier Bill" : "New Supplier Bill"}</h2><p>Capture the supplier invoice and payment due date.</p></div>
                  {billForm.id ? <button type="button" className={styles.secondaryButton} onClick={() => setBillForm(emptyBill(companyId, supplierId, supplier?.default_currency || company?.base_currency || "SGD", supplier?.payment_terms_days ?? 30))}>New Bill</button> : null}
                </div>
                <div className={styles.formGrid}>
                  <label><span>Supplier</span><select value={billForm.supplierId || supplierId} onChange={(e) => { const id = Number(e.target.value); selectSupplier(id); setBillForm({ ...billForm, supplierId: id }); }}><option value={0}>Select supplier</option>{activeSuppliers.map((item) => <option key={item.id} value={item.id}>{item.supplier_name}</option>)}</select></label>
                  <label><span>Supplier invoice no.</span><input value={billForm.supplierInvoiceNo} onChange={(e) => setBillForm({ ...billForm, supplierInvoiceNo: e.target.value })} /></label>
                  <label><span>Bill date</span><input type="date" value={billForm.billDate} onChange={(e) => setBillForm({ ...billForm, billDate: e.target.value, dueDate: datePlusDays(e.target.value, supplier?.payment_terms_days ?? 30) })} /></label>
                  <label><span>Due date</span><input type="date" value={billForm.dueDate} onChange={(e) => setBillForm({ ...billForm, dueDate: e.target.value })} /></label>
                  <label><span>Currency</span><input maxLength={3} value={billForm.currency} onChange={(e) => setBillForm({ ...billForm, currency: e.target.value.toUpperCase() })} /></label>
                  <label><span>Expense category</span><input value={billForm.expenseCategory} onChange={(e) => setBillForm({ ...billForm, expenseCategory: e.target.value })} /></label>
                  <label><span>Subtotal</span><input type="number" min="0" step="0.01" value={billForm.subtotal} onChange={(e) => { const subtotal = e.target.value; setBillForm({ ...billForm, subtotal, totalAmount: roundMoney(safeNumber(subtotal) + safeNumber(billForm.gstAmount)).toFixed(2) }); }} /></label>
                  <label><span>GST amount</span><input type="number" min="0" step="0.01" value={billForm.gstAmount} onChange={(e) => { const gstAmount = e.target.value; setBillForm({ ...billForm, gstAmount, totalAmount: roundMoney(safeNumber(billForm.subtotal) + safeNumber(gstAmount)).toFixed(2) }); }} /></label>
                  <label><span>Total amount</span><input type="number" min="0.01" step="0.01" value={billForm.totalAmount} onChange={(e) => setBillForm({ ...billForm, totalAmount: e.target.value })} /></label>
                  <label><span>Reference</span><input value={billForm.reference} onChange={(e) => setBillForm({ ...billForm, reference: e.target.value })} /></label>
                  <label className={styles.fullField}><span>Description</span><textarea rows={3} value={billForm.description} onChange={(e) => setBillForm({ ...billForm, description: e.target.value })} /></label>
                  <label className={styles.fullField}><span>Notes</span><textarea rows={2} value={billForm.notes} onChange={(e) => setBillForm({ ...billForm, notes: e.target.value })} /></label>
                </div>
                <button type="button" className={styles.primaryButton} disabled={saving || !companyId || !(billForm.supplierId || supplierId)} onClick={() => void saveBill()}>{saving ? "Saving..." : billForm.id ? "Update Supplier Bill" : "Record Supplier Bill"}</button>
              </article>

              <article className={styles.card}>
                <div className={styles.cardHeading}><div><h2>Payable Ageing</h2><p>Outstanding supplier bills by due date.</p></div><select className={styles.ageSelect} value={ageFilter} onChange={(e) => setAgeFilter(e.target.value as AgeBucket)}><option value="all">All ages</option><option value="current">Current</option><option value="1-30">1–30 days</option><option value="31-60">31–60 days</option><option value="61-90">61–90 days</option><option value="90+">90+ days</option></select></div>
                <div className={styles.ageingGrid}>
                  {(["current", "1-30", "31-60", "61-90", "90+"] as const).map((age) => {
                    const amount = companyBills.filter((bill) => bill.status !== "cancelled" && billBalance(bill) > 0 && bucketOf(bill) === age).reduce((sum, bill) => sum + billBalance(bill), 0);
                    return <div key={age}><span>{age === "current" ? "Current" : `${age} days`}</span><strong>{money(company?.base_currency, amount)}</strong></div>;
                  })}
                </div>
              </article>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeading}><div><h2>Outstanding Supplier Bills</h2><p>{outstandingBills.length} bill(s) match the selected filters.</p></div></div>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Bill</th><th>Supplier</th><th>Dates</th><th>Total</th><th>Paid / Credit</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {outstandingBills.map((bill) => (
                      <tr key={bill.id}>
                        <td><strong>{bill.bill_no || `BILL-${bill.id}`}</strong><small>Supplier ref: {bill.supplier_invoice_no || "-"}</small></td>
                        <td>{bill.supplier_name}<small>{bill.description || bill.expense_category || "-"}</small></td>
                        <td>{formatDate(bill.bill_date)}<small>Due {formatDate(bill.due_date)}</small></td>
                        <td>{money(bill.currency, bill.total_amount)}</td>
                        <td>{money(bill.currency, bill.amount_paid)}<small>Credit {money(bill.currency, bill.credit_applied)}</small></td>
                        <td><strong>{money(bill.currency, billBalance(bill))}</strong><small>{daysOverdue(bill) ? `${daysOverdue(bill)} days overdue` : "Current"}</small></td>
                        <td><span className={`${styles.status} ${styles[bill.status]}`}>{bill.status}</span></td>
                        <td><div className={styles.rowActions}><button type="button" className={styles.linkButton} onClick={() => editBill(bill)}>Edit</button><button type="button" className={styles.voidButton} onClick={() => void cancelBill(bill)}>Cancel</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}

        {tab === "payments" || tab === "credits" ? (
          <section className={styles.workspace}>
            <article className={styles.card}>
              <div className={styles.cardHeading}>
                <div>
                  <h2>{tab === "payments" ? (paymentCreditId ? "Allocate Unallocated Payment" : "Record Supplier Payment") : (creditNoteId ? "Allocate Supplier Credit" : "Record Supplier Credit Note")}</h2>
                  <p>Allocate now or retain the unused amount for a future bill.</p>
                </div>
                {(paymentCreditId || creditNoteId) ? <button type="button" className={styles.secondaryButton} onClick={() => { setPaymentCreditId(null); setCreditNoteId(null); setAllocations({}); setPaymentForm(emptyPayment(companyId, supplierId, supplier?.default_currency || company?.base_currency || "SGD")); setCreditForm(emptyCredit(companyId, supplierId, supplier?.default_currency || company?.base_currency || "SGD")); }}>Cancel Allocation</button> : null}
              </div>
              <div className={styles.formGrid}>
                <label><span>Supplier</span><select value={supplierId} disabled={Boolean(paymentCreditId || creditNoteId)} onChange={(e) => selectSupplier(Number(e.target.value))}><option value={0}>Select supplier</option>{activeSuppliers.map((item) => <option key={item.id} value={item.id}>{item.supplier_name}</option>)}</select></label>
                <label><span>Currency</span><input maxLength={3} disabled={Boolean(paymentCreditId || creditNoteId)} value={tab === "payments" ? paymentForm.currency : creditForm.currency} onChange={(e) => tab === "payments" ? setPaymentForm({ ...paymentForm, currency: e.target.value.toUpperCase() }) : setCreditForm({ ...creditForm, currency: e.target.value.toUpperCase() })} /></label>
                <label><span>{tab === "payments" ? "Payment date" : "Credit date"}</span><input type="date" disabled={Boolean(paymentCreditId || creditNoteId)} value={tab === "payments" ? paymentForm.paymentDate : creditForm.creditDate} onChange={(e) => tab === "payments" ? setPaymentForm({ ...paymentForm, paymentDate: e.target.value }) : setCreditForm({ ...creditForm, creditDate: e.target.value })} /></label>
                <label><span>{tab === "payments" ? "Payment amount" : "Credit amount"}</span><input type="number" min="0.01" step="0.01" disabled={Boolean(paymentCreditId || creditNoteId)} value={tab === "payments" ? paymentForm.amount : creditForm.amount} onChange={(e) => {
                  setAllocations({});
                  if (tab === "payments") {
                    setPaymentForm({ ...paymentForm, amount: e.target.value });
                  } else {
                    setCreditForm({ ...creditForm, amount: e.target.value });
                  }
                }} /></label>
                {tab === "payments" ? <><label><span>Payment method</span><select disabled={Boolean(paymentCreditId)} value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}><option>Bank Transfer</option><option>PayNow</option><option>Cheque</option><option>Cash</option><option>Credit Card</option><option>Other</option></select></label><label><span>Payment reference</span><input disabled={Boolean(paymentCreditId)} value={paymentForm.paymentReference} onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })} /></label><label className={styles.fullField}><span>Bank / cash account</span><input disabled={Boolean(paymentCreditId)} value={paymentForm.bankAccount} onChange={(e) => setPaymentForm({ ...paymentForm, bankAccount: e.target.value })} /></label></> : <><label><span>Supplier credit reference</span><input disabled={Boolean(creditNoteId)} value={creditForm.supplierReference} onChange={(e) => setCreditForm({ ...creditForm, supplierReference: e.target.value })} /></label><label><span>Credit reason</span><input disabled={Boolean(creditNoteId)} value={creditForm.reason} onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })} /></label></>}
                <label className={styles.fullField}><span>Notes</span><textarea rows={2} value={tab === "payments" ? paymentForm.notes : creditForm.notes} onChange={(e) => tab === "payments" ? setPaymentForm({ ...paymentForm, notes: e.target.value }) : setCreditForm({ ...creditForm, notes: e.target.value })} /></label>
              </div>
              <div className={styles.allocationSummary}><div><span>Source amount</span><strong>{money(tab === "payments" ? paymentForm.currency : creditForm.currency, sourceAmount)}</strong></div><div><span>Allocated</span><strong>{money(tab === "payments" ? paymentForm.currency : creditForm.currency, allocationTotal)}</strong></div><div className={allocationTotal > sourceAmount ? styles.negative : ""}><span>Unallocated</span><strong>{money(tab === "payments" ? paymentForm.currency : creditForm.currency, sourceAmount - allocationTotal)}</strong></div></div>
              <div className={styles.actionBar}><button type="button" className={styles.secondaryButton} onClick={allocateOldest}>Allocate Oldest First</button><button type="button" className={styles.primaryInline} disabled={saving || !supplierId || sourceAmount <= 0 || allocationTotal > sourceAmount + 0.004} onClick={() => tab === "payments" ? void recordPayment() : void recordCredit()}>{saving ? "Saving..." : tab === "payments" ? (paymentCreditId ? "Apply Payment Balance" : "Record Payment") : (creditNoteId ? "Apply Credit Balance" : "Record Credit Note")}</button></div>
            </article>

            <article className={styles.card}>
              <div className={styles.cardHeading}><div><h2>Allocate to Supplier Bills</h2><p>{supplierOutstandingBills.length} outstanding bill(s) in the selected currency.</p></div></div>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Bill</th><th>Due</th><th>Total</th><th>Balance</th><th>Allocate</th></tr></thead>
                  <tbody>{supplierOutstandingBills.map((bill) => <tr key={bill.id}><td><strong>{bill.bill_no || `BILL-${bill.id}`}</strong><small>{bill.supplier_invoice_no || bill.description || "-"}</small></td><td>{formatDate(bill.due_date)}<small>{daysOverdue(bill) ? `${daysOverdue(bill)} days overdue` : "Current"}</small></td><td>{money(bill.currency, bill.total_amount)}</td><td>{money(bill.currency, billBalance(bill))}</td><td><input className={styles.allocationInput} type="number" min="0" step="0.01" max={billBalance(bill)} value={allocations[bill.id] ?? ""} onChange={(e) => setAllocation(bill, e.target.value)} /></td></tr>)}</tbody>
                </table>
              </div>
            </article>
          </section>
        ) : null}

        {tab === "payments" ? (
          <section className={styles.card}>
            <div className={styles.cardHeading}><div><h2>Supplier Payment History</h2><p>Posted and reversed payment vouchers.</p></div></div>
            <div className={styles.tableWrap}><table><thead><tr><th>Voucher</th><th>Supplier</th><th>Date</th><th>Method / Reference</th><th>Amount</th><th>Allocated</th><th>Unallocated</th><th>Status</th><th>Action</th></tr></thead><tbody>{visiblePayments.map((payment) => <tr key={payment.id}><td><strong>{payment.voucher_no || `PV-${payment.id}`}</strong></td><td>{payment.supplier_name}</td><td>{formatDate(payment.payment_date)}</td><td>{payment.payment_method}<small>{payment.payment_reference || payment.bank_account || "-"}</small></td><td>{money(payment.currency, payment.amount)}</td><td>{money(payment.currency, payment.allocated_amount)}</td><td>{money(payment.currency, payment.unallocated_amount)}</td><td><span className={`${styles.status} ${styles[payment.status]}`}>{payment.status}</span>{payment.void_reason ? <small>{payment.void_reason}</small> : null}</td><td><div className={styles.rowActions}><Link className={styles.linkButton} href={`/payables/print-voucher?id=${payment.id}`} target="_blank">Print</Link>{payment.status === "posted" && payment.unallocated_amount > 0.004 ? <button type="button" className={styles.linkButton} onClick={() => allocatePaymentCredit(payment)}>Allocate</button> : null}{payment.status === "posted" ? <button type="button" className={styles.voidButton} onClick={() => void voidPayment(payment)}>Reverse</button> : null}</div></td></tr>)}</tbody></table></div>
          </section>
        ) : null}

        {tab === "credits" ? (
          <section className={styles.card}>
            <div className={styles.cardHeading}><div><h2>Supplier Credit Note History</h2><p>Credits received from suppliers and their bill allocations.</p></div></div>
            <div className={styles.tableWrap}><table><thead><tr><th>Credit note</th><th>Supplier</th><th>Date</th><th>Reason / Reference</th><th>Amount</th><th>Applied</th><th>Unapplied</th><th>Status</th><th>Action</th></tr></thead><tbody>{visibleCredits.map((credit) => <tr key={credit.id}><td><strong>{credit.credit_note_no || `SCN-${credit.id}`}</strong></td><td>{credit.supplier_name}</td><td>{formatDate(credit.credit_date)}</td><td>{credit.reason}<small>{credit.supplier_reference || "-"}</small></td><td>{money(credit.currency, credit.amount)}</td><td>{money(credit.currency, credit.applied_amount)}</td><td>{money(credit.currency, credit.unapplied_amount)}</td><td><span className={`${styles.status} ${styles[credit.status]}`}>{credit.status}</span>{credit.void_reason ? <small>{credit.void_reason}</small> : null}</td><td><div className={styles.rowActions}>{credit.status === "posted" && credit.unapplied_amount > 0.004 ? <button type="button" className={styles.linkButton} onClick={() => allocateCreditNote(credit)}>Allocate</button> : null}{credit.status === "posted" ? <button type="button" className={styles.voidButton} onClick={() => void voidCredit(credit)}>Reverse</button> : null}</div></td></tr>)}</tbody></table></div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
