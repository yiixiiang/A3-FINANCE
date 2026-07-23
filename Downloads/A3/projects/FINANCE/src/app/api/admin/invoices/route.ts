import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type InvoiceItem = { job_id?: number | null; description?: string; quantity?: number; unit_price?: number };
type Payload = {
  action?: "create" | "update" | "delete";
  invoice_id?: number;
  company_id?: number;
  invoice_no?: string;
  invoice_date?: string;
  due_date?: string;
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  billing_address?: string;
  service_charge_rate?: number;
  gst_rate?: number;
  amount_paid?: number;
  status?: string;
  payment_method?: string;
  payment_reference?: string;
  notes?: string;
  items?: InvoiceItem[];
};

const statuses = new Set(["draft", "issued", "partial", "paid", "overdue", "cancelled"]);
const clean = (value: unknown) => String(value ?? "").trim() || null;
const number = (value: unknown) => Math.max(0, Number(value || 0));
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const failure = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

async function requireAdministrator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  return profile?.role === "administrator" && profile.status === "active" ? user : null;
}

export async function GET() {
  const user = await requireAdministrator();
  if (!user) return failure("Administrator access is required.", 403);
  const admin = createAdminClient();
  const [invoices, companies, jobs] = await Promise.all([
    admin.from("customer_invoices").select("*,companies(id,name),customer_invoice_items(*)").order("invoice_date", { ascending: false }).order("id", { ascending: false }),
    admin.from("companies").select("id,name,status,company_type").order("name"),
    admin.from("driver_jobs").select("id,company_id,job_reference,job_date,customer_name,customer_phone,gross_amount,extra_charges,status,payment_status").eq("status", "completed").order("job_date", { ascending: false }),
  ]);
  if (invoices.error) return failure(invoices.error.message, 500);
  if (companies.error) return failure(companies.error.message, 500);
  if (jobs.error) return failure(jobs.error.message, 500);
  return NextResponse.json({ invoices: invoices.data ?? [], companies: companies.data ?? [], jobs: jobs.data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireAdministrator();
  if (!user) return failure("Administrator access is required.", 403);
  let body: Payload;
  try { body = await request.json(); } catch { return failure("Invalid request body."); }
  const admin = createAdminClient();

  if (body.action === "delete") {
    const invoiceId = Number(body.invoice_id);
    if (!Number.isInteger(invoiceId)) return failure("Valid invoice ID is required.");
    const { error } = await admin.from("customer_invoices").delete().eq("id", invoiceId);
    if (error) return failure(error.message, 500);
    return NextResponse.json({ success: true });
  }

  const companyId = Number(body.company_id);
  const status = clean(body.status) ?? "draft";
  if (!Number.isInteger(companyId)) return failure("Company is required.");
  if (!clean(body.customer_name)) return failure("Customer name is required.");
  if (!statuses.has(status)) return failure("Invalid invoice status.");
  const items = (body.items ?? []).map((item) => ({
    job_id: item.job_id ? Number(item.job_id) : null,
    description: clean(item.description),
    quantity: Math.max(0.01, number(item.quantity || 1)),
    unit_price: number(item.unit_price),
  })).filter((item) => item.description);
  if (!items.length) return failure("Add at least one invoice item.");

  const subtotal = round(items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0));
  const serviceRate = number(body.service_charge_rate);
  const serviceAmount = round(subtotal * serviceRate / 100);
  const gstRate = number(body.gst_rate);
  const gstAmount = round((subtotal + serviceAmount) * gstRate / 100);
  const totalAmount = round(subtotal + serviceAmount + gstAmount);
  const amountPaid = Math.min(totalAmount, number(body.amount_paid));
  const effectiveStatus = status === "cancelled" ? status : amountPaid >= totalAmount ? "paid" : amountPaid > 0 ? "partial" : status;

  const record = {
    company_id: companyId,
    invoice_no: clean(body.invoice_no),
    invoice_date: clean(body.invoice_date) ?? new Date().toISOString().slice(0, 10),
    due_date: clean(body.due_date),
    customer_name: clean(body.customer_name),
    customer_phone: clean(body.customer_phone),
    customer_email: clean(body.customer_email),
    billing_address: clean(body.billing_address),
    subtotal,
    service_charge_rate: serviceRate,
    service_charge_amount: serviceAmount,
    gst_rate: gstRate,
    gst_amount: gstAmount,
    total_amount: totalAmount,
    amount_paid: amountPaid,
    status: effectiveStatus,
    payment_method: clean(body.payment_method),
    payment_reference: clean(body.payment_reference),
    notes: clean(body.notes),
  };

  let invoiceId = Number(body.invoice_id);
  if (body.action === "create") {
    const { data, error } = await admin.from("customer_invoices").insert({ ...record, created_by: user.id }).select("id").single();
    if (error) return failure(error.message, 500);
    invoiceId = data.id;
  } else if (body.action === "update") {
    if (!Number.isInteger(invoiceId)) return failure("Valid invoice ID is required.");
    const { error } = await admin.from("customer_invoices").update(record).eq("id", invoiceId);
    if (error) return failure(error.message, 500);
    const { error: removeError } = await admin.from("customer_invoice_items").delete().eq("invoice_id", invoiceId);
    if (removeError) return failure(removeError.message, 500);
  } else {
    return failure("Unsupported invoice action.");
  }

  const rows = items.map((item) => ({
    invoice_id: invoiceId,
    job_id: item.job_id,
    description: item.description!,
    quantity: item.quantity,
    unit_price: item.unit_price,
    line_total: round(item.quantity * item.unit_price),
  }));
  const { error: itemError } = await admin.from("customer_invoice_items").insert(rows);
  if (itemError) return failure(itemError.message, 500);
  return NextResponse.json({ success: true, invoice_id: invoiceId });
}
