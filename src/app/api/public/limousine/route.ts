import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const serviceTypes = new Set([
  "airport_transfer",
  "point_to_point",
  "hourly_disposal",
  "charter",
  "sg_jb",
  "jb_sg",
]);
const contactMethods = new Set(["whatsapp", "telegram", "wechat", "phone"]);

type QuotePayload = {
  customer_name?: unknown;
  phone?: unknown;
  email?: unknown;
  preferred_contact?: unknown;
  service_type?: unknown;
  trip_date?: unknown;
  pickup_time?: unknown;
  pickup_location?: unknown;
  dropoff_location?: unknown;
  return_trip?: unknown;
  passengers?: unknown;
  luggage?: unknown;
  vehicle_type_id?: unknown;
  rate_card_id?: unknown;
  estimated_amount?: unknown;
  currency?: unknown;
  special_requests?: unknown;
  consent_accepted?: unknown;
};

function text(value: unknown, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

function nullableText(value: unknown, maximum = 500) {
  const result = text(value, maximum);
  return result || null;
}

function integer(value: unknown, fallback = 0) {
  const result = Number(value);
  return Number.isInteger(result) ? result : fallback;
}

function numberValue(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function validDate(value: unknown) {
  const result = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}

function validTime(value: unknown) {
  const result = text(value, 8);
  return /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(result) ? result : null;
}

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function findAejkyCompany() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("companies")
    .select(
      "id,name,address,phone,email,company_address,company_phone,company_email,logo_path,status,company_type",
    )
    .eq("company_type", "limousine")
    .eq("status", "active")
    .ilike("name", "%AEJKY%")
    .order("id")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { admin, company: data };
}

async function signedLogoUrl(
  admin: ReturnType<typeof createAdminClient>,
  logoPath: string | null | undefined,
) {
  if (!logoPath) return null;
  const { data } = await admin.storage.from("company-assets").createSignedUrl(logoPath, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function GET() {
  try {
    const { admin, company } = await findAejkyCompany();
    if (!company) {
      return NextResponse.json({
        company: null,
        vehicle_types: [],
        rate_cards: [],
        contact: {
          whatsapp: process.env.NEXT_PUBLIC_AEJKY_WHATSAPP ?? "6584849004",
          telegram: process.env.NEXT_PUBLIC_AEJKY_TELEGRAM ?? "",
          wechat: process.env.NEXT_PUBLIC_AEJKY_WECHAT ?? "",
        },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const [vehicleResponse, rateResponse, logoUrl] = await Promise.all([
      admin
        .from("limousine_vehicle_types")
        .select("id,code,name,passenger_capacity,luggage_capacity")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .order("sort_order")
        .order("name"),
      admin
        .from("limousine_rate_cards")
        .select(
          "id,vehicle_type_id,name,service_type,pricing_method,base_amount,currency,minimum_hours,included_hours,additional_hour_amount,notes,priority",
        )
        .eq("company_id", company.id)
        .eq("is_active", true)
        .lte("valid_from", today)
        .or(`valid_to.is.null,valid_to.gte.${today}`)
        .order("priority", { ascending: false })
        .order("base_amount"),
      signedLogoUrl(admin, company.logo_path),
    ]);

    const queryError = vehicleResponse.error ?? rateResponse.error;
    if (queryError) throw new Error(queryError.message);

    const vehicles = vehicleResponse.data ?? [];
    const vehicleMap = new Map(vehicles.map((vehicle) => [Number(vehicle.id), vehicle]));
    const rates = (rateResponse.data ?? []).map((rate) => ({
      ...rate,
      base_amount: Number(rate.base_amount || 0),
      minimum_hours: Number(rate.minimum_hours || 0),
      included_hours: Number(rate.included_hours || 0),
      additional_hour_amount: Number(rate.additional_hour_amount || 0),
      vehicle: vehicleMap.get(Number(rate.vehicle_type_id)) ?? null,
    }));

    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        address: company.company_address || company.address || null,
        phone: company.company_phone || company.phone || null,
        email: company.company_email || company.email || null,
        logo_url: logoUrl,
      },
      vehicle_types: vehicles,
      rate_cards: rates,
      contact: {
        whatsapp:
          process.env.NEXT_PUBLIC_AEJKY_WHATSAPP || company.company_phone || company.phone || "6584849004",
        telegram: process.env.NEXT_PUBLIC_AEJKY_TELEGRAM ?? "",
        wechat: process.env.NEXT_PUBLIC_AEJKY_WECHAT ?? "",
      },
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to load limousine website data.", 500);
  }
}

export async function POST(request: Request) {
  let body: QuotePayload;
  try {
    body = (await request.json()) as QuotePayload;
  } catch {
    return fail("Invalid quotation request.");
  }

  const customerName = text(body.customer_name, 160);
  const phone = text(body.phone, 60);
  const email = nullableText(body.email, 200);
  const preferredContact = text(body.preferred_contact, 20);
  const serviceType = text(body.service_type, 40);
  const tripDate = validDate(body.trip_date);
  const pickupTime = validTime(body.pickup_time);
  const pickupLocation = text(body.pickup_location, 500);
  const dropoffLocation = text(body.dropoff_location, 500);
  const consentAccepted = booleanValue(body.consent_accepted);

  if (!customerName || !phone) return fail("Your name and contact number are required.");
  if (!tripDate || !pickupLocation || !dropoffLocation) {
    return fail("Trip date, pickup location and drop-off location are required.");
  }
  if (!contactMethods.has(preferredContact)) return fail("Select a valid contact method.");
  if (!serviceTypes.has(serviceType)) return fail("Select a valid limousine service.");
  if (!consentAccepted) return fail("Privacy consent is required.");

  try {
    const { admin, company } = await findAejkyCompany();
    if (!company) return fail("AEJKY Limousine is not configured as an active limousine company.", 503);

    const vehicleTypeId = integer(body.vehicle_type_id) || null;
    const rateCardId = integer(body.rate_card_id) || null;

    if (vehicleTypeId) {
      const { data } = await admin
        .from("limousine_vehicle_types")
        .select("id")
        .eq("id", vehicleTypeId)
        .eq("company_id", company.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!data) return fail("The selected vehicle is not available.");
    }

    if (rateCardId) {
      const { data } = await admin
        .from("limousine_rate_cards")
        .select("id")
        .eq("id", rateCardId)
        .eq("company_id", company.id)
        .eq("is_active", true)
        .maybeSingle();
      if (!data) return fail("The selected rate is not available.");
    }

    const estimatedAmount = numberValue(body.estimated_amount);
    const currency = text(body.currency, 3).toUpperCase() || "SGD";
    const { data, error } = await admin
      .from("limousine_quote_requests")
      .insert({
        company_id: company.id,
        customer_name: customerName,
        phone,
        email,
        preferred_contact: preferredContact,
        service_type: serviceType,
        trip_date: tripDate,
        pickup_time: pickupTime,
        pickup_location: pickupLocation,
        dropoff_location: dropoffLocation,
        return_trip: booleanValue(body.return_trip),
        passengers: Math.min(100, Math.max(1, integer(body.passengers, 1))),
        luggage: Math.min(100, Math.max(0, integer(body.luggage, 0))),
        vehicle_type_id: vehicleTypeId,
        rate_card_id: rateCardId,
        estimated_amount: estimatedAmount === null ? null : Math.max(0, estimatedAmount),
        currency: /^[A-Z]{3}$/.test(currency) ? currency : "SGD",
        special_requests: nullableText(body.special_requests, 3000),
        consent_accepted: true,
        consented_at: new Date().toISOString(),
        source: "public_website",
        status: "new",
      })
      .select("public_reference")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, reference_no: data.public_reference });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to save quotation request.", 500);
  }
}
