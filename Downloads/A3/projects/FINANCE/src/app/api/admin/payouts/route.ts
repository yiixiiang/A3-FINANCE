import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const statuses = new Set(["draft", "approved", "partial", "paid", "cancelled"]);
const clean = (value: unknown) => String(value ?? "").trim() || null;
const amount = (value: unknown) => Math.max(0, Number(value || 0));
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

async function requireAdministrator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  return profile?.role === "administrator" && profile.status === "active" ? user : null;
}

export async function GET() {
  if (!(await requireAdministrator())) return fail("Administrator access is required.", 403);
  const admin = createAdminClient();
  const [payouts, drivers, companies, jobs, items] = await Promise.all([
    admin.from("driver_payouts").select("*,drivers(id,driver_no,full_name,vehicle_plate),companies(id,name)").order("period_end", { ascending: false }).order("id", { ascending: false }),
    admin.from("drivers").select("id,driver_no,full_name,company_id,status,vehicle_plate").order("full_name"),
    admin.from("companies").select("id,name,status").order("name"),
    admin.from("driver_jobs").select("id,company_id,driver_id,job_reference,job_date,service_type,driver_amount,status").eq("status", "completed").order("job_date", { ascending: false }),
    admin.from("driver_payout_items").select("id,payout_id,job_id,amount"),
  ]);
  for (const result of [payouts, drivers, companies, jobs, items]) if (result.error) return fail(result.error.message, 500);
  return NextResponse.json({ payouts: payouts.data ?? [], drivers: drivers.data ?? [], companies: companies.data ?? [], jobs: jobs.data ?? [], items: items.data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireAdministrator();
  if (!user) return fail("Administrator access is required.", 403);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return fail("Invalid request body."); }
  const admin = createAdminClient();
  const action = String(body.action ?? "");
  const payoutId = Number(body.payout_id);

  if (action === "delete") {
    if (!Number.isInteger(payoutId)) return fail("Valid payout ID is required.");
    const { error } = await admin.from("driver_payouts").delete().eq("id", payoutId);
    if (error) return fail(error.message, 500);
    return NextResponse.json({ success: true });
  }

  const companyId = Number(body.company_id);
  const driverId = Number(body.driver_id);
  const status = clean(body.status) ?? "draft";
  const jobIds = Array.isArray(body.job_ids) ? body.job_ids.map(Number).filter(Number.isInteger) : [];
  if (!Number.isInteger(companyId) || !Number.isInteger(driverId)) return fail("Company and driver are required.");
  if (!statuses.has(status)) return fail("Invalid payout status.");
  const { data: driver } = await admin.from("drivers").select("id,company_id").eq("id", driverId).maybeSingle();
  if (!driver || driver.company_id !== companyId) return fail("Driver is not assigned to the selected company.");

  let grossEarnings = 0;
  if (jobIds.length) {
    const { data: selectedJobs, error } = await admin.from("driver_jobs").select("id,company_id,driver_id,driver_amount,status").in("id", jobIds);
    if (error) return fail(error.message, 500);
    if ((selectedJobs ?? []).length !== jobIds.length) return fail("One or more selected jobs were not found.");
    if ((selectedJobs ?? []).some(job => job.company_id !== companyId || job.driver_id !== driverId || job.status !== "completed")) return fail("Only completed jobs for the selected driver can be included.");
    grossEarnings = (selectedJobs ?? []).reduce((sum, job) => sum + Number(job.driver_amount || 0), 0);
  }

  const record = {
    company_id: companyId,
    driver_id: driverId,
    payout_no: clean(body.payout_no),
    period_start: clean(body.period_start),
    period_end: clean(body.period_end),
    gross_earnings: grossEarnings,
    deductions: amount(body.deductions),
    advances: amount(body.advances),
    amount_paid: amount(body.amount_paid),
    payment_date: clean(body.payment_date),
    payment_method: clean(body.payment_method),
    status,
    notes: clean(body.notes),
  };

  if (action === "create") {
    const { data, error } = await admin.from("driver_payouts").insert({ ...record, created_by: user.id }).select("id").single();
    if (error) return fail(error.message, 500);
    if (jobIds.length) {
      const rows = jobIds.map(job_id => ({ payout_id: data.id, job_id }));
      const { error: itemError } = await admin.from("driver_payout_items").insert(rows);
      if (itemError) { await admin.from("driver_payouts").delete().eq("id", data.id); return fail(itemError.message, 500); }
    }
    return NextResponse.json({ success: true, payout_id: data.id });
  }

  if (action === "update") {
    if (!Number.isInteger(payoutId)) return fail("Valid payout ID is required.");
    const { error } = await admin.from("driver_payouts").update(record).eq("id", payoutId);
    if (error) return fail(error.message, 500);
    await admin.from("driver_payout_items").delete().eq("payout_id", payoutId);
    if (jobIds.length) {
      const { error: itemError } = await admin.from("driver_payout_items").insert(jobIds.map(job_id => ({ payout_id: payoutId, job_id })));
      if (itemError) return fail(itemError.message, 500);
    }
    return NextResponse.json({ success: true, payout_id: payoutId });
  }
  return fail("Unsupported payout action.");
}
