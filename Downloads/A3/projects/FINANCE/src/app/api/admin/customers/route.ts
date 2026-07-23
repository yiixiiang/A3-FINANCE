import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const clean = (value: unknown) => String(value ?? "").trim() || null;
const numberValue = (value: unknown) => Math.max(0, Number(value || 0));

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function administratorUser() {
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

  return profile?.role === "administrator" && profile.status === "active"
    ? user
    : null;
}

export async function GET() {
  if (!(await administratorUser())) {
    return fail("Administrator access is required.", 403);
  }

  const admin = createAdminClient();
  const [customers, companies, jobs, invoices] = await Promise.all([
    admin.from("customers").select("*").order("customer_name"),
    admin.from("companies").select("id,name,status").order("name"),
    admin
      .from("driver_jobs")
      .select(
        "id,company_id,customer_name,customer_phone,job_date,gross_amount,extra_charges,status",
      ),
    admin
      .from("customer_invoices")
      .select(
        "id,company_id,customer_name,total_amount,amount_paid,invoice_date,status",
      ),
  ]);

  const firstError =
    customers.error ?? companies.error ?? jobs.error ?? invoices.error;
  if (firstError) return fail(firstError.message, 500);

  const invoiceRows = (invoices.data ?? []).map((invoice) => ({
    ...invoice,
    balance_due: Math.max(
      0,
      Number(invoice.total_amount ?? 0) - Number(invoice.amount_paid ?? 0),
    ),
  }));

  return NextResponse.json({
    customers: customers.data ?? [],
    companies: companies.data ?? [],
    jobs: jobs.data ?? [],
    invoices: invoiceRows,
  });
}

export async function POST(request: Request) {
  const user = await administratorUser();
  if (!user) return fail("Administrator access is required.", 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Invalid request body.");
  }

  const admin = createAdminClient();

  if (body.action === "delete") {
    const customerId = Number(body.customer_id);
    const { error } = await admin
      .from("customers")
      .delete()
      .eq("id", customerId);

    return error
      ? fail(error.message, 500)
      : NextResponse.json({ success: true });
  }

  const companyId = Number(body.company_id);
  if (!Number.isInteger(companyId) || !clean(body.customer_name)) {
    return fail("Company and customer name are required.");
  }

  const defaultCurrency = (clean(body.default_currency) || "SGD").toUpperCase();
  const contractStart = clean(body.contract_start_date);
  const contractEnd = clean(body.contract_end_date);

  if (!/^[A-Z]{3}$/.test(defaultCurrency)) {
    return fail("Default currency must be a three-letter currency code.");
  }

  if (contractStart && contractEnd && contractEnd < contractStart) {
    return fail("Contract end date cannot be earlier than the start date.");
  }

  const record = {
    company_id: companyId,
    customer_no: clean(body.customer_no),
    customer_type: body.customer_type === "individual" ? "individual" : "company",
    customer_name: clean(body.customer_name),
    contact_person: clean(body.contact_person),
    phone: clean(body.phone),
    email: clean(body.email),
    billing_address: clean(body.billing_address),
    uen_tax_id: clean(body.uen_tax_id),
    payment_terms_days: Math.floor(numberValue(body.payment_terms_days)),
    credit_limit: numberValue(body.credit_limit),
    preferred_language: "en",
    default_currency: defaultCurrency,
    contract_reference: clean(body.contract_reference),
    contract_start_date: contractStart,
    contract_end_date: contractEnd,
    status: body.status === "inactive" ? "inactive" : "active",
    notes: clean(body.notes),
  };

  if (body.action === "create") {
    const { data, error } = await admin
      .from("customers")
      .insert({ ...record, created_by: user.id })
      .select("id")
      .single();

    if (error) return fail(error.message, 500);
    if (!data) return fail("Customer was saved but no record was returned.", 500);

    return NextResponse.json({ success: true, customer_id: data.id });
  }

  const customerId = Number(body.customer_id);
  const { error } = await admin
    .from("customers")
    .update(record)
    .eq("id", customerId);

  return error
    ? fail(error.message, 500)
    : NextResponse.json({ success: true, customer_id: customerId });
}
