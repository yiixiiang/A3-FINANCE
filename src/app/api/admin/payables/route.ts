import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AllocationInput = {
  bill_id?: number;
  amount?: number;
};

type Payload = {
  action?:
    | "save_supplier"
    | "save_bill"
    | "cancel_bill"
    | "record_payment"
    | "allocate_payment_credit"
    | "void_payment"
    | "record_credit"
    | "allocate_credit"
    | "void_credit";
  id?: number;
  company_id?: number;
  supplier_id?: number;
  supplier_no?: string;
  supplier_name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  uen?: string;
  default_currency?: string;
  payment_terms_days?: number;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_no?: string;
  paynow_details?: string;
  status?: string;
  notes?: string;
  supplier_invoice_no?: string;
  bill_date?: string;
  due_date?: string;
  currency?: string;
  subtotal?: number;
  gst_amount?: number;
  total_amount?: number;
  expense_category?: string;
  reference?: string;
  description?: string;
  reason?: string;
  payment_id?: number;
  payment_date?: string;
  amount?: number;
  payment_method?: string;
  payment_reference?: string;
  bank_account?: string;
  allocations?: AllocationInput[];
  credit_note_id?: number;
  credit_date?: string;
  supplier_reference?: string;
};

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.max(0, parsed) * 100) / 100;
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function allocationRows(values: AllocationInput[] | undefined) {
  return (values ?? [])
    .map((item) => ({
      bill_id: Number(item.bill_id),
      amount: money(item.amount),
    }))
    .filter(
      (item) => Number.isInteger(item.bill_id) && item.bill_id > 0 && item.amount > 0,
    );
}

async function administratorSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "administrator" || profile.status !== "active") {
    return null;
  }

  return { supabase, user };
}

export async function GET(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);

  const admin = createAdminClient();
  const paymentId = positiveInteger(request.nextUrl.searchParams.get("payment_id"));

  if (paymentId) {
    const [payment, allocations] = await Promise.all([
      admin
        .from("supplier_payments")
        .select("*,companies(*),suppliers(*)")
        .eq("id", paymentId)
        .maybeSingle(),
      admin
        .from("supplier_payment_allocations")
        .select("*,supplier_bills(*)")
        .eq("payment_id", paymentId)
        .order("id"),
    ]);

    const error = payment.error ?? allocations.error;
    if (error) return fail(error.message, 500);
    if (!payment.data) return fail("Payment voucher was not found.", 404);

    return NextResponse.json({
      payment: payment.data,
      allocations: allocations.data ?? [],
    });
  }

  const [companies, suppliers, bills, billItems, payments, paymentAllocations, credits, creditAllocations] =
    await Promise.all([
      admin
        .from("companies")
        .select(
          "id,name,status,base_currency,company_address,address,uen,gst_no,company_phone,phone,company_email,email,logo_path,company_chop_path",
        )
        .order("name"),
      admin
        .from("suppliers")
        .select("*")
        .order("supplier_name"),
      admin
        .from("supplier_bills")
        .select("*")
        .order("bill_date", { ascending: false })
        .order("id", { ascending: false }),
      admin.from("supplier_bill_items").select("*").order("id"),
      admin
        .from("supplier_payments")
        .select("*")
        .order("payment_date", { ascending: false })
        .order("id", { ascending: false }),
      admin.from("supplier_payment_allocations").select("*").order("id"),
      admin
        .from("supplier_credit_notes")
        .select("*")
        .order("credit_date", { ascending: false })
        .order("id", { ascending: false }),
      admin.from("supplier_credit_allocations").select("*").order("id"),
    ]);

  const error =
    companies.error ??
    suppliers.error ??
    bills.error ??
    billItems.error ??
    payments.error ??
    paymentAllocations.error ??
    credits.error ??
    creditAllocations.error;

  if (error) return fail(error.message, 500);

  return NextResponse.json({
    companies: companies.data ?? [],
    suppliers: suppliers.data ?? [],
    bills: bills.data ?? [],
    billItems: billItems.data ?? [],
    payments: payments.data ?? [],
    paymentAllocations: paymentAllocations.data ?? [],
    credits: credits.data ?? [],
    creditAllocations: creditAllocations.data ?? [],
  });
}

export async function POST(request: Request) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return fail("Invalid request body.");
  }

  const admin = createAdminClient();

  if (body.action === "save_supplier") {
    const companyId = positiveInteger(body.company_id);
    const supplierId = positiveInteger(body.id);
    const supplierName = clean(body.supplier_name);
    const currency = (clean(body.default_currency) ?? "SGD").toUpperCase();

    if (!companyId) return fail("Company is required.");
    if (!supplierName) return fail("Supplier name is required.");
    if (!/^[A-Z]{3}$/.test(currency)) return fail("Currency must use a three-letter code.");

    const record = {
      company_id: companyId,
      supplier_no: clean(body.supplier_no),
      supplier_name: supplierName,
      contact_person: clean(body.contact_person),
      email: clean(body.email),
      phone: clean(body.phone),
      billing_address: clean(body.billing_address),
      uen: clean(body.uen),
      default_currency: currency,
      payment_terms_days: Math.min(
        3650,
        Math.max(0, Math.trunc(Number(body.payment_terms_days ?? 30))),
      ),
      bank_name: clean(body.bank_name),
      bank_account_name: clean(body.bank_account_name),
      bank_account_no: clean(body.bank_account_no),
      paynow_details: clean(body.paynow_details),
      status: body.status === "inactive" ? "inactive" : "active",
      notes: clean(body.notes),
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    };

    const result = supplierId
      ? await admin
          .from("suppliers")
          .update(record)
          .eq("id", supplierId)
          .eq("company_id", companyId)
          .select("*")
          .maybeSingle()
      : await admin
          .from("suppliers")
          .insert({ ...record, created_by: session.user.id })
          .select("*")
          .single();

    if (result.error) return fail(result.error.message, 500);
    if (!result.data) return fail("Supplier was not found.", 404);
    return NextResponse.json({ supplier: result.data });
  }

  if (body.action === "save_bill") {
    const companyId = positiveInteger(body.company_id);
    const supplierId = positiveInteger(body.supplier_id);
    const billId = positiveInteger(body.id);
    const currency = (clean(body.currency) ?? "SGD").toUpperCase();
    const subtotal = money(body.subtotal);
    const gstAmount = money(body.gst_amount);
    const totalAmount = money(body.total_amount || subtotal + gstAmount);

    if (!companyId) return fail("Company is required.");
    if (!supplierId) return fail("Supplier is required.");
    if (!/^[A-Z]{3}$/.test(currency)) return fail("Currency must use a three-letter code.");
    if (totalAmount <= 0) return fail("Bill total must be greater than zero.");

    const { data: supplier, error: supplierError } = await admin
      .from("suppliers")
      .select("id,company_id,supplier_name,payment_terms_days,status")
      .eq("id", supplierId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (supplierError) return fail(supplierError.message, 500);
    if (!supplier) return fail("Supplier was not found for the selected company.");

    let dueDate = clean(body.due_date);
    const billDate = clean(body.bill_date) ?? new Date().toISOString().slice(0, 10);
    if (!dueDate) {
      const calculated = new Date(`${billDate}T00:00:00Z`);
      calculated.setUTCDate(calculated.getUTCDate() + Number(supplier.payment_terms_days ?? 30));
      dueDate = calculated.toISOString().slice(0, 10);
    }

    if (billId) {
      const { data: existing, error } = await admin
        .from("supplier_bills")
        .select("amount_paid,credit_applied,status")
        .eq("id", billId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) return fail(error.message, 500);
      if (!existing) return fail("Supplier bill was not found.", 404);
      if (existing.status === "cancelled") return fail("A cancelled bill cannot be edited.");
      if (Number(existing.amount_paid ?? 0) + Number(existing.credit_applied ?? 0) > 0.004) {
        return fail("A bill with payment or credit allocations cannot be edited.");
      }
    }

    const record = {
      company_id: companyId,
      supplier_id: supplierId,
      supplier_name: supplier.supplier_name,
      supplier_invoice_no: clean(body.supplier_invoice_no),
      bill_date: billDate,
      due_date: dueDate,
      currency,
      subtotal,
      gst_amount: gstAmount,
      total_amount: totalAmount,
      expense_category: clean(body.expense_category),
      reference: clean(body.reference),
      description: clean(body.description),
      notes: clean(body.notes),
      status: "open",
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    };

    const result = billId
      ? await admin
          .from("supplier_bills")
          .update(record)
          .eq("id", billId)
          .eq("company_id", companyId)
          .select("*")
          .maybeSingle()
      : await admin
          .from("supplier_bills")
          .insert({ ...record, created_by: session.user.id })
          .select("*")
          .single();

    if (result.error) return fail(result.error.message, 500);
    if (!result.data) return fail("Supplier bill was not found.", 404);

    const clearedItems = await admin
      .from("supplier_bill_items")
      .delete()
      .eq("bill_id", result.data.id);
    if (clearedItems.error) return fail(clearedItems.error.message, 500);

    const itemDescription = clean(body.description) || clean(body.expense_category) || "Supplier bill";
    const savedItem = await admin.from("supplier_bill_items").insert({
      bill_id: result.data.id,
      description: itemDescription,
      quantity: 1,
      unit_price: subtotal,
      line_total: subtotal,
    });
    if (savedItem.error) return fail(savedItem.error.message, 500);

    const refreshResult = await session.supabase.rpc("refresh_supplier_bill_state", {
      p_bill_id: result.data.id,
    });
    if (refreshResult.error) return fail(refreshResult.error.message, 500);

    return NextResponse.json({ bill: result.data });
  }

  if (body.action === "cancel_bill") {
    const billId = positiveInteger(body.id);
    const reason = clean(body.reason);
    if (!billId) return fail("A valid supplier bill is required.");
    if (!reason) return fail("A cancellation reason is required.");

    const { data: bill, error } = await admin
      .from("supplier_bills")
      .select("id,amount_paid,credit_applied,status")
      .eq("id", billId)
      .maybeSingle();
    if (error) return fail(error.message, 500);
    if (!bill) return fail("Supplier bill was not found.", 404);
    if (bill.status === "cancelled") return NextResponse.json({ success: true });
    if (Number(bill.amount_paid ?? 0) + Number(bill.credit_applied ?? 0) > 0.004) {
      return fail("Reverse allocated payments and credits before cancelling this bill.");
    }

    const cancelled = await admin
      .from("supplier_bills")
      .update({
        status: "cancelled",
        cancelled_reason: reason,
        cancelled_by: session.user.id,
        cancelled_at: new Date().toISOString(),
        updated_by: session.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", billId);

    if (cancelled.error) return fail(cancelled.error.message, 500);
    return NextResponse.json({ success: true });
  }

  if (body.action === "record_payment") {
    const companyId = positiveInteger(body.company_id);
    const supplierId = positiveInteger(body.supplier_id);
    const amount = money(body.amount);
    const currency = (clean(body.currency) ?? "SGD").toUpperCase();
    const allocations = allocationRows(body.allocations);

    if (!companyId) return fail("Company is required.");
    if (!supplierId) return fail("Supplier is required.");
    if (amount <= 0) return fail("Payment amount must be greater than zero.");
    if (!clean(body.payment_method)) return fail("Payment method is required.");
    if (allocations.reduce((sum, item) => sum + item.amount, 0) > amount + 0.004) {
      return fail("Bill allocations cannot exceed the payment amount.");
    }

    const { data, error } = await session.supabase.rpc("record_supplier_payment", {
      p_company_id: companyId,
      p_supplier_id: supplierId,
      p_payment_date: clean(body.payment_date),
      p_currency: currency,
      p_amount: amount,
      p_payment_method: clean(body.payment_method),
      p_payment_reference: clean(body.payment_reference),
      p_bank_account: clean(body.bank_account),
      p_notes: clean(body.notes),
      p_allocations: allocations,
    });
    if (error) return fail(error.message, 500);
    return NextResponse.json(data ?? { success: true });
  }

  if (body.action === "allocate_payment_credit") {
    const paymentId = positiveInteger(body.payment_id);
    const allocations = allocationRows(body.allocations);
    if (!paymentId) return fail("A valid supplier payment is required.");
    if (!allocations.length) return fail("Select at least one bill allocation.");

    const { data, error } = await session.supabase.rpc(
      "allocate_supplier_payment_credit",
      { p_payment_id: paymentId, p_allocations: allocations },
    );
    if (error) return fail(error.message, 500);
    return NextResponse.json(data ?? { success: true });
  }

  if (body.action === "void_payment") {
    const paymentId = positiveInteger(body.payment_id);
    const reason = clean(body.reason);
    if (!paymentId) return fail("A valid supplier payment is required.");
    if (!reason) return fail("A reversal reason is required.");

    const { data, error } = await session.supabase.rpc("void_supplier_payment", {
      p_payment_id: paymentId,
      p_reason: reason,
    });
    if (error) return fail(error.message, 500);
    return NextResponse.json(data ?? { success: true });
  }

  if (body.action === "record_credit") {
    const companyId = positiveInteger(body.company_id);
    const supplierId = positiveInteger(body.supplier_id);
    const amount = money(body.amount);
    const allocations = allocationRows(body.allocations);
    if (!companyId) return fail("Company is required.");
    if (!supplierId) return fail("Supplier is required.");
    if (amount <= 0) return fail("Credit amount must be greater than zero.");
    if (!clean(body.reason)) return fail("Credit reason is required.");
    if (allocations.reduce((sum, item) => sum + item.amount, 0) > amount + 0.004) {
      return fail("Bill allocations cannot exceed the credit amount.");
    }

    const { data, error } = await session.supabase.rpc(
      "record_supplier_credit_note",
      {
        p_company_id: companyId,
        p_supplier_id: supplierId,
        p_credit_date: clean(body.credit_date),
        p_currency: (clean(body.currency) ?? "SGD").toUpperCase(),
        p_amount: amount,
        p_supplier_reference: clean(body.supplier_reference),
        p_reason: clean(body.reason),
        p_notes: clean(body.notes),
        p_allocations: allocations,
      },
    );
    if (error) return fail(error.message, 500);
    return NextResponse.json(data ?? { success: true });
  }

  if (body.action === "allocate_credit") {
    const creditNoteId = positiveInteger(body.credit_note_id);
    const allocations = allocationRows(body.allocations);
    if (!creditNoteId) return fail("A valid supplier credit note is required.");
    if (!allocations.length) return fail("Select at least one bill allocation.");

    const { data, error } = await session.supabase.rpc(
      "allocate_supplier_credit_note",
      { p_credit_note_id: creditNoteId, p_allocations: allocations },
    );
    if (error) return fail(error.message, 500);
    return NextResponse.json(data ?? { success: true });
  }

  if (body.action === "void_credit") {
    const creditNoteId = positiveInteger(body.credit_note_id);
    const reason = clean(body.reason);
    if (!creditNoteId) return fail("A valid supplier credit note is required.");
    if (!reason) return fail("A reversal reason is required.");

    const { data, error } = await session.supabase.rpc(
      "void_supplier_credit_note",
      { p_credit_note_id: creditNoteId, p_reason: reason },
    );
    if (error) return fail(error.message, 500);
    return NextResponse.json(data ?? { success: true });
  }

  return fail("Unsupported accounts payable action.");
}
