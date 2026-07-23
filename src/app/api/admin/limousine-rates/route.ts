import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Payload = Record<string, unknown> & {
  action?: string;
};

const serviceTypes = new Set([
  "Airport Transfer",
  "Point-to-Point",
  "Hourly Disposal",
  "Charter",
  "SG-JB",
  "JB-SG",
  "Other",
]);
const pricingMethods = new Set(["fixed", "per_hour"]);
const ruleBases = new Set([
  "always",
  "time_window",
  "pickup_contains",
  "dropoff_contains",
  "extra_stop",
  "additional_hour",
  "passenger_count",
  "luggage_count",
]);
const chargeTypes = new Set(["fixed", "percentage", "per_unit"]);

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

function isLegacyRuleNameConstraint(error: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
} | null) {
  if (!error) return false;
  const description = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    description.includes("rule_name") &&
    (error.code === "23502" ||
      description.includes("not-null") ||
      description.includes("not null"))
  );
}

function daysValue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 1 && item <= 7),
    ),
  ).sort((a, b) => a - b);
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

async function vehicleBelongsToCompany(vehicleTypeId: number, companyId: number) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("limousine_vehicle_types")
    .select("id")
    .eq("id", vehicleTypeId)
    .eq("company_id", companyId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET() {
  const user = await requireAdministrator();
  if (!user) return fail("Administrator access is required.", 403);

  const admin = createAdminClient();
  const [companies, vehicleTypes, rateCards, extraRules] = await Promise.all([
    admin
      .from("companies")
      .select("id,name,status,company_type")
      .eq("company_type", "limousine")
      .order("name"),
    admin
      .from("limousine_vehicle_types")
      .select("*")
      .order("company_id")
      .order("sort_order")
      .order("name"),
    admin
      .from("limousine_rate_cards")
      .select("*")
      .order("company_id")
      .order("priority", { ascending: false })
      .order("name"),
    admin
      .from("limousine_extra_charge_rules")
      .select("*")
      .order("company_id")
      .order("priority", { ascending: false })
      .order("name"),
  ]);

  const queryError =
    companies.error ?? vehicleTypes.error ?? rateCards.error ?? extraRules.error;
  if (queryError) return fail(queryError.message, 500);

  return NextResponse.json({
    companies: companies.data ?? [],
    vehicle_types: vehicleTypes.data ?? [],
    rate_cards: rateCards.data ?? [],
    extra_rules: extraRules.data ?? [],
  });
}

export async function POST(request: Request) {
  const user = await requireAdministrator();
  if (!user) return fail("Administrator access is required.", 403);

  let body: Payload;
  try {
    body = (await request.json()) as Payload;
  } catch {
    return fail("Invalid request body.");
  }

  const action = text(body.action);
  const admin = createAdminClient();

  if (action === "save_vehicle_type") {
    const id = integerValue(body.id);
    const companyId = integerValue(body.company_id);
    const code = text(body.code).toUpperCase();
    const name = text(body.name);

    if (!companyId || !code || !name) {
      return fail("Company, vehicle code and vehicle name are required.");
    }

    const record = {
      company_id: companyId,
      code,
      name,
      passenger_capacity: Math.max(1, integerValue(body.passenger_capacity, 4)),
      luggage_capacity: Math.max(0, integerValue(body.luggage_capacity, 2)),
      is_active: booleanValue(body.is_active, true),
      sort_order: integerValue(body.sort_order, 100),
      notes: nullableText(body.notes),
      updated_by: user.id,
    };

    const query = id
      ? admin
          .from("limousine_vehicle_types")
          .update(record)
          .eq("id", id)
          .select("id")
          .single()
      : admin
          .from("limousine_vehicle_types")
          .insert({ ...record, created_by: user.id })
          .select("id")
          .single();
    const { data, error } = await query;
    if (error) return fail(error.message, 500);
    return NextResponse.json({ success: true, id: data.id });
  }

  if (action === "delete_vehicle_type") {
    const id = integerValue(body.id);
    if (!id) return fail("Vehicle type ID is required.");
    const { error } = await admin
      .from("limousine_vehicle_types")
      .delete()
      .eq("id", id);
    if (error) return fail(error.message, 500);
    return NextResponse.json({ success: true });
  }

  if (action === "save_rate_card") {
    const id = integerValue(body.id);
    const companyId = integerValue(body.company_id);
    const vehicleTypeId = integerValue(body.vehicle_type_id);
    const name = text(body.name);
    const serviceType = text(body.service_type);
    const pricingMethod = text(body.pricing_method) || "fixed";

    if (!companyId || !vehicleTypeId || !name || !serviceType) {
      return fail("Company, vehicle type, rate name and service type are required.");
    }
    if (!serviceTypes.has(serviceType)) return fail("Invalid service type.");
    if (!pricingMethods.has(pricingMethod)) return fail("Invalid pricing method.");
    if (!(await vehicleBelongsToCompany(vehicleTypeId, companyId))) {
      return fail("The selected vehicle type does not belong to this company.");
    }

    const validFrom = text(body.valid_from);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
      return fail("A valid start date is required.");
    }

    const maxPassengers = nullableText(body.max_passengers);
    const maxLuggage = nullableText(body.max_luggage);
    const record = {
      company_id: companyId,
      vehicle_type_id: vehicleTypeId,
      name,
      service_type: serviceType,
      pricing_method: pricingMethod,
      base_amount: Math.max(0, numberValue(body.base_amount)),
      currency: (text(body.currency) || "SGD").toUpperCase(),
      minimum_hours: Math.max(0, numberValue(body.minimum_hours, 1)),
      included_hours: Math.max(0, numberValue(body.included_hours)),
      additional_hour_amount: Math.max(
        0,
        numberValue(body.additional_hour_amount),
      ),
      valid_from: validFrom,
      valid_to: nullableText(body.valid_to),
      days_of_week: daysValue(body.days_of_week),
      start_time: nullableText(body.start_time),
      end_time: nullableText(body.end_time),
      pickup_pattern: nullableText(body.pickup_pattern),
      dropoff_pattern: nullableText(body.dropoff_pattern),
      min_passengers: Math.max(0, integerValue(body.min_passengers)),
      max_passengers:
        maxPassengers === null
          ? null
          : Math.max(0, integerValue(maxPassengers)),
      min_luggage: Math.max(0, integerValue(body.min_luggage)),
      max_luggage:
        maxLuggage === null ? null : Math.max(0, integerValue(maxLuggage)),
      priority: integerValue(body.priority, 100),
      is_active: booleanValue(body.is_active, true),
      notes: nullableText(body.notes),
      updated_by: user.id,
    };

    const query = id
      ? admin
          .from("limousine_rate_cards")
          .update(record)
          .eq("id", id)
          .select("id")
          .single()
      : admin
          .from("limousine_rate_cards")
          .insert({ ...record, created_by: user.id })
          .select("id")
          .single();
    const { data, error } = await query;
    if (error) return fail(error.message, 500);
    return NextResponse.json({ success: true, id: data.id });
  }

  if (action === "delete_rate_card") {
    const id = integerValue(body.id);
    if (!id) return fail("Rate card ID is required.");
    const { error } = await admin
      .from("limousine_rate_cards")
      .delete()
      .eq("id", id);
    if (error) return fail(error.message, 500);
    return NextResponse.json({ success: true });
  }

  if (action === "save_extra_rule") {
    const id = integerValue(body.id);
    const companyId = integerValue(body.company_id);
    const vehicleTypeId = integerValue(body.vehicle_type_id);
    const name = text(body.name);
    const ruleBasis = text(body.rule_basis) || "always";
    const chargeType = text(body.charge_type) || "fixed";
    const serviceType = nullableText(body.service_type);

    if (!companyId || !name) return fail("Company and rule name are required.");
    if (!ruleBases.has(ruleBasis)) return fail("Invalid rule basis.");
    if (!chargeTypes.has(chargeType)) return fail("Invalid charge type.");
    if (serviceType && !serviceTypes.has(serviceType)) {
      return fail("Invalid service type.");
    }
    if (
      vehicleTypeId &&
      !(await vehicleBelongsToCompany(vehicleTypeId, companyId))
    ) {
      return fail("The selected vehicle type does not belong to this company.");
    }

    const validFrom = text(body.valid_from);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) {
      return fail("A valid start date is required.");
    }

    const record = {
      company_id: companyId,
      vehicle_type_id: vehicleTypeId || null,
      service_type: serviceType,
      name,
      rule_basis: ruleBasis,
      match_text: nullableText(body.match_text),
      threshold: Math.max(0, numberValue(body.threshold)),
      charge_type: chargeType,
      amount: Math.max(0, numberValue(body.amount)),
      valid_from: validFrom,
      valid_to: nullableText(body.valid_to),
      days_of_week: daysValue(body.days_of_week),
      start_time: nullableText(body.start_time),
      end_time: nullableText(body.end_time),
      is_stackable: booleanValue(body.is_stackable, true),
      priority: integerValue(body.priority, 100),
      is_active: booleanValue(body.is_active, true),
      notes: nullableText(body.notes),
      updated_by: user.id,
    };

    const saveRule = (includeLegacyRuleName: boolean) => {
      const saveRecord = includeLegacyRuleName
        ? { ...record, rule_name: name }
        : record;

      return id
        ? admin
            .from("limousine_extra_charge_rules")
            .update(saveRecord)
            .eq("id", id)
            .select("id")
            .single()
        : admin
            .from("limousine_extra_charge_rules")
            .insert({ ...saveRecord, created_by: user.id })
            .select("id")
            .single();
    };

    let { data, error } = await saveRule(false);

    // Older A3 databases may still retain a required legacy `rule_name`
    // column. Retry with both names so administrators can save immediately,
    // while the compatibility migration keeps both columns synchronized.
    if (isLegacyRuleNameConstraint(error)) {
      ({ data, error } = await saveRule(true));
    }

    if (error) return fail(error.message, 500);
    if (!data) {
      return fail("The extra-charge rule was saved, but no record was returned.", 500);
    }
    return NextResponse.json({ success: true, id: data.id });
  }

  if (action === "delete_extra_rule") {
    const id = integerValue(body.id);
    if (!id) return fail("Extra-charge rule ID is required.");
    const { error } = await admin
      .from("limousine_extra_charge_rules")
      .delete()
      .eq("id", id);
    if (error) return fail(error.message, 500);
    return NextResponse.json({ success: true });
  }

  if (action === "match") {
    const companyId = integerValue(body.company_id);
    const vehicleTypeId = integerValue(body.vehicle_type_id);
    const serviceType = text(body.service_type);
    const serviceDate = text(body.service_date);

    if (!companyId || !vehicleTypeId || !serviceType || !serviceDate) {
      return fail("Company, vehicle type, service type and service date are required.");
    }
    if (!serviceTypes.has(serviceType)) return fail("Invalid service type.");

    // The matcher checks auth.uid() and company access inside PostgreSQL.
    // Call it with the signed-in user's cookie-backed client, not the
    // service-role client, because service-role requests do not carry the
    // administrator's auth.uid().
    const authenticated = await createClient();
    const { data, error } = await authenticated.rpc("match_limousine_rate", {
      p_company_id: companyId,
      p_vehicle_type_id: vehicleTypeId,
      p_service_type: serviceType,
      p_service_date: serviceDate,
      p_pickup_time: nullableText(body.pickup_time),
      p_pickup_location: nullableText(body.pickup_location),
      p_dropoff_location: nullableText(body.dropoff_location),
      p_passengers: Math.max(0, integerValue(body.passengers)),
      p_luggage: Math.max(0, integerValue(body.luggage)),
      p_hours: Math.max(0, numberValue(body.hours, 1)),
      p_extra_stops: Math.max(0, integerValue(body.extra_stops)),
    });
    if (error) return fail(error.message, 500);
    return NextResponse.json({ match: data });
  }

  return fail("Unsupported limousine-rate action.");
}
