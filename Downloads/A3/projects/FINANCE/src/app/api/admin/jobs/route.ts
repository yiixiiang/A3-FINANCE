import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type JobPayload = {
  action?: "create" | "update" | "delete";
  job_id?: number;
  company_id?: number;
  customer_id?: number | null;
  driver_id?: number;
  job_reference?: string;
  job_date?: string;
  pickup_time?: string;
  service_type?: string;
  customer_name?: string;
  customer_phone?: string;
  pickup_location?: string;
  dropoff_location?: string;
  vehicle_requirement?: string;
  limousine_vehicle_type_id?: number | null;
  passenger_count?: number;
  luggage_count?: number;
  duration_hours?: number;
  extra_stops?: number;
  gross_amount?: number;
  supplier_amount?: number;
  driver_amount?: number;
  extra_charges?: number;
  matched_rate_card_id?: number | null;
  matched_customer_rate_id?: number | null;
  pricing_source?: string;
  matched_rate_name?: string;
  matched_base_amount?: number;
  matched_extra_amount?: number;
  rate_match_details?: unknown;
  status?: string;
  payment_status?: string;
  payment_method?: string;
  notes?: string;
};

const statuses = new Set(["scheduled", "in_progress", "completed", "cancelled"]);
const paymentStatuses = new Set(["unpaid", "partial", "paid", "waived"]);
const clean = (value: unknown) => String(value ?? "").trim() || null;
const money = (value: unknown) => Math.max(0, Number(value || 0));
const wholeNumber = (value: unknown) => Math.max(0, Math.trunc(Number(value || 0)));

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

async function requireAdministrator() {
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
  const user = await requireAdministrator();
  if (!user) return error("Administrator access is required.", 403);

  const admin = createAdminClient();
  const [jobs, drivers, companies, vehicleTypes, customers, driverCompanyLinks] = await Promise.all([
    admin
      .from("driver_jobs")
      .select("*,drivers(id,driver_no,full_name,vehicle_plate),companies(id,name)")
      .order("job_date", { ascending: false })
      .order("id", { ascending: false }),
    admin
      .from("drivers")
      .select("id,driver_no,full_name,company_id,status,vehicle_plate")
      .order("full_name"),
    admin
      .from("companies")
      .select("id,name,status,company_type")
      .order("name"),
    admin
      .from("limousine_vehicle_types")
      .select("id,company_id,code,name,passenger_capacity,luggage_capacity,is_active,sort_order")
      .order("company_id")
      .order("sort_order")
      .order("name"),
    admin
      .from("customers")
      .select("id,company_id,customer_no,customer_name,phone,email,status")
      .order("customer_name"),
    admin
      .from("driver_company_links")
      .select("driver_id,company_id,membership_status")
      .eq("membership_status", "active"),
  ]);

  const queryError = jobs.error ?? drivers.error ?? companies.error ?? vehicleTypes.error ?? customers.error ?? driverCompanyLinks.error;
  if (queryError) return error(queryError.message, 500);

  const companyLinks = driverCompanyLinks.data ?? [];
  const networkDrivers = (drivers.data ?? []).map((driver) => ({
    ...driver,
    company_ids: [
      ...new Set([
        Number(driver.company_id),
        ...companyLinks
          .filter((link) => link.driver_id === driver.id)
          .map((link) => Number(link.company_id)),
      ]),
    ],
  }));

  return NextResponse.json({
    jobs: jobs.data ?? [],
    drivers: networkDrivers,
    companies: companies.data ?? [],
    vehicle_types: vehicleTypes.data ?? [],
    customers: customers.data ?? [],
  });
}

export async function POST(request: Request) {
  const user = await requireAdministrator();
  if (!user) return error("Administrator access is required.", 403);

  let body: JobPayload;
  try {
    body = (await request.json()) as JobPayload;
  } catch {
    return error("Invalid request body.");
  }

  const admin = createAdminClient();
  const action = body.action;

  if (action === "delete") {
    const jobId = Number(body.job_id);
    if (!Number.isInteger(jobId)) return error("Valid job ID is required.");

    const { error: deleteError } = await admin
      .from("driver_jobs")
      .delete()
      .eq("id", jobId);
    if (deleteError) return error(deleteError.message, 500);
    return NextResponse.json({ success: true });
  }

  const companyId = Number(body.company_id);
  const customerId = Number(body.customer_id || 0);
  const driverId = Number(body.driver_id);
  const vehicleTypeId = Number(body.limousine_vehicle_type_id || 0);
  const matchedRateCardId = Number(body.matched_rate_card_id || 0);
  const matchedCustomerRateId = Number(body.matched_customer_rate_id || 0);
  const status = clean(body.status) ?? "scheduled";
  const paymentStatus = clean(body.payment_status) ?? "unpaid";

  if (!Number.isInteger(companyId) || companyId <= 0) {
    return error("A company is required.");
  }
  if (!Number.isInteger(driverId) || driverId <= 0) {
    return error("A driver is required.");
  }
  if (!statuses.has(status)) return error("Invalid job status.");
  if (!paymentStatuses.has(paymentStatus)) return error("Invalid payment status.");

  const { data: driver } = await admin
    .from("drivers")
    .select("id,company_id,status")
    .eq("id", driverId)
    .maybeSingle();

  if (!driver) return error("Driver was not found.");
  if (driver.status !== "active") return error("The selected driver is inactive.");

  if (driver.company_id !== companyId) {
    const { data: networkLink, error: networkError } = await admin
      .from("driver_company_links")
      .select("id")
      .eq("driver_id", driverId)
      .eq("company_id", companyId)
      .eq("membership_status", "active")
      .maybeSingle();
    if (networkError) return error(networkError.message, 500);
    if (!networkLink) {
      return error("Driver is not linked to the selected limousine company.");
    }
  }

  if (customerId) {
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!customer) return error("The selected customer does not belong to this company.");
  }

  if (vehicleTypeId) {
    const { data: vehicleType } = await admin
      .from("limousine_vehicle_types")
      .select("id")
      .eq("id", vehicleTypeId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!vehicleType) {
      return error("The selected limousine vehicle type does not belong to this company.");
    }
  }

  if (matchedRateCardId) {
    const { data: matchedRate } = await admin
      .from("limousine_rate_cards")
      .select("id")
      .eq("id", matchedRateCardId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!matchedRate) return error("The matched rate card is invalid for this company.");
  }


  if (matchedCustomerRateId) {
    const { data: customerRate } = await admin
      .from("customer_limousine_rates")
      .select("id")
      .eq("id", matchedCustomerRateId)
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (!customerRate) return error("The matched customer contract rate is invalid.");
  }

  const record = {
    company_id: companyId,
    customer_id: customerId || null,
    driver_id: driverId,
    job_reference: clean(body.job_reference),
    job_date: clean(body.job_date) ?? new Date().toISOString().slice(0, 10),
    pickup_time: clean(body.pickup_time),
    service_type: clean(body.service_type),
    customer_name: clean(body.customer_name),
    customer_phone: clean(body.customer_phone),
    pickup_location: clean(body.pickup_location),
    dropoff_location: clean(body.dropoff_location),
    vehicle_requirement: clean(body.vehicle_requirement),
    limousine_vehicle_type_id: vehicleTypeId || null,
    passenger_count: wholeNumber(body.passenger_count),
    luggage_count: wholeNumber(body.luggage_count),
    duration_hours: money(body.duration_hours ?? 1),
    extra_stops: wholeNumber(body.extra_stops),
    gross_amount: money(body.gross_amount),
    supplier_amount: money(body.supplier_amount),
    driver_amount: money(body.driver_amount),
    extra_charges: money(body.extra_charges),
    matched_rate_card_id: matchedRateCardId || null,
    matched_customer_rate_id: matchedCustomerRateId || null,
    pricing_source: clean(body.pricing_source) ?? "standard",
    matched_rate_name: clean(body.matched_rate_name),
    matched_base_amount: money(body.matched_base_amount),
    matched_extra_amount: money(body.matched_extra_amount),
    rate_match_details: jsonObject(body.rate_match_details),
    status,
    payment_status: paymentStatus,
    payment_method: clean(body.payment_method),
    notes: clean(body.notes),
  };

  if (action === "create") {
    const { data, error: insertError } = await admin
      .from("driver_jobs")
      .insert({ ...record, created_by: user.id })
      .select("id")
      .single();
    if (insertError) return error(insertError.message, 500);
    return NextResponse.json({ success: true, job_id: data.id });
  }

  if (action === "update") {
    const jobId = Number(body.job_id);
    if (!Number.isInteger(jobId)) return error("Valid job ID is required.");

    const { error: updateError } = await admin
      .from("driver_jobs")
      .update(record)
      .eq("id", jobId);
    if (updateError) return error(updateError.message, 500);
    return NextResponse.json({ success: true, job_id: jobId });
  }

  return error("Unsupported job action.");
}
