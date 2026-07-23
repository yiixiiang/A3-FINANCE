import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Payload = Record<string, unknown> & { action?: string };

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: unknown) {
  return text(value) || null;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integerValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
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

  return { user, supabase };
}

export async function GET() {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);

  const admin = createAdminClient();
  const [companies, customers, vehicleTypes, rateCards, customerRates] =
    await Promise.all([
      admin
        .from("companies")
        .select("id,name,status,company_type")
        .eq("company_type", "limousine")
        .order("name"),
      admin
        .from("customers")
        .select(
          "id,company_id,customer_no,customer_name,phone,email,status,default_currency,contract_reference,contract_start_date,contract_end_date",
        )
        .order("customer_name"),
      admin
        .from("limousine_vehicle_types")
        .select(
          "id,company_id,code,name,passenger_capacity,luggage_capacity,is_active,sort_order",
        )
        .order("company_id")
        .order("sort_order")
        .order("name"),
      admin
        .from("limousine_rate_cards")
        .select(
          "id,company_id,vehicle_type_id,name,service_type,pricing_method,base_amount,currency,minimum_hours,included_hours,additional_hour_amount,valid_from,valid_to,is_active,priority",
        )
        .order("company_id")
        .order("priority", { ascending: false })
        .order("name"),
      admin
        .from("customer_limousine_rates")
        .select("*")
        .order("company_id")
        .order("customer_id")
        .order("priority", { ascending: false })
        .order("contract_name"),
    ]);

  const queryError =
    companies.error ??
    customers.error ??
    vehicleTypes.error ??
    rateCards.error ??
    customerRates.error;
  if (queryError) return fail(queryError.message, 500);

  return NextResponse.json({
    companies: companies.data ?? [],
    customers: customers.data ?? [],
    vehicle_types: vehicleTypes.data ?? [],
    rate_cards: rateCards.data ?? [],
    customer_rates: customerRates.data ?? [],
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

  const action = text(body.action);
  const admin = createAdminClient();

  if (action === "match") {
    const companyId = integerValue(body.company_id);
    const customerId = integerValue(body.customer_id);
    const vehicleTypeId = integerValue(body.vehicle_type_id);
    const serviceType = text(body.service_type);

    if (!companyId || !vehicleTypeId || !serviceType) {
      return fail("Company, vehicle type and service type are required.");
    }

    const { data, error } = await session.supabase.rpc(
      "match_limousine_rate_for_customer",
      {
        p_company_id: companyId,
        p_customer_id: customerId || null,
        p_vehicle_type_id: vehicleTypeId,
        p_service_type: serviceType,
        p_service_date: nullableText(body.service_date),
        p_pickup_time: nullableText(body.pickup_time),
        p_pickup_location: nullableText(body.pickup_location),
        p_dropoff_location: nullableText(body.dropoff_location),
        p_passengers: Math.max(0, integerValue(body.passengers)),
        p_luggage: Math.max(0, integerValue(body.luggage)),
        p_hours: Math.max(0, numberValue(body.hours, 1)),
        p_extra_stops: Math.max(0, integerValue(body.extra_stops)),
      },
    );

    if (error) return fail(error.message, 500);
    return NextResponse.json({ match: data });
  }

  if (action === "delete") {
    const id = integerValue(body.id);
    if (!id) return fail("Customer rate ID is required.");

    const { error } = await admin
      .from("customer_limousine_rates")
      .delete()
      .eq("id", id);
    if (error) return fail(error.message, 500);
    return NextResponse.json({ success: true });
  }

  if (action !== "save") return fail("Unsupported action.");

  const id = integerValue(body.id);
  const companyId = integerValue(body.company_id);
  const customerId = integerValue(body.customer_id);
  const rateCardId = integerValue(body.rate_card_id);
  const contractName = text(body.contract_name);
  const validFrom = text(body.valid_from);

  if (!companyId || !customerId || !rateCardId || !contractName) {
    return fail("Company, customer, standard rate card and contract name are required.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
    return fail("A valid start date is required.");
  }

  const [{ data: customer }, { data: rateCard }] = await Promise.all([
    admin
      .from("customers")
      .select("id")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle(),
    admin
      .from("limousine_rate_cards")
      .select("id,currency")
      .eq("id", rateCardId)
      .eq("company_id", companyId)
      .maybeSingle(),
  ]);

  if (!customer) return fail("The selected customer does not belong to this company.");
  if (!rateCard) return fail("The selected rate card does not belong to this company.");

  const optionalNumber = (value: unknown) => {
    const raw = text(value);
    return raw === "" ? null : Math.max(0, numberValue(raw));
  };

  const pricingMethod = text(body.pricing_method);
  const standardCurrency = String(rateCard.currency || "SGD").toUpperCase();
  const requestedCurrency = (text(body.currency) || standardCurrency).toUpperCase();
  const validTo = nullableText(body.valid_to);

  if (requestedCurrency !== standardCurrency) {
    return fail(`Customer contract currency must remain ${standardCurrency} for this rate card.`);
  }
  if (validTo && validTo < validFrom) {
    return fail("Valid-to date cannot be earlier than the valid-from date.");
  }

  const record = {
    company_id: companyId,
    customer_id: customerId,
    rate_card_id: rateCardId,
    contract_name: contractName,
    override_base_amount: Math.max(0, numberValue(body.override_base_amount)),
    currency: standardCurrency,
    pricing_method:
      pricingMethod === "fixed" || pricingMethod === "per_hour"
        ? pricingMethod
        : null,
    minimum_hours: optionalNumber(body.minimum_hours),
    included_hours: optionalNumber(body.included_hours),
    additional_hour_amount: optionalNumber(body.additional_hour_amount),
    valid_from: validFrom,
    valid_to: validTo,
    priority: integerValue(body.priority, 100),
    is_active: booleanValue(body.is_active, true),
    notes: nullableText(body.notes),
    updated_by: session.user.id,
  };

  const query = id
    ? admin
        .from("customer_limousine_rates")
        .update(record)
        .eq("id", id)
        .select("id")
        .single()
    : admin
        .from("customer_limousine_rates")
        .insert({ ...record, created_by: session.user.id })
        .select("id")
        .single();

  const { data, error } = await query;
  if (error) return fail(error.message, 500);
  return NextResponse.json({ success: true, id: data.id });
}
