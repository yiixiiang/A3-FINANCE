import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMO_KEY = "a3-limousine-website-bookings-v1";
const SAKURA_KEY = "a3-sakura-website-bookings-v1";

type BookingKind = "limousine" | "sakura";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("Finance cloud is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function ownerId(supabase: ReturnType<typeof client>) {
  const preferred = (process.env.PRIMARY_ADMIN_EMAIL || "").toLowerCase();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) throw error;
  const user = (preferred ? data.users.find(item => item.email?.toLowerCase() === preferred) : undefined) || data.users[0];
  if (!user) throw new Error("No Finance owner account exists.");
  return user.id;
}

async function readList(supabase: ReturnType<typeof client>, userId: string, key: string) {
  const { data, error } = await supabase.from("a3_app_storage").select("value").eq("user_id", userId).eq("storage_key", key).maybeSingle();
  if (error) throw error;
  return Array.isArray(data?.value) ? data.value : [];
}

async function writeList(supabase: ReturnType<typeof client>, userId: string, key: string, value: unknown[]) {
  const { error } = await supabase.from("a3_app_storage").upsert({ user_id: userId, storage_key: key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,storage_key" });
  if (error) throw error;
}

function keyFor(kind: BookingKind) { return kind === "sakura" ? SAKURA_KEY : LIMO_KEY; }

export async function GET() {
  try {
    const supabase = client();
    const userId = await ownerId(supabase);
    const [limousine, sakura] = await Promise.all([readList(supabase, userId, LIMO_KEY), readList(supabase, userId, SAKURA_KEY)]);
    return NextResponse.json({ ok: true, bookings: [
      ...limousine.map((item: any) => ({ ...item, kind: "limousine" })),
      ...sakura.map((item: any) => ({ ...item, kind: "sakura" })),
    ] });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Unable to load bookings." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const kind: BookingKind = body.kind === "sakura" ? "sakura" : "limousine";
    const reference = String(body.reference || body.id || "").trim();
    if (!reference) return NextResponse.json({ ok: false, message: "Booking reference is required." }, { status: 400 });
    const supabase = client();
    const userId = await ownerId(supabase);
    const key = keyFor(kind);
    const list = await readList(supabase, userId, key);
    const index = list.findIndex((item: any) => String(item.reference || item.id) === reference);
    if (index < 0) return NextResponse.json({ ok: false, message: "Booking not found." }, { status: 404 });
    const allowed = ["status", "driver", "amount", "notes", "table", "depositStatus", "paymentStatus"];
    const updates = Object.fromEntries(allowed.filter(field => field in body).map(field => [field, body[field]]));
    list[index] = { ...list[index], ...updates, updatedAt: new Date().toISOString() };
    await writeList(supabase, userId, key, list);
    return NextResponse.json({ ok: true, booking: { ...list[index], kind } });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Unable to update booking." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const kind: BookingKind = body.kind === "sakura" ? "sakura" : "limousine";
    const reference = String(body.reference || body.id || "").trim();
    if (!reference) return NextResponse.json({ ok: false, message: "Booking reference is required." }, { status: 400 });
    const supabase = client();
    const userId = await ownerId(supabase);
    const key = keyFor(kind);
    const list = await readList(supabase, userId, key);
    const next = list.filter((item: any) => String(item.reference || item.id) !== reference);
    if (next.length === list.length) return NextResponse.json({ ok: false, message: "Booking not found." }, { status: 404 });
    await writeList(supabase, userId, key, next);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Unable to delete booking." }, { status: 500 });
  }
}
