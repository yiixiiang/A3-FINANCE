import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AllocationInput = {
  invoice_id?: number;
  amount?: number;
};

type PaymentPayload = {
  action?: "record" | "allocate_credit" | "void";
  payment_id?: number;
  company_id?: number;
  customer_id?: number | null;
  customer_name?: string;
  payment_date?: string;
  currency?: string;
  amount?: number;
  payment_method?: string;
  payment_reference?: string;
  notes?: string;
  reason?: string;
  allocations?: AllocationInput[];
};

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function clean(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function moneyValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
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

export async function GET() {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);

  const admin = createAdminClient();
  const [companies, customers, invoices, payments, allocations] = await Promise.all([
    admin
      .from("companies")
      .select("id,name,status,base_currency,company_address,address,uen,company_phone,phone,company_email,email")
      .order("name"),
    admin
      .from("customers")
      .select("id,company_id,customer_no,customer_name,phone,email,billing_address,status,default_currency")
      .order("customer_name"),
    admin
      .from("customer_invoices")
      .select(
        "id,company_id,customer_id,invoice_no,invoice_date,due_date,customer_name,customer_phone,customer_email,currency,total_amount,amount_paid,status,notes",
      )
      .order("invoice_date", { ascending: false })
      .order("id", { ascending: false }),
    admin
      .from("customer_payments")
      .select(
        "id,receipt_no,company_id,customer_id,customer_name,payment_date,currency,amount,allocated_amount,unallocated_amount,payment_method,payment_reference,status,notes,void_reason,voided_at,created_at",
      )
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false }),
    admin
      .from("customer_payment_allocations")
      .select("id,payment_id,invoice_id,allocated_amount,created_at")
      .order("id"),
  ]);

  const error =
    companies.error ??
    customers.error ??
    invoices.error ??
    payments.error ??
    allocations.error;

  if (error) return fail(error.message, 500);

  return NextResponse.json({
    companies: companies.data ?? [],
    customers: customers.data ?? [],
    invoices: invoices.data ?? [],
    payments: payments.data ?? [],
    allocations: allocations.data ?? [],
  });
}

export async function POST(request: Request) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);

  let body: PaymentPayload;
  try {
    body = (await request.json()) as PaymentPayload;
  } catch {
    return fail("Invalid request body.");
  }

  if (body.action === "void") {
    const paymentId = Number(body.payment_id);
    const reason = clean(body.reason);

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return fail("A valid payment receipt is required.");
    }
    if (!reason) return fail("A reversal reason is required.");

    const { data, error } = await session.supabase.rpc("void_customer_payment", {
      p_payment_id: paymentId,
      p_reason: reason,
    });

    if (error) return fail(error.message, 500);
    return NextResponse.json(data ?? { success: true });
  }


  if (body.action === "allocate_credit") {
    const paymentId = Number(body.payment_id);
    const allocations = (body.allocations ?? [])
      .map((item) => ({
        invoice_id: Number(item.invoice_id),
        amount: Math.round(moneyValue(item.amount) * 100) / 100,
      }))
      .filter(
        (item) =>
          Number.isInteger(item.invoice_id) && item.invoice_id > 0 && item.amount > 0,
      );

    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      return fail("A valid payment receipt is required.");
    }
    if (!allocations.length) {
      return fail("Select at least one invoice allocation.");
    }

    const { data, error } = await session.supabase.rpc(
      "allocate_customer_payment_credit",
      {
        p_payment_id: paymentId,
        p_allocations: allocations,
      },
    );

    if (error) return fail(error.message, 500);
    return NextResponse.json(data ?? { success: true });
  }

  if (body.action !== "record") {
    return fail("Unsupported payment action.");
  }

  const companyId = Number(body.company_id);
  const customerId = body.customer_id ? Number(body.customer_id) : null;
  const amount = moneyValue(body.amount);
  const currency = (clean(body.currency) ?? "SGD").toUpperCase();
  const paymentMethod = clean(body.payment_method);
  const allocations = (body.allocations ?? [])
    .map((item) => ({
      invoice_id: Number(item.invoice_id),
      amount: Math.round(moneyValue(item.amount) * 100) / 100,
    }))
    .filter(
      (item) =>
        Number.isInteger(item.invoice_id) && item.invoice_id > 0 && item.amount > 0,
    );

  if (!Number.isInteger(companyId) || companyId <= 0) {
    return fail("Company is required.");
  }
  if (customerId !== null && (!Number.isInteger(customerId) || customerId <= 0)) {
    return fail("Invalid customer selection.");
  }
  if (!clean(body.customer_name) && customerId === null) {
    return fail("Customer name is required.");
  }
  if (amount <= 0) return fail("Payment amount must be greater than zero.");
  if (!/^[A-Z]{3}$/.test(currency)) return fail("Currency must use a three-letter code.");
  if (!paymentMethod) return fail("Payment method is required.");

  const allocatedTotal = allocations.reduce((sum, item) => sum + item.amount, 0);
  if (allocatedTotal > amount + 0.001) {
    return fail("Invoice allocations cannot exceed the payment amount.");
  }

  const { data, error } = await session.supabase.rpc("record_customer_payment", {
    p_company_id: companyId,
    p_customer_id: customerId,
    p_customer_name: clean(body.customer_name),
    p_payment_date: clean(body.payment_date),
    p_currency: currency,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_payment_reference: clean(body.payment_reference),
    p_notes: clean(body.notes),
    p_allocations: allocations,
  });

  if (error) return fail(error.message, 500);
  return NextResponse.json(data ?? { success: true });
}
