import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const VEHICLE_KEY = "a3-rate-management-vehicles-v1";
const RULES_KEY = "a3-rate-management-vehicle-rules-v1";

type ManagedRateRule = {
  service: string;
  tripType: "Per Trip" | "Per Hour" | "Per Seat";
  values: string[];
  status: "Active" | "Inactive";
};

type StorageRow = {
  storage_key: string;
  value: unknown;
  updated_at?: string | null;
};

const isRemovedPublicVehicle = (value: unknown) => /\b(?:23|45)\s*seater\b/i.test(String(value || ""));

const defaultVehicles = [
  "5 Seater",
  "7 Seater",
  "5 Seater Premium",
  "7 Seater Premium",
  "13 Seater",
];

const defaultRules: ManagedRateRule[] = [
  { service: "Airport Arrival", tripType: "Per Trip", values: ["65","75","95","110","130","180"], status: "Active" },
  { service: "Airport Departure", tripType: "Per Trip", values: ["60","70","90","105","125","175"], status: "Active" },
  { service: "Point to Point", tripType: "Per Trip", values: ["55","65","85","100","120","165"], status: "Active" },
  { service: "Hourly Disposal (minimum 3 hours)", tripType: "Per Hour", values: ["60","70","90","105","120","160"], status: "Active" },
  { service: "Cross Border SG to JB (from)", tripType: "Per Trip", values: ["220","250","300","330","380","480"], status: "Active" },
  { service: "Midnight Charges 00:00 - 06:30", tripType: "Per Trip", values: ["15","20","25","30","35","45"], status: "Active" },
  { service: "Child Seat 1-7 Year Old", tripType: "Per Seat", values: ["15","15","18","18","20","20"], status: "Active" },
  { service: "Singapore Postal Code Start 60-80", tripType: "Per Trip", values: ["10","10","12","12","15","20"], status: "Active" },
  { service: "Special Rates · Hourly Disposal", tripType: "Per Hour", values: ["50","60","80","95","110","145"], status: "Active" },
];

function serviceType(service: string) {
  const text = service.toLowerCase();
  if (text.includes("arrival")) return "airport_arrival";
  if (text.includes("departure")) return "airport_departure";
  if (text.includes("point to point")) return "point_to_point";
  if (text.includes("hourly")) return "hourly_disposal";
  if (text.includes("cross border") || text.includes("sg to jb")) return "sg_jb";
  if (text.includes("midnight")) return "midnight_surcharge";
  if (text.includes("child seat")) return "child_seat";
  if (text.includes("postal")) return "postal_surcharge";
  return service.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function pricingMethod(tripType: ManagedRateRule["tripType"]) {
  if (tripType === "Per Hour") return "per_hour";
  if (tripType === "Per Seat") return "per_seat";
  return "per_trip";
}

function latestValue(rows: StorageRow[], key: string) {
  return rows
    .filter((row) => row.storage_key === key)
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0];
}

function headers() {
  return {
    "Access-Control-Allow-Origin": "https://limousine.a3group.sg",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: headers() });
}

export async function GET() {
  let vehicles = defaultVehicles;
  let rules = defaultRules;
  let updatedAt: string | null = null;
  let source = "fallback";

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data, error } = await supabase
        .from("a3_app_storage")
        .select("storage_key,value,updated_at")
        .in("storage_key", [VEHICLE_KEY, RULES_KEY])
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const rows = (data || []) as StorageRow[];
      const vehicleRow = latestValue(rows, VEHICLE_KEY);
      const rulesRow = latestValue(rows, RULES_KEY);

      if (Array.isArray(vehicleRow?.value) && vehicleRow!.value.length) {
        vehicles = vehicleRow!.value.map(String).filter((name) => !isRemovedPublicVehicle(name));
      }
      if (Array.isArray(rulesRow?.value) && rulesRow!.value.length) {
        rules = (rulesRow!.value as ManagedRateRule[]).filter(
          (rule) => rule && rule.status !== "Inactive" && Array.isArray(rule.values),
        );
      }

      updatedAt =
        [vehicleRow?.updated_at, rulesRow?.updated_at]
          .filter(Boolean)
          .sort()
          .at(-1) || null;
      source = "a3-finance";
    }
  } catch (error) {
    console.error("Rate matrix API:", error);
  }

  vehicles = vehicles.filter((name) => !isRemovedPublicVehicle(name));

  const vehicle_types = vehicles.map((name, index) => ({
    id: index + 1,
    code: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    passenger_capacity: Number(name.match(/\d+/)?.[0] || 0) || null,
    luggage_capacity: null,
  }));

  let id = 1;
  const rate_cards = rules.flatMap((rule) =>
    vehicles.map((vehicle, index) => ({
      id: id++,
      vehicle_type_id: index + 1,
      name: `${rule.service} · ${vehicle}`,
      service_type: serviceType(rule.service),
      pricing_method: pricingMethod(rule.tripType),
      base_amount: Number(rule.values[index] || 0),
      currency: "SGD",
      minimum_hours: rule.tripType === "Per Hour" ? 3 : null,
      included_hours: null,
      additional_hour_amount: null,
      notes: rule.tripType,
      vehicle: vehicle_types[index],
    })),
  );

  return NextResponse.json(
    {
      source,
      updated_at: updatedAt,
      currency: "SGD",
      vehicle_types,
      rate_cards,
      matrix: { vehicles, rules },
      contact: { whatsapp: "6584849004", telegram: null, wechat: null },
    },
    { headers: headers() },
  );
}
