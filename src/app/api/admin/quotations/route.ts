import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ItemInput = { description?: unknown; quantity?: unknown; unit_price?: unknown };
type Payload = Record<string, unknown> & { action?: string; items?: ItemInput[] };

const statuses = new Set(["draft", "sent", "accepted", "rejected", "expired", "converted", "cancelled"]);
const clean = (value: unknown) => String(value ?? "").trim() || null;
const value = (input: unknown) => Math.max(0, Number(input || 0));
const integer = (input: unknown) => Math.max(0, Math.trunc(Number(input || 0)));

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function administrator() {
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
  return profile?.role === "administrator" && profile.status === "active" ? user : null;
}

export async function GET() {
  if (!(await administrator())) return fail("Administrator access is required.", 403);
  const admin = createAdminClient();
  const [quotations, customers, companies, gateways, vehicleTypes] = await Promise.all([
    admin
      .from("quotations")
      .select("*,customers(id,customer_no,customer_name,phone,email),quotation_items(*)")
      .order("quotation_date", { ascending: false })
      .order("id", { ascending: false }),
    admin
      .from("customers")
      .select("id,company_id,customer_no,customer_name,phone,email,status,default_currency")
      .eq("status", "active")
      .order("customer_name"),
    admin
      .from("companies")
      .select("id,name,status,company_type,gst_registered,gst_no,gst_rate")
      .order("name"),
    admin
      .from("company_payment_gateways")
      .select(
        "id,company_id,gateway_code,display_name,enabled,fee_type,fee_value,fee_borne_by,minimum_amount,payment_instructions",
      )
      .order("company_id")
      .order("display_name"),
    admin
      .from("limousine_vehicle_types")
      .select("id,company_id,code,name,passenger_capacity,luggage_capacity,is_active,sort_order")
      .order("company_id")
      .order("sort_order")
      .order("name"),
  ]);

  const queryError =
    quotations.error ?? customers.error ?? companies.error ?? gateways.error ?? vehicleTypes.error;
  if (queryError) return fail(queryError.message, 500);

  const companyRows = (companies.data ?? []).map(
    (company: Record<string, unknown>) => ({
      ...company,
      company_payment_gateways: (gateways.data ?? []).filter(
        (gateway: Record<string, unknown>) =>
          Number(gateway.company_id) === Number(company.id),
      ),
    }),
  );

  return NextResponse.json({
    quotations: quotations.data ?? [],
    customers: customers.data ?? [],
    companies: companyRows,
    vehicle_types: vehicleTypes.data ?? [],
  });
}

export async function POST(request: Request) {
  const user = await administrator();
  if (!user) return fail("Administrator access is required.", 403);

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return fail("Invalid request body.");
  }

  const admin = createAdminClient();
  if (body.action === "delete") {
    const { error } = await admin.from("quotations").delete().eq("id", Number(body.quotation_id));
    return error ? fail(error.message, 500) : NextResponse.json({ success: true });
  }

  const companyId = Number(body.company_id);
  const customerId = Number(body.customer_id);
  if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(customerId) || customerId <= 0) {
    return fail("Company and customer are required.");
  }

  const [{ data: company }, { data: customer }] = await Promise.all([
    admin
      .from("companies")
      .select("gst_registered,gst_no,gst_rate")
      .eq("id", companyId)
      .single(),
    admin
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);
  if (!customer) return fail("The selected customer does not belong to this company.");

  const vehicleTypeId = Number(body.limousine_vehicle_type_id || 0);
  const matchedRateCardId = Number(body.matched_rate_card_id || 0);
  const matchedCustomerRateId = Number(body.matched_customer_rate_id || 0);

  if (vehicleTypeId) {
    const { data: vehicleType } = await admin
      .from("limousine_vehicle_types")
      .select("id")
      .eq("id", vehicleTypeId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!vehicleType) return fail("The selected limousine vehicle type is invalid for this company.");
  }

  if (matchedRateCardId) {
    const { data: matchedRate } = await admin
      .from("limousine_rate_cards")
      .select("id")
      .eq("id", matchedRateCardId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!matchedRate) return fail("The matched standard rate is invalid for this company.");
  }

  if (matchedCustomerRateId) {
    const { data: customerRate } = await admin
      .from("customer_limousine_rates")
      .select("id,rate_card_id")
      .eq("id", matchedCustomerRateId)
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (!customerRate || (matchedRateCardId && Number(customerRate.rate_card_id) !== matchedRateCardId)) {
      return fail("The matched customer contract rate is invalid.");
    }
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((item, index) => ({
      description: clean(item.description),
      quantity: Math.max(0.001, value(item.quantity) || 1),
      unit_price: value(item.unit_price),
      sort_order: index,
    }))
    .filter((item) => item.description);
  if (!items.length) return fail("At least one quotation item is required.");

  const gstRegistered = Boolean(company?.gst_registered);
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const serviceChargeRate = value(body.service_charge_rate);
  const gstRate = gstRegistered ? value(body.gst_rate || company?.gst_rate || 9) : 0;
  const serviceCharge = subtotal * serviceChargeRate / 100;
  const gstAmount = gstRegistered ? (subtotal + serviceCharge) * gstRate / 100 : 0;

  let gateway: Record<string, unknown> | null = null;
  if (clean(body.payment_gateway_code)) {
    const { data } = await admin
      .from("company_payment_gateways")
      .select("*")
      .eq("company_id", companyId)
      .eq("gateway_code", clean(body.payment_gateway_code))
      .eq("enabled", true)
      .maybeSingle();
    gateway = data;
  }
  const feeBase = subtotal + serviceCharge + gstAmount;
  const gatewayMinimum = Number(gateway?.minimum_amount || 0);
  const gatewayFeeValue = Number(gateway?.fee_value || 0);
  const adminFee =
    gateway && gateway.fee_borne_by === "customer" && feeBase >= gatewayMinimum
      ? gateway.fee_type === "fixed"
        ? gatewayFeeValue
        : feeBase * gatewayFeeValue / 100
      : 0;

  const status = clean(body.status) || "draft";
  if (!statuses.has(status)) return fail("Invalid quotation status.");

  const record = {
    company_id: companyId,
    customer_id: customerId,
    quotation_no: clean(body.quotation_no),
    quotation_date: clean(body.quotation_date),
    valid_until: clean(body.valid_until),
    status,
    currency: clean(body.currency) || "SGD",
    subtotal,
    service_charge_rate: serviceChargeRate,
    gst_rate: gstRate,
    service_charge: serviceCharge,
    gst_amount: gstAmount,
    payment_gateway_code: gateway?.gateway_code || null,
    payment_fee_type: gateway?.fee_type || null,
    payment_fee_rate: gatewayFeeValue,
    payment_admin_fee: adminFee,
    payment_fee_borne_by: gateway?.fee_borne_by || "customer",
    gst_registered_snapshot: gstRegistered,
    gst_no_snapshot: gstRegistered ? company?.gst_no : null,
    total_amount: subtotal + serviceCharge + gstAmount + adminFee,
    notes: clean(body.notes),
    terms: clean(body.terms),
    limousine_vehicle_type_id: vehicleTypeId || null,
    service_type: clean(body.service_type),
    service_date: clean(body.service_date),
    pickup_time: clean(body.pickup_time),
    pickup_location: clean(body.pickup_location),
    dropoff_location: clean(body.dropoff_location),
    passenger_count: integer(body.passenger_count),
    luggage_count: integer(body.luggage_count),
    duration_hours: value(body.duration_hours || 1),
    extra_stops: integer(body.extra_stops),
    matched_rate_card_id: matchedRateCardId || null,
    matched_customer_rate_id: matchedCustomerRateId || null,
    pricing_source: clean(body.pricing_source) || "manual",
    rate_match_details:
      body.rate_match_details && typeof body.rate_match_details === "object" && !Array.isArray(body.rate_match_details)
        ? body.rate_match_details
        : null,
  };

  let quotationId = Number(body.quotation_id);
  if (body.action === "create") {
    const { data, error } = await admin
      .from("quotations")
      .insert({ ...record, created_by: user.id })
      .select("id")
      .single();
    if (error) return fail(error.message, 500);
    quotationId = data.id;
  } else {
    if (!Number.isInteger(quotationId) || quotationId <= 0) return fail("Valid quotation ID is required.");
    const { error } = await admin.from("quotations").update(record).eq("id", quotationId);
    if (error) return fail(error.message, 500);
    await admin.from("quotation_items").delete().eq("quotation_id", quotationId);
  }

  const { error: itemError } = await admin
    .from("quotation_items")
    .insert(items.map((item) => ({ ...item, quotation_id: quotationId })));
  if (itemError) return fail(itemError.message, 500);
  return NextResponse.json({ success: true, quotation_id: quotationId });
}
