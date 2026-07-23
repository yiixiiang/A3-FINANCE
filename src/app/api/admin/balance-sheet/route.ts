import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildBalanceSheet } from "@/lib/finance-reporting";

export const dynamic = "force-dynamic";

type Payload = {
  action?: "save_account" | "save_entry" | "void_entry" | "save_snapshot" | "finalise_snapshot" | "reopen_snapshot";
  id?: number;
  company_id?: number;
  account_id?: number;
  account_code?: string;
  account_name?: string;
  account_group?: "current_asset" | "non_current_asset" | "current_liability" | "non_current_liability" | "equity";
  is_contra?: boolean;
  is_active?: boolean;
  sort_order?: number;
  description?: string;
  entry_date?: string;
  reference?: string;
  entry_side?: "debit" | "credit";
  amount?: number;
  notes?: string;
  reason?: string;
  as_of_date?: string;
};

const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
const integer = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const dateValue = (value: unknown) => {
  const text = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};
const text = (value: unknown) => String(value ?? "").trim();
const decimal = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

async function administratorSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role,status").eq("id", user.id).maybeSingle();
  if (profile?.role !== "administrator" || profile.status !== "active") return null;
  return { supabase, user };
}

async function audit(admin: ReturnType<typeof createAdminClient>, companyId: number, userId: string, eventType: string, description: string, details: Record<string, unknown>) {
  await admin.from("finance_audit_events").insert({
    company_id: companyId,
    event_type: eventType,
    module_name: "balance_sheet",
    description,
    details,
    actor_user_id: userId,
  });
}

export async function GET(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);
  const companyId = integer(request.nextUrl.searchParams.get("company_id"));
  const asOfDate = dateValue(request.nextUrl.searchParams.get("as_of"));
  const comparisonDate = dateValue(request.nextUrl.searchParams.get("comparison_as_of"));

  try {
    const admin = createAdminClient();
    if (!companyId || !asOfDate) {
      const [companies, accounts, entries, snapshots] = await Promise.all([
        admin.from("companies").select("id,name,status,base_currency,company_type").order("name"),
        admin.from("bs_accounts").select("*").order("company_id").order("sort_order").order("account_code"),
        admin.from("bs_manual_entries").select("*").order("entry_date", { ascending: false }).order("id", { ascending: false }).limit(500),
        admin.from("bs_report_snapshots").select("*").order("as_of_date", { ascending: false }).limit(200),
      ]);
      const error = companies.error ?? accounts.error ?? entries.error ?? snapshots.error;
      if (error) return fail(error.message, 500);
      return NextResponse.json({
        companies: companies.data ?? [],
        accounts: accounts.data ?? [],
        manual_entries: entries.data ?? [],
        snapshots: snapshots.data ?? [],
      });
    }

    const current = await buildBalanceSheet(admin, companyId, asOfDate);
    if (!comparisonDate) return NextResponse.json({ report: current });
    const comparison = await buildBalanceSheet(admin, companyId, comparisonDate);
    const comparisonByCode = new Map(comparison.rows.map((row) => [row.account_code, row.balance]));
    const rows = current.rows.map((row) => ({
      ...row,
      comparison_balance: comparisonByCode.get(row.account_code) ?? 0,
      movement: decimal(row.balance - (comparisonByCode.get(row.account_code) ?? 0)),
    }));
    return NextResponse.json({ report: { ...current, rows, comparison_as_of_date: comparisonDate, comparison_summary: comparison.summary } });
  } catch (error) {
    console.error("Balance Sheet API error", error);
    return fail(error instanceof Error ? error.message : "Unable to prepare the Balance Sheet.", 500);
  }
}

export async function POST(request: NextRequest) {
  const session = await administratorSession();
  if (!session) return fail("Administrator access is required.", 403);
  let body: Payload;
  try { body = await request.json() as Payload; } catch { return fail("Invalid request body."); }
  const admin = createAdminClient();
  const companyId = integer(body.company_id);

  try {
    if (body.action === "save_account") {
      if (!companyId) return fail("Company is required.");
      if (!text(body.account_code) || !text(body.account_name) || !body.account_group) return fail("Account code, name and group are required.");
      const id = integer(body.id);
      if (id) {
        const { data: existing, error: existingError } = await admin.from("bs_accounts").select("is_system,account_code,account_group,is_contra").eq("id", id).eq("company_id", companyId).maybeSingle();
        if (existingError) return fail(existingError.message, 500);
        if (!existing) return fail("Balance Sheet account was not found.", 404);
        const { error } = await admin.from("bs_accounts").update({
          account_code: existing.is_system ? existing.account_code : text(body.account_code).toUpperCase(),
          account_name: text(body.account_name),
          account_group: existing.is_system ? existing.account_group : body.account_group,
          is_contra: existing.is_system ? existing.is_contra : Boolean(body.is_contra),
          is_active: existing.is_system ? true : body.is_active !== false,
          sort_order: Number(body.sort_order ?? 100),
          description: text(body.description) || null,
          updated_by: session.user.id,
        }).eq("id", id).eq("company_id", companyId);
        if (error) return fail(error.message, 500);
        await audit(admin, companyId, session.user.id, "bs_account_updated", "Balance Sheet account updated.", { account_id: id });
        return NextResponse.json({ success: true, id });
      }
      const { data, error } = await admin.from("bs_accounts").insert({
        company_id: companyId,
        account_code: text(body.account_code).toUpperCase(),
        account_name: text(body.account_name),
        account_group: body.account_group,
        is_contra: Boolean(body.is_contra),
        is_active: body.is_active !== false,
        sort_order: Number(body.sort_order ?? 100),
        description: text(body.description) || null,
        created_by: session.user.id,
        updated_by: session.user.id,
      }).select("id").single();
      if (error || !data) return fail(error?.message ?? "Unable to create the Balance Sheet account.", 500);
      await audit(admin, companyId, session.user.id, "bs_account_created", "Balance Sheet account created.", { account_id: data.id });
      return NextResponse.json({ success: true, id: data.id });
    }

    if (body.action === "save_entry") {
      const accountId = integer(body.account_id);
      const entryDate = dateValue(body.entry_date);
      if (!companyId || !accountId || !entryDate || !text(body.description) || !body.entry_side || decimal(body.amount) <= 0) {
        return fail("Company, account, date, description, side and positive amount are required.");
      }
      const { data, error } = await admin.from("bs_manual_entries").insert({
        company_id: companyId,
        account_id: accountId,
        entry_date: entryDate,
        description: text(body.description),
        reference: text(body.reference) || null,
        entry_side: body.entry_side,
        amount: decimal(body.amount),
        notes: text(body.notes) || null,
        created_by: session.user.id,
        updated_by: session.user.id,
      }).select("id").single();
      if (error || !data) return fail(error?.message ?? "Unable to save the Balance Sheet entry.", 500);
      await audit(admin, companyId, session.user.id, "bs_entry_created", "Manual Balance Sheet entry created.", { entry_id: data.id });
      return NextResponse.json({ success: true, id: data.id });
    }

    if (body.action === "void_entry") {
      const id = integer(body.id);
      if (!id || !text(body.reason)) return fail("Entry and void reason are required.");
      const { data: entry } = await admin.from("bs_manual_entries").select("company_id").eq("id", id).maybeSingle();
      const { error } = await session.supabase.rpc("void_bs_manual_entry", { p_entry_id: id, p_reason: text(body.reason) });
      if (error) return fail(error.message, 500);
      if (entry?.company_id) await audit(admin, Number(entry.company_id), session.user.id, "bs_entry_voided", "Manual Balance Sheet entry voided.", { entry_id: id, reason: text(body.reason) });
      return NextResponse.json({ success: true });
    }

    if (["save_snapshot", "finalise_snapshot"].includes(String(body.action))) {
      const asOfDate = dateValue(body.as_of_date);
      if (!companyId || !asOfDate) return fail("Company and as-of date are required.");
      const report = await buildBalanceSheet(admin, companyId, asOfDate);
      if (body.action === "finalise_snapshot" && Math.abs(report.summary.variance) > 0.01) {
        return fail("Balance Sheet must balance before finalisation.");
      }
      const final = body.action === "finalise_snapshot";
      const { data, error } = await admin.from("bs_report_snapshots").upsert({
        company_id: companyId,
        as_of_date: asOfDate,
        status: final ? "final" : "draft",
        total_assets: report.summary.total_assets,
        total_liabilities: report.summary.total_liabilities,
        total_equity: report.summary.total_equity,
        variance: report.summary.variance,
        report_data: report,
        notes: text(body.notes) || null,
        finalised_by: final ? session.user.id : null,
        finalised_at: final ? new Date().toISOString() : null,
        created_by: session.user.id,
      }, { onConflict: "company_id,as_of_date" }).select("id").single();
      if (error || !data) return fail(error?.message ?? "Unable to save the Balance Sheet snapshot.", 500);
      await audit(admin, companyId, session.user.id, final ? "bs_snapshot_finalised" : "bs_snapshot_saved", final ? "Balance Sheet snapshot finalised." : "Balance Sheet snapshot saved.", { snapshot_id: data.id, as_of_date: asOfDate });
      return NextResponse.json({ success: true, id: data.id });
    }

    if (body.action === "reopen_snapshot") {
      const id = integer(body.id);
      if (!id || !text(body.reason)) return fail("Snapshot and reopen reason are required.");
      const { data, error } = await admin.from("bs_report_snapshots").update({
        status: "draft", finalised_by: null, finalised_at: null,
        notes: text(body.notes) || `Reopened: ${text(body.reason)}`,
      }).eq("id", id).select("company_id").single();
      if (error || !data) return fail(error?.message ?? "Unable to reopen the snapshot.", 500);
      await audit(admin, Number(data.company_id), session.user.id, "bs_snapshot_reopened", "Balance Sheet snapshot reopened.", { snapshot_id: id, reason: text(body.reason) });
      return NextResponse.json({ success: true });
    }

    return fail("Unknown action.");
  } catch (error) {
    console.error("Balance Sheet write error", error);
    return fail(error instanceof Error ? error.message : "Unable to update the Balance Sheet.", 500);
  }
}
