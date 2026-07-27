import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type VehicleRate = {
  id: string;
  vehicle_name: string;
  category: string;
  transfer_price: number | null;
  hourly_price: number | null;
  minimum_hours: number | null;
  currency: string;
  active: boolean;
  sort_order: number;
  updated_at: string;
};

const fallbackRates: VehicleRate[] = [
  {
    id: "5-seater",
    vehicle_name: "5-Seater Sedan",
    category: "EXECUTIVE",
    transfer_price: 50,
    hourly_price: 40,
    minimum_hours: 3,
    currency: "SGD",
    active: true,
    sort_order: 1,
    updated_at: new Date(0).toISOString(),
  },
  {
    id: "7-seater",
    vehicle_name: "7-Seater MPV",
    category: "PREMIUM",
    transfer_price: 60,
    hourly_price: 50,
    minimum_hours: 3,
    currency: "SGD",
    active: true,
    sort_order: 2,
    updated_at: new Date(0).toISOString(),
  },
  {
    id: "luxury-mpv",
    vehicle_name: "Luxury MPV",
    category: "VIP",
    transfer_price: null,
    hourly_price: null,
    minimum_hours: null,
    currency: "SGD",
    active: true,
    sort_order: 3,
    updated_at: new Date(0).toISOString(),
  },
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://limousine.a3group.sg",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceKey) {
      return NextResponse.json(
        {
          source: "fallback",
          currency: "SGD",
          updatedAt: null,
          rates: fallbackRates,
          warning: "Supabase environment variables are missing.",
        },
        { headers: corsHeaders() }
      );
    }

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("vehicle_rates")
      .select(
        "id,vehicle_name,category,transfer_price,hourly_price,minimum_hours,currency,active,sort_order,updated_at"
      )
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const rates = (data ?? []) as VehicleRate[];

    return NextResponse.json(
      {
        source: "supabase",
        currency: rates[0]?.currency ?? "SGD",
        updatedAt: rates.reduce<string | null>(
          (latest, row) =>
            !latest || row.updated_at > latest ? row.updated_at : latest,
          null
        ),
        rates: rates.length ? rates : fallbackRates,
      },
      { headers: corsHeaders() }
    );
  } catch (error) {
    console.error("Public vehicle rate API error:", error);

    return NextResponse.json(
      {
        source: "fallback",
        currency: "SGD",
        updatedAt: null,
        rates: fallbackRates,
        warning: "Live rates are temporarily unavailable.",
      },
      { headers: corsHeaders() }
    );
  }
}
