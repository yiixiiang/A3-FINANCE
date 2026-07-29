import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const DEFAULT_VEHICLES = ["4 Seater Sedan", "6 Seater MPV", "7 Seater Maxi Cab", "Alphard / Vellfire", "13 Seater Minibus", "23 Seater Mini Coach", "45 Seater Coach"];
const DEFAULT_RATES = [
  { service: "Airport Arrival", tripType: "Per Trip", values: ["70", "80", "80", "90", "90", "170"], status: "Active" },
  { service: "Airport Departure", tripType: "Per Trip", values: ["65", "75", "75", "80", "85", "160"], status: "Active" },
  { service: "Point to Point", tripType: "Per Trip", values: ["60", "70", "70", "75", "80", "150"], status: "Active" },
  { service: "Hourly Disposal (minimum 3 hours)", tripType: "Per Hour", values: ["55", "65", "65", "75", "70", "120"], status: "Active" },
  { service: "Cross Border SG to JB (from)", tripType: "Per Trip", values: ["220", "250", "280", "320", "380", "480"], status: "Active" },
];

const serviceType = (value: string) =>
  ({
    "Airport Arrival": "airport_arrival",
    "Airport Departure": "airport_departure",
    "Point to Point": "point_to_point",
    "Hourly Disposal": "hourly_disposal",
    "Hourly Disposal (minimum 3 hours)": "hourly_disposal",
    "Cross Border SG to JB": "sg_jb",
    "Cross Border SG to JB (from)": "sg_jb",
  } as Record<string, string>)[value] || value.toLowerCase().replace(/[^a-z0-9]+/g, "_");

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("Finance cloud is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  try {
    const supabase = client();
    const keys = [
      "a3-rate-management-vehicles-v1",
      "a3-rate-management-vehicle-rules-v1",
      "a3-limousine-fleet-v1",
      "a3-limousine-additional-charges-v1",
    ];

    const { data, error } = await supabase
      .from("a3_app_storage")
      .select("storage_key,value,updated_at,user_id")
      .in("storage_key", keys)
      .order("updated_at", { ascending: false });
    if (error) throw error;

    const rows = (data || []) as Array<{ storage_key: string; value: unknown; updated_at: string | null; user_id: string }>;
    const values: Record<string, unknown> = {};
    for (const row of rows) {
      if (!(row.storage_key in values)) values[row.storage_key] = row.value;
    }

    const rawNames = values[keys[0]];
    const names: string[] = Array.isArray(rawNames) ? rawNames.map((value: unknown) => String(value)) : DEFAULT_VEHICLES;

    const rawFleet = values[keys[2]];
    const fleet: any[] = Array.isArray(rawFleet)
      ? (rawFleet as any[])
      : names.map((name, index) => ({
          id: `VEH-${index + 1}`,
          name,
          passengerCapacity: Number(name.match(/\d+/)?.[0] || 0),
          luggageCapacity: 0,
          description: "Premium chauffeur vehicle",
          imageUrl: "",
          status: "Active",
          displayOrder: index + 1,
        }));

    const activeFleet = fleet
      .filter((item) => item.status !== "Inactive")
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));

    const vehicleTypes = names.map((name, index) => {
      const detail = activeFleet.find((item) => String(item.name || "").trim().toLowerCase() === name.trim().toLowerCase()) || activeFleet[index] || {};
      return {
        id: index + 1,
        name,
        passenger_capacity: Number(detail.passengerCapacity || 0) || null,
        luggage_capacity: Number(detail.luggageCapacity || 0) || null,
        description: String(detail.description || ""),
        image_url: String(detail.imageUrl || ""),
      };
    });

    const rawRules = values[keys[1]];
    const rules: any[] = Array.isArray(rawRules) ? (rawRules as any[]) : DEFAULT_RATES;
    const rateCards = rules
      .filter((rule) => rule.status !== "Inactive")
      .flatMap((rule) =>
        names.map((_, index) => ({
          id: `${serviceType(String(rule.service || "service"))}-${index + 1}`,
          vehicle_type_id: index + 1,
          name: String(rule.service || ""),
          service_type: serviceType(String(rule.service || "")),
          pricing_method: rule.tripType === "Per Hour" ? "per_hour" : rule.tripType === "Per Seat" ? "per_seat" : "per_trip",
          base_amount: Number(rule.values?.[index] || 0),
          currency: "SGD",
          minimum_hours: serviceType(String(rule.service || "")) === "hourly_disposal" ? 3 : null,
          vehicle: vehicleTypes[index],
        })),
      );

    const rawCharges = values[keys[3]];
    const charges = (Array.isArray(rawCharges) ? (rawCharges as any[]) : [])
      .filter((item) => item.status !== "Inactive")
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0))
      .map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        charge_type: String(item.chargeType || "Fixed").toLowerCase().replace(/\s+/g, "_"),
        amount: Number(item.amount || 0),
        currency: "SGD",
        description: item.description || "",
        is_percentage: String(item.chargeType || "").toLowerCase() === "percentage",
      }));

    return NextResponse.json(
      {
        source: "A3 Finance",
        currency: "SGD",
        updated_at: rows.map((row) => row.updated_at).filter(Boolean).sort().at(-1) || null,
        vehicle_types: vehicleTypes,
        rate_cards: rateCards,
        additional_charges: charges,
      },
      { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to publish rates." }, { status: 500 });
  }
}
