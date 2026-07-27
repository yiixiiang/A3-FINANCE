import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("Supabase server environment variables are missing.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function ownerId(supabase: ReturnType<typeof adminClient>): Promise<string> {
  const preferred = (process.env.PRIMARY_ADMIN_EMAIL || "").toLowerCase();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (error) throw error;
  const user = (preferred ? data.users.find(item => item.email?.toLowerCase() === preferred) : undefined) || data.users[0];
  if (!user) throw new Error("No Supabase Auth user exists. Create one user first (GitHub login is fine).");
  return user.id;
}

function ok(data: unknown = {}) { return NextResponse.json({ ok: true, ...((data as object) || {}) }); }
function fail(error: unknown, status = 500) { return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : String(error) }, { status }); }

export async function GET() {
  try {
    const supabase = adminClient();
    const userId = await ownerId(supabase);
    const [{ count: storageCount, error: se }, { count: backupCount, error: be }, { count: auditCount, error: ae }] = await Promise.all([
      supabase.from("a3_app_storage").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("a3_app_backups").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("a3_app_audit").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    if (se) throw se;
    return ok({ configured: true, storageCount: storageCount || 0, backupCount: be ? 0 : backupCount || 0, auditCount: ae ? 0 : auditCount || 0 });
  } catch (error) { return fail(error); }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action || "");
    const supabase = adminClient();
    const userId = await ownerId(supabase);
    if (action === "pull") {
      const { data, error } = await supabase.from("a3_app_storage").select("storage_key,value,updated_at").eq("user_id", userId);
      if (error) throw error;
      return ok({ records: data || [] });
    }
    if (action === "push") {
      const records = Array.isArray(body.records) ? body.records : [];
      if (records.length) {
        const rows = records.map((r: any) => ({ user_id: userId, storage_key: String(r.storage_key), value: r.value, updated_at: new Date().toISOString() }));
        const { error } = await supabase.from("a3_app_storage").upsert(rows, { onConflict: "user_id,storage_key" });
        if (error) throw error;
      }
      return ok({ count: records.length });
    }
    if (action === "backup") {
      const { data: storage, error: readError } = await supabase.from("a3_app_storage").select("storage_key,value").eq("user_id", userId);
      if (readError) throw readError;
      const payload = Object.fromEntries((storage || []).map(row => [row.storage_key, row.value]));
      const { data, error } = await supabase.from("a3_app_backups").insert({ user_id: userId, reason: String(body.reason || "manual"), key_count: Object.keys(payload).length, device_id: String(body.deviceId || "server"), app_version: 30, payload }).select("id,created_at,reason,key_count,device_id").single();
      if (error) throw error;
      return ok({ backup: data });
    }
    if (action === "list-backups") {
      const { data, error } = await supabase.from("a3_app_backups").select("id,created_at,reason,key_count,device_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return ok({ backups: data || [] });
    }
    if (action === "restore-backup") {
      const { data, error } = await supabase.from("a3_app_backups").select("payload").eq("user_id", userId).eq("id", String(body.backupId)).single();
      if (error) throw error;
      return ok({ payload: data.payload || {} });
    }
    if (action === "list-audit") {
      const { data, error } = await supabase.from("a3_app_audit").select("id,created_at,action,storage_key,device_id,details").eq("user_id", userId).order("created_at", { ascending: false }).limit(Number(body.limit || 50));
      if (error) throw error;
      return ok({ entries: data || [] });
    }
    if (action === "audit") {
      const events = Array.isArray(body.events) ? body.events : [];
      if (events.length) {
        const { error } = await supabase.from("a3_app_audit").insert(events.map((e: any) => ({ ...e, user_id: userId, app_version: 30 })));
        if (error) throw error;
      }
      return ok({ count: events.length });
    }
    if (action === "clear-audit") {
      const { error } = await supabase.from("a3_app_audit").delete().eq("user_id", userId);
      if (error) throw error;
      return ok();
    }
    return fail("Unknown cloud action.", 400);
  } catch (error) { return fail(error); }
}
