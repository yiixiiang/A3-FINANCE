import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const DEFAULT_VEHICLES = ["4 Seater Sedan", "6 Seater MPV", "7 Seater Maxi Cab", "Alphard / Vellfire", "13 Seater Minibus"];
const isRemovedPublicVehicle = (value: unknown) => /\b(?:23|45)\s*seater\b/i.test(String(value || ""));
const DEFAULT_RATES = [
  { service: "Airport Arrival", tripType: "Per Trip", values: ["70", "80", "80", "90", "90"], status: "Active" },
  { service: "Airport Departure", tripType: "Per Trip", values: ["65", "75", "75", "80", "85"], status: "Active" },
  { service: "Point to Point", tripType: "Per Trip", values: ["60", "70", "70", "75", "80"], status: "Active" },
  { service: "Hourly Disposal (minimum 3 hours)", tripType: "Per Hour", values: ["55", "65", "65", "75", "70"], status: "Active" },
  { service: "Cross Border SG to JB (from)", tripType: "Per Trip", values: ["220", "250", "280", "320", "380"], status: "Active" },
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
    const rateNames: string[] = Array.isArray(rawNames) ? rawNames.map((value: unknown) => String(value).trim()).filter((name) => Boolean(name) && !isRemovedPublicVehicle(name)) : DEFAULT_VEHICLES;

    const rawFleet = values[keys[2]];
    const fleet: any[] = Array.isArray(rawFleet)
      ? (rawFleet as any[])
      : rateNames.map((name, index) => ({
          id: `VEH-${index + 1}`,
          name,
          passengerCapacity: Number(name.match(/\d+/)?.[0] || 0),
          luggageCapacity: 0,
          description: "Premium chauffeur vehicle",
          imageUrl: "",
          status: "Active",
          displayOrder: index + 1,
        }));

    const allActiveFleet = fleet
      .filter((item) => String(item.status || "Active").toLowerCase() !== "inactive" && !isRemovedPublicVehicle(item.name))
      .sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));

    const normal = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    // Fleet & Vehicle Photos is the only public vehicle-name source.
    // Do not suppress legacy-looking names: names such as "7 Seater Maxi Cab"
    // may be intentional, active fleet entries. Exact normalized duplicates are
    // removed below, while every distinct active fleet vehicle is published.
    const activeFleet: any[] = [];
    const seenFleetNames = new Set<string>();
    for (const item of allActiveFleet) {
      const key = normal(item.name);
      if (!key || seenFleetNames.has(key)) continue;
      seenFleetNames.add(key);
      activeFleet.push(item);
    }

    // Fleet & Vehicle Photos is the single source of truth for public names.
    const publicFleet = activeFleet.length
      ? activeFleet
      : rateNames.map((name, index) => ({
          id: `VEH-${index + 1}`,
          name,
          passengerCapacity: Number(name.match(/\d+/)?.[0] || 0),
          luggageCapacity: 0,
          description: "Premium chauffeur vehicle",
          imageUrl: "",
          status: "Active",
          displayOrder: index + 1,
        }));

    const names = publicFleet.map((item) => String(item.name || "").trim()).filter(Boolean);
    const vehicleTypes = publicFleet.map((detail, index) => ({
      id: index + 1,
      name: String(detail.name || "").trim(),
      passenger_capacity: Number(detail.passengerCapacity || 0) || null,
      luggage_capacity: Number(detail.luggageCapacity || 0) || null,
      description: String(detail.description || ""),
      image_url: String(detail.imageUrl || ""),
    }));

    const rateAliases: Record<string, string[]> = {
      "5 seater": ["5 seater", "4 seater sedan"],
      "7 seater": ["7 seater", "6 seater mpv"],
      "5 seater premium": ["5 seater premium", "7 seater maxi cab"],
      "7 seater premium": ["7 seater premium", "alphard vellfire"],
      "13 seater": ["13 seater", "13 seater minibus"],
    };
    const findRateIndex = (vehicleName: string, publicIndex: number) => {
      const key = normal(vehicleName);
      const candidates = rateAliases[key] || [key];
      for (const candidate of candidates) {
        const found = rateNames.findIndex((name) => normal(name) === candidate);
        if (found >= 0) return found;
      }
      return publicIndex < rateNames.length ? publicIndex : -1;
    };

    const rawRules = values[keys[1]];
    const rules: any[] = Array.isArray(rawRules) ? (rawRules as any[]) : DEFAULT_RATES;
    const rateCards = rules
      .filter((rule) => rule.status !== "Inactive")
      .flatMap((rule) =>
        names.map((vehicleName, index) => {
          const rateIndex = findRateIndex(vehicleName, index);
          return {
          id: `${serviceType(String(rule.service || "service"))}-${index + 1}`,
          vehicle_type_id: index + 1,
          name: String(rule.service || ""),
          service_type: serviceType(String(rule.service || "")),
          pricing_method: rule.tripType === "Per Hour" ? "per_hour" : rule.tripType === "Per Seat" ? "per_seat" : "per_trip",
          base_amount: rateIndex >= 0 ? Number(rule.values?.[rateIndex] || 0) : 0,
          currency: "SGD",
          minimum_hours: serviceType(String(rule.service || "")) === "hourly_disposal" ? 3 : null,
          vehicle: vehicleTypes[index],
        };
        }),
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
