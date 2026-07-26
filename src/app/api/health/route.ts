import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
  let supabaseHost = "";

  try {
    supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";
  } catch {
    supabaseHost = "invalid";
  }

  return NextResponse.json(
    {
      ok: true,
      application: "A3 Finance",
      version: 22,
      expectedSupabaseSchema: "storage+backups-v22",
      timestamp: new Date().toISOString(),
      supabase: {
        configured: Boolean(supabaseUrl && publishableKey),
        host: supabaseHost,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
